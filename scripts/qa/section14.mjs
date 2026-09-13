import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection14() {
  console.log('\n================================================================================');
  console.log('STARTING SECTION 14 — FINAL FULL HUMAN JOURNEY (BROWSER QA)');
  console.log('================================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  // Use timestamp with random salt to guarantee global uniqueness
  const timestamp = `${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
  const testUserEmail = `maya.journey.${timestamp}@example.com`;
  const testUserName = `Maya Journey ${timestamp}`;
  const testPassword = 'Password@123456';

  const consoleErrors = [];

  try {
    // -------------------------------------------------------------------------
    // A) VISITOR / AD LANDING WITH UTM ATTRIBUTION
    // -------------------------------------------------------------------------
    console.log('>>> [PART A] VISITOR / AD LANDING');
    const contextA = await browser.createBrowserContext();
    const pageA = await contextA.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });

    pageA.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(`[Maya Console] ${msg.text()}`);
    });

    const adLandingUrl = 'http://localhost:3000/?utm_source=facebook&utm_medium=paid&utm_campaign=fb_global_match_2026';
    console.log(`[14.A] Visitor Maya clicking Facebook Ad URL:\n       ${adLandingUrl}`);
    await pageA.goto(adLandingUrl, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    // Confirm UTM parameters saved in sessionStorage
    const capturedUtm = await pageA.evaluate(() => {
      const raw = sessionStorage.getItem('heartlink_utm');
      return raw ? JSON.parse(raw) : null;
    });
    console.log('UTM parameters captured in session storage:', capturedUtm);
    if (!capturedUtm || (capturedUtm.utmCampaign !== 'fb_global_match_2026' && capturedUtm.utm_campaign !== 'fb_global_match_2026')) {
      throw new Error('UTM parameters were not properly captured from Facebook Ad click.');
    }

    // Confirm Discover loads and profile cards are present
    await pageA.waitForSelector('.group.glass-card', { timeout: 8000 });
    const cardCount = await pageA.evaluate(() => document.querySelectorAll('.group.glass-card').length);
    console.log(`Discover feed loaded with ${cardCount} profile cards.`);
    if (cardCount === 0) throw new Error('Discover feed loaded with zero profile cards.');

    // Open a profile card bio modal
    const bioOpened = await pageA.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.group.glass-card'));
      if (cards.length > 0) {
        const bioBtn = Array.from(cards[0].querySelectorAll('button')).find(b => b.innerText.includes('View Bio'));
        if (bioBtn) {
          bioBtn.click();
          return true;
        }
      }
      return false;
    });
    console.log(`Maya opened a profile bio modal: ${bioOpened}`);
    await pageA.waitForSelector('.modal-overlay', { timeout: 5000 });
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'section14_1_maya_browsing.png') });

    // Close bio modal
    await pageA.evaluate(() => {
      const closeBtn = document.querySelector('.modal-overlay button');
      if (closeBtn) closeBtn.click();
    });
    await pageA.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 5000 });
    console.log('Profile bio modal closed cleanly.');

    // -------------------------------------------------------------------------
    // B) SIGNUP THROUGH ACTUAL UI & CONFIRM AUTH STATE + REFRESH
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART B] SIGNUP & AUTHENTICATED STATE CONFIRMATION');
    console.log(`[14.B] Maya clicking Sign In to register...`);
    await pageA.evaluate(() => {
      const signBtns = Array.from(document.querySelectorAll('header button, nav button')).filter(b => b.innerText.includes('Sign In'));
      if (signBtns.length > 0) signBtns[0].click();
    });
    await pageA.waitForSelector('.modal-overlay', { timeout: 5000 });

    // Switch to Signup tab
    await pageA.evaluate(() => {
      const switchBtn = Array.from(document.querySelectorAll('.modal-overlay button')).find(b => b.innerText.includes('Sign up now'));
      if (switchBtn) switchBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // Fill signup form
    console.log(`Registering new user: ${testUserName} (${testUserEmail})...`);
    const nameInput = await pageA.waitForSelector('.modal-overlay input[placeholder*="Maya Lin"]', { timeout: 4000 });
    await nameInput.type(testUserName);

    const emailInput = await pageA.$('.modal-overlay input[type="email"]');
    await emailInput.type(testUserEmail);

    const pwdInput = await pageA.$('.modal-overlay input[type="password"]');
    await pwdInput.type(testPassword);

    // Submit form via requestSubmit to ensure native React handling
    await pageA.evaluate(() => {
      const form = document.querySelector('.modal-overlay form');
      if (form) {
        form.requestSubmit();
      } else {
        const submitBtn = document.querySelector('.modal-overlay button[type="submit"]');
        if (submitBtn) submitBtn.click();
      }
    });

    // Wait for modal dismissal
    try {
      await pageA.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 12000 });
    } catch (waitErr) {
      const errMsg = await pageA.evaluate(() => {
        const el = document.querySelector('.modal-overlay .bg-red-500\\/10');
        return el ? el.innerText : null;
      });
      console.error('Modal did not dismiss. Error in modal:', errMsg);
      throw waitErr;
    }
    console.log('Maya registered and modal dismissed.');
    await new Promise(r => setTimeout(r, 1200));

    // Confirm authenticated state
    let meData = await pageA.evaluate(async () => {
      const res = await fetch('/api/auth/me');
      return res.json();
    });
    console.log('Maya authenticated in session:', meData.data?.user?.email);
    if (!meData.success || !meData.data?.user) throw new Error('Maya is not authenticated after signup.');

    // Refresh page and confirm session persistence
    console.log('Refreshing page to verify session persistence...');
    await pageA.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    meData = await pageA.evaluate(async () => {
      const res = await fetch('/api/auth/me');
      return res.json();
    });
    console.log('Session confirmed after refresh:', meData.data?.user?.email);
    if (!meData.success || !meData.data?.user) throw new Error('Session did not persist across refresh.');

    // -------------------------------------------------------------------------
    // C) PROFILE EDIT, SAVE, REFRESH & CONFIRM PERSISTENCE
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART C] PROFILE EDIT & PERSISTENCE');
    console.log('[14.C] Navigating to Profile tab to update bio...');
    await pageA.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button')).filter(b => 
        b.innerText.includes('Profile') || b.querySelector('svg.lucide-user') || b.querySelector('img')
      );
      if (tabs.length > 0) tabs[0].click();
    });
    await new Promise(r => setTimeout(r, 1500));

    const updatedBio = 'Architect and design enthusiast living in Seattle. Passionate about art, travel, and genuine connections!';
    const textarea = await pageA.waitForSelector('textarea', { timeout: 5000 });
    await textarea.click();
    await pageA.evaluate(() => {
      const el = document.querySelector('textarea');
      if (el) el.value = '';
    });
    await textarea.type(updatedBio);
    await new Promise(r => setTimeout(r, 400));

    // Submit profile update form
    await pageA.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit();
    });
    console.log('Profile update form submitted.');
    await new Promise(r => setTimeout(r, 2000));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'section14_2_maya_profile.png') });

    // Refresh and confirm profile persistence
    console.log('Refreshing page to confirm profile persistence...');
    await pageA.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Open Profile tab again
    await pageA.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button')).filter(b => 
        b.innerText.includes('Profile') || b.querySelector('svg.lucide-user') || b.querySelector('img')
      );
      if (tabs.length > 0) tabs[0].click();
    });
    await pageA.waitForSelector('textarea', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1200));

    const verifiedBio = await pageA.evaluate(() => {
      const el = document.querySelector('textarea');
      return el ? el.value : '';
    });
    console.log('Verified bio after reload:', verifiedBio.slice(0, 50) + '...');
    if (!verifiedBio.includes('Architect and design enthusiast')) {
      throw new Error('Profile update did not persist after browser refresh.');
    }
    console.log('Profile persistence verified successfully.');

    // -------------------------------------------------------------------------
    // D) DISCOVER & LIKE DANIEL KIM THROUGH UI
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART D] DISCOVER & LIKE TARGET USER');
    console.log('[14.D] Maya switching to Discover tab...');
    await pageA.evaluate(() => {
      const discBtn = Array.from(document.querySelectorAll('header button, nav button')).find(b => b.innerText.includes('Discover'));
      if (discBtn) discBtn.click();
    });
    await pageA.waitForSelector('.group.glass-card', { timeout: 8000 });

    // Filter for Men
    console.log('Maya applying "Men" filter...');
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const menBtn = btns.find(b => b.innerText.trim() === 'Men');
      if (menBtn) menBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Maya likes Daniel Kim
    const mayaLikedDaniel = await pageA.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.group.glass-card'));
      const danielCard = cards.find(c => c.innerText.includes('Daniel Kim'));
      if (danielCard) {
        const likeBtn = Array.from(danielCard.querySelectorAll('button')).find(b => 
          b.title === 'Like' || b.querySelector('svg.lucide-heart')
        );
        if (likeBtn) {
          likeBtn.click();
          return true;
        }
      }
      return false;
    });
    console.log(`Maya liked Daniel Kim: ${mayaLikedDaniel}`);
    if (!mayaLikedDaniel) throw new Error('Could not find Daniel Kim card to like on Discover feed.');
    await new Promise(r => setTimeout(r, 1500));

    // -------------------------------------------------------------------------
    // E) SECOND USER (DANIEL KIM) IN SEPARATE BROWSER SESSION
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART E] SECOND USER SESSION (DANIEL KIM)');
    console.log('[14.E] Launching separate browser session as Daniel Kim...');
    const contextB = await browser.createBrowserContext();
    const pageB = await contextB.newPage();
    await pageB.setViewport({ width: 1280, height: 800 });

    await pageB.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Open Sign In modal
    await pageB.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('Sign In'));
    }, { timeout: 8000 });

    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageB.waitForSelector('.modal-overlay', { timeout: 8000 });

    // Click Daniel Kim instant persona login
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const danielBtn = btns.find(b => b.textContent.includes('Daniel Kim'));
      if (danielBtn) danielBtn.click();
    });
    await pageB.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Daniel Kim logged in on Session B.');
    await new Promise(r => setTimeout(r, 1500));

    // Daniel filters for Women to find Maya
    console.log(`Daniel Kim filtering for "Women" to find ${testUserName}...`);
    await pageB.waitForSelector('.group.glass-card', { timeout: 8000 });
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const womenBtn = btns.find(b => b.innerText.trim() === 'Women');
      if (womenBtn) womenBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // -------------------------------------------------------------------------
    // F) MUTUAL MATCH & CELEBRATION MODAL
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART F] RECIPROCAL LIKE & MUTUAL MATCH');
    const danielLikedMaya = await pageB.evaluate((mayaName) => {
      const cards = Array.from(document.querySelectorAll('.group.glass-card'));
      const mayaCard = cards.find(c => c.innerText.includes(mayaName));
      if (mayaCard) {
        const likeBtn = Array.from(mayaCard.querySelectorAll('button')).find(b => 
          b.title === 'Like' || b.querySelector('svg.lucide-heart')
        );
        if (likeBtn) {
          likeBtn.click();
          return true;
        }
      }
      return false;
    }, testUserName);
    console.log(`Daniel liked Maya back: ${danielLikedMaya}`);
    if (!danielLikedMaya) throw new Error(`Daniel Kim could not find ${testUserName} to like back.`);

    // Confirm Match celebration modal appears
    await pageB.waitForSelector('.modal-overlay', { timeout: 8000 });
    const matchModalText = await pageB.evaluate(() => document.querySelector('.modal-overlay')?.innerText || '');
    const isMatchModal = /Match/i.test(matchModalText);
    console.log('Match celebration modal displayed:', isMatchModal, `("${matchModalText.slice(0, 30).replace(/\n/g, ' ')}...")`);
    if (!isMatchModal) throw new Error('Match modal did not appear on mutual like.');
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'section14_3_daniel_matched.png') });

    // Click "Send a Message" on celebration modal
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const sendBtn = btns.find(b => b.innerText.includes('Send a Message'));
      if (sendBtn) sendBtn.click();
    });
    await pageB.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Daniel transitioned to Messenger.');
    await new Promise(r => setTimeout(r, 1500));

    // -------------------------------------------------------------------------
    // G) MESSENGER TWO-WAY REAL CHAT WITH POLLING & PERSISTENCE
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART G] MESSENGER REAL-TIME CHAT & PERSISTENCE');
    await pageB.waitForSelector('.divide-y button', { timeout: 8000 });

    // Select Maya in Daniel's conversation list
    console.log(`Daniel selecting ${testUserName} in conversation list...`);
    const danielSelectedMaya = await pageB.evaluate((name) => {
      const btns = Array.from(document.querySelectorAll('.divide-y button'));
      const mayaBtn = btns.find(b => b.textContent.includes(name));
      if (mayaBtn) {
        mayaBtn.click();
        return true;
      }
      return false;
    }, testUserName);
    console.log(`Daniel selected Maya's conversation: ${danielSelectedMaya}`);
    if (!danielSelectedMaya) throw new Error(`Could not find conversation for ${testUserName} in Daniel's list.`);
    await new Promise(r => setTimeout(r, 1000));

    await pageB.waitForSelector('input[placeholder*="Write a message"]', { timeout: 8000 });

    // Daniel sends message
    const msgFromDaniel = `Hi Maya! Delighted to connect with you on HeartLink. Hope you are having a wonderful day!`;
    console.log(`Daniel sending: "${msgFromDaniel}"...`);
    const danielInput = await pageB.waitForSelector('input[placeholder*="Write a message"]', { timeout: 5000 });
    await danielInput.click();
    await pageB.type('input[placeholder*="Write a message"]', msgFromDaniel);
    await new Promise(r => setTimeout(r, 400));

    await pageB.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Verify Daniel sees message bubble
    await pageB.waitForFunction((txt) => {
      const bubbles = Array.from(document.querySelectorAll('.rounded-2xl p'));
      return bubbles.some(b => b.innerText.includes(txt));
    }, { timeout: 8000 }, msgFromDaniel);
    console.log('Daniel sees sent message bubble in thread.');

    // Maya opens Messenger on Session A
    console.log('Maya opening Messenger on Session A...');
    await pageA.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button')).filter(b => b.innerText.includes('Messenger'));
      if (tabs.length > 0) tabs[0].click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await pageA.waitForSelector('.divide-y button', { timeout: 8000 });

    // Select Daniel in Maya's list
    console.log('Maya selecting Daniel Kim in conversation list...');
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.divide-y button'));
      const danielBtn = btns.find(b => b.textContent.includes('Daniel Kim'));
      if (danielBtn) danielBtn.click();
    });
    await pageA.waitForSelector('input[placeholder*="Write a message"]', { timeout: 8000 });

    // Maya receives Daniel's message via 3s PostgreSQL polling
    console.log('Waiting for Daniel\'s message to arrive in Maya\'s chat via polling...');
    await pageA.waitForFunction((txt) => {
      const bubbles = Array.from(document.querySelectorAll('.rounded-2xl p'));
      return bubbles.some(b => b.innerText.includes(txt));
    }, { timeout: 15000 }, msgFromDaniel);
    console.log('Maya received Daniel\'s message in real browser!');

    // Maya replies
    const replyFromMaya = `Hello Daniel! So great to meet you here. Seattle has been wonderful lately!`;
    console.log(`Maya replying: "${replyFromMaya}"...`);
    const mayaInput = await pageA.waitForSelector('input[placeholder*="Write a message"]', { timeout: 5000 });
    await mayaInput.click();
    await pageA.type('input[placeholder*="Write a message"]', replyFromMaya);
    await new Promise(r => setTimeout(r, 400));

    await pageA.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Daniel receives Maya's reply via polling
    console.log('Waiting for Maya\'s reply to arrive in Daniel\'s chat via polling...');
    await pageB.waitForFunction((txt) => {
      const bubbles = Array.from(document.querySelectorAll('.rounded-2xl p'));
      return bubbles.some(b => b.innerText.includes(txt));
    }, { timeout: 15000 }, replyFromMaya);
    console.log('Daniel received Maya\'s reply in real browser!');

    // Refresh both sessions and confirm message persistence
    console.log('Refreshing both sessions to confirm message persistence...');
    await pageA.reload({ waitUntil: 'networkidle2' });
    await pageB.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Wait for auth to be restored in both pages
    await pageA.waitForFunction(async () => {
      try {
        const res = await fetch('/api/auth/me');
        const d = await res.json();
        return !!d.data?.user;
      } catch { return false; }
    }, { timeout: 10000 });

    await pageB.waitForFunction(async () => {
      try {
        const res = await fetch('/api/auth/me');
        const d = await res.json();
        return !!d.data?.user;
      } catch { return false; }
    }, { timeout: 10000 });

    // Maya reopens Messenger
    await pageA.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button')).filter(b => b.innerText.includes('Messenger'));
      if (tabs.length > 0) tabs[0].click();
    });
    await pageA.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('.divide-y button'));
      return btns.some(b => b.textContent.includes('Daniel Kim'));
    }, { timeout: 15000 });

    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.divide-y button'));
      const danielBtn = btns.find(b => b.textContent.includes('Daniel Kim'));
      if (danielBtn) danielBtn.click();
    });
    await pageA.waitForSelector('input[placeholder*="Write a message"]', { timeout: 8000 });
    await pageA.waitForFunction((txt) => {
      const bubbles = Array.from(document.querySelectorAll('.rounded-2xl p'));
      return bubbles.some(b => b.innerText.includes(txt));
    }, { timeout: 8000 }, replyFromMaya);
    console.log('Messages persisted in Maya\'s thread after reload.');

    // Daniel reopens Messenger
    await pageB.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button')).filter(b => b.innerText.includes('Messenger'));
      if (tabs.length > 0) tabs[0].click();
    });
    await pageB.waitForFunction((mayaName) => {
      const btns = Array.from(document.querySelectorAll('.divide-y button'));
      return btns.some(b => b.textContent.includes(mayaName));
    }, { timeout: 15000 }, testUserName);

    await pageB.evaluate((name) => {
      const btns = Array.from(document.querySelectorAll('.divide-y button'));
      const mayaBtn = btns.find(b => b.textContent.includes(name));
      if (mayaBtn) mayaBtn.click();
    }, testUserName);
    await pageB.waitForSelector('input[placeholder*="Write a message"]', { timeout: 8000 });
    await pageB.waitForFunction((txt) => {
      const bubbles = Array.from(document.querySelectorAll('.rounded-2xl p'));
      return bubbles.some(b => b.innerText.includes(txt));
    }, { timeout: 8000 }, msgFromDaniel);
    console.log('Messages persisted in Daniel\'s thread after reload.');

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'section14_4_chat_maya_view.png') });
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'section14_5_chat_daniel_view.png') });

    // -------------------------------------------------------------------------
    // H) ADMIN CRM INSPECTION & MASTER ACCESS
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART H] ADMIN CRM LOGIN & INSPECTION');
    console.log('[14.H] Admin logging into CRM portal...');
    const contextAdmin = await browser.createBrowserContext();
    const pageAdmin = await contextAdmin.newPage();
    await pageAdmin.setViewport({ width: 1440, height: 900 });

    await pageAdmin.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const hasAside = await pageAdmin.$('aside');
    if (!hasAside) {
      const btns = await pageAdmin.$$('button');
      for (const btn of btns) {
        const text = await pageAdmin.evaluate(el => el.textContent, btn);
        if (text && text.includes('Super Admin')) {
          await btn.click();
          break;
        }
      }
      await pageAdmin.waitForSelector('aside', { timeout: 10000 });
    }
    console.log('Admin logged into CRM.');
    await new Promise(r => setTimeout(r, 1500));

    // Confirm Admin finds Maya in User Management (Section 9 proven CDP pattern)
    console.log('Admin navigating to User Management tab...');
    const asideButtons = await pageAdmin.$$('aside button');
    let usersTabClicked = false;
    for (const btn of asideButtons) {
      const text = await pageAdmin.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        usersTabClicked = true;
        break;
      }
    }
    console.log(`Users tab button clicked via CDP: ${usersTabClicked}`);
    if (!usersTabClicked) throw new Error('Could not find User Management button in sidebar.');
    await new Promise(r => setTimeout(r, 2000));

    await pageAdmin.waitForSelector('table', { timeout: 10000 });
    await pageAdmin.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, { timeout: 15000 });

    const mayaAdminInfo = await pageAdmin.evaluate((mayaName) => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const mayaRow = rows.find(r => r.innerText.includes(mayaName));
      if (mayaRow) {
        return {
          found: true,
          rowText: mayaRow.innerText,
          hasSarah: mayaRow.innerText.includes('Sarah')
        };
      }
      return { found: false };
    }, testUserName);
    console.log('Admin verified user existence & attribution in User Management:', mayaAdminInfo);
    if (!mayaAdminInfo.found) throw new Error(`${testUserName} not found in Admin User Management table.`);
    if (!mayaAdminInfo.hasSarah) throw new Error('Maya was not auto-assigned to Sarah from campaign routing.');

    // Confirm Admin can inspect the conversation in Master Inbox
    console.log('Admin inspecting conversation in Master Inbox...');
    const asideButtonsInbox = await pageAdmin.$$('aside button');
    for (const btn of asideButtonsInbox) {
      const text = await pageAdmin.evaluate(el => el.textContent, btn);
      if (text && text.includes('Master Inbox')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));

    await pageAdmin.waitForSelector('.divide-y button', { timeout: 8000 });
    await pageAdmin.waitForFunction((mayaName) => {
      const btns = Array.from(document.querySelectorAll('.divide-y button'));
      return btns.some(b => b.innerText.includes(mayaName) || b.innerText.includes('Daniel Kim'));
    }, { timeout: 15000 }, testUserName);

    const convInspected = await pageAdmin.evaluate((mayaName) => {
      const btns = Array.from(document.querySelectorAll('.divide-y button'));
      const convBtn = btns.find(b => b.innerText.includes(mayaName) || b.innerText.includes('Daniel Kim'));
      if (convBtn) {
        convBtn.click();
        return true;
      }
      return false;
    }, testUserName);
    console.log(`Admin inspected conversation in Master Inbox: ${convInspected}`);
    if (!convInspected) throw new Error('Admin could not find conversation in Master Inbox.');
    await new Promise(r => setTimeout(r, 1500));

    // Verify messages visible to Admin
    const adminSeesMsgs = await pageAdmin.evaluate((msg) => {
      return document.body.innerText.includes(msg);
    }, msgFromDaniel);
    console.log(`Admin sees real chat messages: ${adminSeesMsgs}`);

    // -------------------------------------------------------------------------
    // I) AGENT ASSIGNMENT & RBAC ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART I] AGENT ASSIGNMENT & RBAC ISOLATION');
    console.log('Admin switching back to User Management to reassign Maya...');
    const asideButtonsReassign = await pageAdmin.$$('aside button');
    for (const btn of asideButtonsReassign) {
      const text = await pageAdmin.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
    await pageAdmin.waitForSelector('table', { timeout: 10000 });
    await pageAdmin.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, { timeout: 15000 });

    // Open Assign modal on Maya's row
    const assignClicked = await pageAdmin.evaluate((mayaName) => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const mayaRow = rows.find(r => r.innerText.includes(mayaName));
      if (mayaRow) {
        const assignBtn = Array.from(mayaRow.querySelectorAll('button')).find(b => b.innerText.includes('Assign'));
        if (assignBtn) {
          assignBtn.click();
          return true;
        }
      }
      return false;
    }, testUserName);
    console.log(`Admin clicked Assign on Maya: ${assignClicked}`);
    await pageAdmin.waitForSelector('.modal-overlay', { timeout: 5000 });

    // Select Alex Carter
    await pageAdmin.evaluate(() => {
      const select = document.querySelector('.modal-overlay select');
      if (select) {
        const alexOpt = Array.from(select.options).find(o => o.text.includes('Alex'));
        if (alexOpt) {
          select.value = alexOpt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    // Confirm assignment
    await pageAdmin.evaluate(() => {
      const modal = document.querySelector('.modal-overlay');
      if (modal) {
        const submit = Array.from(modal.querySelectorAll('button')).find(b => 
          b.type === 'submit' || b.innerText.includes('Confirm')
        );
        if (submit) submit.click();
      }
    });
    await pageAdmin.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Reassignment confirmed to Agent Alex.');
    await new Promise(r => setTimeout(r, 1500));

    // Verify Agent Alex can see assigned user
    console.log('Logging in as Agent Alex in a new session...');
    const contextAlex = await browser.createBrowserContext();
    const pageAlex = await contextAlex.newPage();
    await pageAlex.setViewport({ width: 1280, height: 800 });
    await pageAlex.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const alexBtns = await pageAlex.$$('button');
    for (const btn of alexBtns) {
      const text = await pageAlex.evaluate(el => el.textContent, btn);
      if (text && text.includes('Alex')) {
        await btn.click();
        break;
      }
    }
    await pageAlex.waitForSelector('aside', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1500));

    // Alex navigates to User Management
    const asideButtonsAlex = await pageAlex.$$('aside button');
    for (const btn of asideButtonsAlex) {
      const text = await pageAlex.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
    await pageAlex.waitForSelector('table', { timeout: 10000 });
    await pageAlex.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    const alexSeesMaya = await pageAlex.evaluate((mayaName) => {
      return document.body.innerText.includes(mayaName);
    }, testUserName);
    console.log(`Agent Alex sees newly assigned user (${testUserName}): ${alexSeesMaya}`);
    if (!alexSeesMaya) throw new Error('Agent Alex cannot access assigned user.');

    // Verify Agent Sarah no longer sees Maya (unrelated user is inaccessible)
    console.log('Logging in as Agent Sarah to verify RBAC access revocation...');
    const contextSarah = await browser.createBrowserContext();
    const pageSarah = await contextSarah.newPage();
    await pageSarah.setViewport({ width: 1280, height: 800 });
    await pageSarah.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const sarahBtns = await pageSarah.$$('button');
    for (const btn of sarahBtns) {
      const text = await pageSarah.evaluate(el => el.textContent, btn);
      if (text && text.includes('Sarah')) {
        await btn.click();
        break;
      }
    }
    await pageSarah.waitForSelector('aside', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1500));

    // Sarah navigates to User Management
    const asideButtonsSarah = await pageSarah.$$('aside button');
    for (const btn of asideButtonsSarah) {
      const text = await pageSarah.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
    await pageSarah.waitForSelector('table', { timeout: 10000 });
    await pageSarah.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    const sarahSeesMaya = await pageSarah.evaluate((mayaName) => {
      return document.body.innerText.includes(mayaName);
    }, testUserName);
    console.log(`Agent Sarah correctly blocked from seeing transferred user (${testUserName}): ${!sarahSeesMaya}`);
    if (sarahSeesMaya) throw new Error('RBAC Failure: Agent Sarah still has access to user after transfer to Alex.');

    // Confirm Admin retains master access
    console.log('Verifying Admin retains complete master access...');
    const adminActive = await pageAdmin.evaluate(() => {
      return !!document.querySelector('aside');
    });
    console.log(`Admin master session active: ${adminActive}`);
    if (!adminActive) throw new Error('Admin master session lost.');

    // -------------------------------------------------------------------------
    // J) CAMPAIGN ATTRIBUTION VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n>>> [PART J] CAMPAIGN ATTRIBUTION VERIFICATION');
    const asideButtonsCamp = await pageAdmin.$$('aside button');
    for (const btn of asideButtonsCamp) {
      const text = await pageAdmin.evaluate(el => el.textContent, btn);
      if (text && text.includes('Campaigns')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));

    const campaignVerified = await pageAdmin.evaluate(() => {
      const body = document.body.innerText;
      return body.includes('fb_global_match_2026') || body.includes('Facebook Global Match Launch');
    });
    console.log(`Admin verified campaign & attribution telemetry: ${campaignVerified}`);
    if (!campaignVerified) throw new Error('Campaign attribution telemetry not visible in Admin dashboard.');

    await pageAdmin.screenshot({ path: path.join(SCREENSHOT_DIR, 'section14_6_final_admin.png') });

    // Clean up all browser contexts
    await contextA.close();
    await contextB.close();
    await contextAdmin.close();
    await contextAlex.close();
    await contextSarah.close();

    console.log('\n================================================================================');
    console.log('>>> SECTION 14 RESULT: PASS ✅ — COMPLETE HUMAN JOURNEY FULLY VERIFIED');
    console.log('================================================================================\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 14 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section14.mjs')) {
  runSection14().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
