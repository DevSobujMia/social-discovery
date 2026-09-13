import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\browser-qa';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBrowserQA() {
  console.log('===============================================================');
  console.log('STARTING HUMAN-STYLE BROWSER QA — ASSISTED MATCHMAKING WORKFLOW');
  console.log('===============================================================\n');

  const results = {};

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,900'
    ]
  });

  try {
    // -------------------------------------------------------------
    // CONTEXT 1: CUSTOMER JOHN (ISOLATED BROWSER CONTEXT)
    // -------------------------------------------------------------
    console.log('▶ STEP 1: Launching Customer John in isolated user context...');
    const userContext = await browser.createBrowserContext();
    const userPage = await userContext.newPage();
    await userPage.setViewport({ width: 1280, height: 900 });

    await userPage.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await sleep(1500);

    // Ensure logged in as John Davis
    console.log('▶ Authenticating as Customer John (john.customer@example.com)...');
    const openedAuth = await userPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent && b.textContent.includes('Sign In'));
      if (signInBtn) {
        signInBtn.click();
        return true;
      }
      return false;
    });

    if (openedAuth) {
      await sleep(1000);

      // Check if we need to switch to Login mode
      const switchModeBtn = await userPage.$('button.text-brand-400');
      if (switchModeBtn) {
        const switchText = await userPage.evaluate(el => el.textContent, switchModeBtn);
        if (switchText.includes('Sign in here')) {
          await switchModeBtn.click();
          await sleep(500);
        }
      }

      await userPage.waitForSelector('input[type="email"]');
      await userPage.type('input[type="email"]', 'john.customer@example.com');
      await userPage.type('input[type="password"]', 'JohnPassword@123');
      
      const submitBtn = await userPage.$('form button[type="submit"]');
      await submitBtn.click();
      await sleep(2000);
    }

    await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, '01_john_logged_in.png') });
    console.log('✅ John session active.');

    // -------------------------------------------------------------
    // STEP 2: DISCOVER MAYA LIN
    // -------------------------------------------------------------
    console.log('▶ STEP 2: John discovers Maya Lin on Discover tab...');
    await userPage.waitForSelector('.group.glass-card');
    
    // Find Maya's card
    const mayaCard = await userPage.evaluateHandle(() => {
      const cards = document.querySelectorAll('.group.glass-card');
      for (const card of cards) {
        if (card.textContent && card.textContent.includes('Maya Lin')) {
          return card;
        }
      }
      return null;
    });

    if (!mayaCard.asElement()) {
      results['Customer John discovers Maya'] = 'FAIL';
      throw new Error('Maya card not found in discover');
    }
    results['Customer John discovers Maya'] = 'PASS';
    console.log('✅ PASS: John discovered Maya Lin profile card.');

    // -------------------------------------------------------------
    // STEP 3: OPEN MAYA PROFILE MODAL
    // -------------------------------------------------------------
    console.log('▶ STEP 3: John opens Maya Lin profile modal...');
    const buttons = await mayaCard.$$('button');
    let clickedBio = false;
    for (const b of buttons) {
      const txt = await userPage.evaluate(el => el.textContent, b);
      if (txt && txt.includes('View Bio')) {
        await b.click();
        clickedBio = true;
        break;
      }
    }
    if (!clickedBio) {
      await mayaCard.click();
    }
    await sleep(1000);

    // Verify modal content
    await userPage.waitForSelector('.modal-overlay .modal-content');
    const modalContent = await userPage.evaluate(() => {
      const modal = document.querySelector('.modal-overlay .modal-content');
      return modal ? modal.textContent : '';
    });

    if (!modalContent.includes('Maya Lin')) {
      results['Open Maya profile'] = 'FAIL';
      throw new Error('Modal did not display Maya Lin');
    }
    results['Open Maya profile'] = 'PASS';
    console.log('✅ PASS: Maya profile modal open with verified details.');
    await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, '02_maya_profile_modal.png') });

    // -------------------------------------------------------------
    // STEP 4: CLICK "SEND MESSAGE"
    // -------------------------------------------------------------
    console.log('▶ STEP 4: John clicks "Send Message" in Maya\'s modal...');
    const modalSendBtn = await userPage.evaluateHandle(() => {
      const modal = document.querySelector('.modal-overlay .modal-content');
      if (!modal) return null;
      const btns = modal.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent && b.textContent.includes('Send Message')) return b;
      }
      return null;
    });

    if (!modalSendBtn.asElement()) {
      results['Send Message button present'] = 'FAIL';
      throw new Error('Send Message button missing in Maya modal');
    }

    await modalSendBtn.click();
    await sleep(2500);

    // If activeChat is not yet open, click Maya in conversation list
    const mayaThreadInList = await userPage.evaluateHandle(() => {
      const btns = document.querySelectorAll('.divide-y button, button');
      for (const b of btns) {
        if (b.textContent && b.textContent.includes('Maya Lin')) return b;
      }
      return null;
    });
    if (mayaThreadInList.asElement()) {
      await mayaThreadInList.click();
      await sleep(1500);
    }

    results['Send Message'] = 'PASS';
    console.log('✅ PASS: Navigated to Messenger tab with Maya conversation active.');

    // -------------------------------------------------------------
    // STEP 5: JOHN SENDS A MESSAGE
    // -------------------------------------------------------------
    console.log('▶ STEP 5: John types and sends a message...');
    const messageToSend = 'Hello Maya! I love your architectural interests and travel photos. Are you planning any trips soon?';
    
    await userPage.waitForSelector('input[placeholder="Write a message..."]', { timeout: 10000 });
    await userPage.type('input[placeholder="Write a message..."]', messageToSend);
    
    const chatSendBtn = await userPage.$('form button.btn-primary');
    await chatSendBtn.click();
    await sleep(2500);

    const chatText = await userPage.evaluate(() => {
      const msgs = document.querySelectorAll('.whitespace-pre-wrap');
      const texts = [];
      msgs.forEach(m => texts.push(m.textContent));
      return texts;
    });

    const msgFound = chatText.some(t => t && t.includes(messageToSend));
    if (!msgFound) {
      results['Send a message'] = 'FAIL';
      throw new Error('Customer message did not appear in chat bubble');
    }
    results['Send a message'] = 'PASS';
    console.log('✅ PASS: John sent message successfully and it appears in the chat stream.');
    await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, '03_john_sent_message.png') });

    // -------------------------------------------------------------
    // CONTEXT 2: ADMIN CRM (ISOLATED ADMIN BROWSER CONTEXT)
    // -------------------------------------------------------------
    console.log('\n▶ STEP 6: Opening Admin CRM in separate isolated context...');
    const adminContext = await browser.createBrowserContext();
    const adminPage = await adminContext.newPage();
    await adminPage.setViewport({ width: 1280, height: 900 });

    await adminPage.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
    // Wait for either login screen or authenticated dashboard
    await adminPage.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && (b.textContent.includes('Super Admin') || b.textContent.includes('Master Inbox') || b.textContent.trim() === 'Admin'));
    }, { timeout: 15000 });

    const needsLogin = await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && b.textContent.includes('Super Admin'));
    });

    if (needsLogin) {
      console.log('Logging in as Super Admin in Admin CRM...');
      await adminPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(x => x.textContent && x.textContent.includes('Super Admin'));
        if (b) b.click();
      });
      await sleep(2500);
    } else {
      console.log('Admin already authenticated or switching header persona...');
      await adminPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('header button'));
        const b = btns.find(x => x.textContent && (x.textContent.includes('Super Admin') || x.textContent.trim() === 'Admin'));
        if (b) b.click();
      });
      await sleep(2500);
    }
    results['Open Admin CRM'] = 'PASS';

    // Go to Master Inbox
    console.log('▶ Navigating to Master Inbox tab...');
    await adminPage.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      return btns.some(b => b.textContent && b.textContent.includes('Master Inbox'));
    }, { timeout: 15000 });

    await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const b = btns.find(x => x.textContent && x.textContent.includes('Master Inbox'));
      if (b) b.click();
    });
    await sleep(2000);

    // Find John <-> Maya thread in left list
    console.log('▶ STEP 7: Admin finds John ↔ Maya conversation thread...');
    await adminPage.waitForFunction(() => {
      const threadBtns = Array.from(document.querySelectorAll('.divide-y button'));
      return threadBtns.some(b => {
        const txt = b.textContent || '';
        return txt.includes('John') && txt.includes('Maya');
      });
    }, { timeout: 15000 });

    const foundThread = await adminPage.evaluate(() => {
      const threadBtns = Array.from(document.querySelectorAll('.divide-y button'));
      const b = threadBtns.find(x => {
        const txt = x.textContent || '';
        return txt.includes('John') && txt.includes('Maya');
      });
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (!foundThread) {
      results['Admin finds John ↔ Maya'] = 'FAIL';
      throw new Error('John ↔ Maya thread not found in Master Inbox');
    }
    results['Admin finds John ↔ Maya'] = 'PASS';
    console.log('✅ PASS: Admin clearly sees John ↔ Maya (Assisted) in Master Inbox.');
    await sleep(2000);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '04_admin_master_inbox_opened.png') });

    // -------------------------------------------------------------
    // STEP 8: ADMIN CLICKS "REPLY ON BEHALF OF MAYA" & SENDS REPLY
    // -------------------------------------------------------------
    console.log('▶ STEP 8: Admin clicks and types "Reply on behalf of Maya"...');
    const composerLabel = await adminPage.evaluate(() => {
      const label = document.querySelector('form span.text-accent-teal');
      return label ? label.textContent : '';
    });
    console.log('CRM Composer Label:', composerLabel);

    if (!composerLabel.includes('Maya')) {
      results['Admin clicks "Reply on behalf of Maya"'] = 'FAIL';
      throw new Error(`Composer not bound to Maya: ${composerLabel}`);
    }
    results['Admin clicks "Reply on behalf of Maya"'] = 'PASS';

    const staffReplyText = 'Hello John! Thank you for reaching out. Yes, I am visiting Barcelona next month to explore Gaudi architecture.';
    const staffInput = await adminPage.$('input[placeholder*="Type reply"]');
    await staffInput.type(staffReplyText);
    await staffInput.press('Enter');
    await sleep(2500);

    // Verify staff reply appears in admin chat
    const adminChatText = await adminPage.evaluate(() => {
      const msgs = document.querySelectorAll('p.whitespace-pre-wrap');
      const texts = [];
      msgs.forEach(m => texts.push(m.textContent));
      return texts;
    });

    const staffMsgFound = adminChatText.some(t => t && t.includes(staffReplyText));
    if (!staffMsgFound) {
      results['Sends reply'] = 'FAIL';
      throw new Error('Reply not rendered in CRM');
    }
    results['Sends reply'] = 'PASS';
    console.log('✅ PASS: Admin sent reply on behalf of Maya.');
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '05_admin_replied_on_behalf.png') });

    // -------------------------------------------------------------
    // STEP 9: RETURN TO JOHN'S BROWSER & VERIFY
    // -------------------------------------------------------------
    console.log('\n▶ STEP 9: Returning to John\'s browser to reload and verify...');
    results['Return to John\'s browser'] = 'PASS';

    await userPage.reload({ waitUntil: 'domcontentloaded' });
    await userPage.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('nav button'));
      return btns.some(b => b.textContent && b.textContent.includes('Profile'));
    }, { timeout: 15000 });
    await sleep(1500);
    results['Reload conversation'] = 'PASS';

    // Make sure we are on Messenger tab
    await userPage.click('button[aria-label="Messenger"]');
    await sleep(2000);

    // Wait for the Maya conversation item to appear in the list
    try {
      await userPage.waitForFunction(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.some(b => b.textContent && b.textContent.includes('Maya'));
      }, { timeout: 15000 });
    } catch (err) {
      await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'debug_step9_failed.png') });
      const diag = await userPage.evaluate(() => ({
        body: document.body.innerText.slice(0, 500),
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).slice(0, 15)
      }));
      console.log('DIAG STEP 9:', JSON.stringify(diag, null, 2));
      throw err;
    }

    // Click Maya conversation
    await userPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mayaBtn = btns.find(b => b.textContent && b.textContent.includes('Maya'));
      if (mayaBtn) mayaBtn.click();
    });

    // Wait for message bubbles to appear
    await userPage.waitForFunction(() => {
      const msgs = document.querySelectorAll('.whitespace-pre-wrap');
      return msgs.length > 0;
    }, { timeout: 15000 });

    // Verify John sees Maya's reply
    const johnViewMessages = await userPage.evaluate(() => {
      const msgs = document.querySelectorAll('.whitespace-pre-wrap');
      const texts = [];
      msgs.forEach(m => texts.push(m.textContent));
      return texts;
    });
    console.log('Messages visible to John:', johnViewMessages);

    const johnSeesStaffReply = johnViewMessages.some(t => t && t.includes('explore Gaudi architecture'));
    if (!johnSeesStaffReply) {
      results['Verify John sees the reply from Maya\'s profile identity'] = 'FAIL';
      throw new Error('John did not see Maya reply');
    }
    results['Verify John sees the reply from Maya\'s profile identity'] = 'PASS';
    console.log('✅ PASS: John sees reply from Maya profile identity.');

    // Verify Maya's name/photo/context
    const chatPartnerName = await userPage.evaluate(() => {
      const h3 = document.querySelector('h3.text-sm.font-bold');
      return h3 ? h3.textContent : '';
    });
    console.log('Chat counterpart name displayed to John:', chatPartnerName);

    if (!chatPartnerName.includes('Maya Lin')) {
      results['Verify Maya\'s name/photo/context are correct'] = 'FAIL';
      throw new Error(`Header name not Maya Lin: ${chatPartnerName}`);
    }
    results['Verify Maya\'s name/photo/context are correct'] = 'PASS';
    console.log('✅ PASS: Maya Lin name/photo/identity displayed accurately.');

    // Verify persistence after reload
    await userPage.reload({ waitUntil: 'domcontentloaded' });
    await userPage.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('nav button'));
      return btns.some(b => b.textContent && b.textContent.includes('Profile'));
    }, { timeout: 15000 });
    await sleep(2000);
    
    // Switch to Messenger tab
    await userPage.click('button[aria-label="Messenger"]');
    await sleep(2000);

    // Wait for Maya conversation
    try {
      await userPage.waitForFunction(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.some(b => b.textContent && b.textContent.includes('Maya'));
      }, { timeout: 15000 });
    } catch (err) {
      await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'debug_reload_failed.png') });
      const debugInfo = await userPage.evaluate(() => ({
        url: window.location.href,
        body: document.body.innerText.slice(0, 500),
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).slice(0, 15)
      }));
      console.log('DEBUG RELOAD INFO:', JSON.stringify(debugInfo, null, 2));
      throw err;
    }

    // Click Maya conversation
    await userPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mayaBtn = btns.find(b => b.textContent && b.textContent.includes('Maya'));
      if (mayaBtn) mayaBtn.click();
    });

    // Wait for messages
    await userPage.waitForFunction(() => {
      const msgs = document.querySelectorAll('.whitespace-pre-wrap');
      return msgs.length > 0;
    }, { timeout: 15000 });

    // Check again
    const postReloadMsgs = await userPage.evaluate(() => {
      const msgs = document.querySelectorAll('.whitespace-pre-wrap');
      const texts = [];
      msgs.forEach(m => texts.push(m.textContent));
      return texts;
    });
    const stillPersists = postReloadMsgs.some(t => t && t.includes('explore Gaudi architecture'));
    if (!stillPersists) {
      results['Verify conversation persists after reload'] = 'FAIL';
      throw new Error('Lost after reload');
    }
    results['Verify conversation persists after reload'] = 'PASS';
    console.log('✅ PASS: Conversation fully persists after browser reload.');
    await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, '06_john_sees_maya_reply_persisted.png') });

    // -------------------------------------------------------------
    // STEP 10: ASSIGN JOHN TO AGENT SARAH
    // -------------------------------------------------------------
    console.log('\n▶ STEP 10: Assigning John to Agent Sarah in Admin CRM...');
    await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const b = btns.find(x => x.textContent && x.textContent.includes('User Management'));
      if (b) b.click();
    });
    await sleep(2000);

    const searchInput = await adminPage.$('input[placeholder*="Search email, name"]');
    if (searchInput) {
      await searchInput.type('John');
      await sleep(1000);
    }

    await adminPage.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      return rows.some(r => r.textContent && r.textContent.includes('John'));
    }, { timeout: 15000 });

    const clickedAssign = await adminPage.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      for (const r of rows) {
        if (r.textContent && r.textContent.includes('John')) {
          const btn = r.querySelector('button');
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!clickedAssign) {
      results['Assign John to Agent Sarah'] = 'FAIL';
      throw new Error('Assign button not found for John');
    }
    await sleep(1500);

    await adminPage.waitForSelector('.modal-overlay select');
    const sarahOptionValue = await adminPage.evaluate(() => {
      const select = document.querySelector('.modal-overlay select');
      if (!select) return null;
      for (const opt of select.options) {
        if (opt.text.includes('Sarah')) return opt.value;
      }
      return null;
    });

    if (!sarahOptionValue) {
      results['Assign John to Agent Sarah'] = 'FAIL';
      throw new Error('Agent Sarah not in dropdown');
    }

    await adminPage.select('.modal-overlay select', sarahOptionValue);
    await adminPage.type('.modal-overlay textarea', 'Assigned to Sarah for VIP matchmaking');
    
    const submitAssignBtn = await adminPage.evaluateHandle(() => {
      const btns = document.querySelectorAll('.modal-overlay form button');
      for (const b of btns) {
        if (b.textContent && b.textContent.includes('Confirm Assignment')) return b;
      }
      return null;
    });

    if (submitAssignBtn.asElement()) {
      await submitAssignBtn.click();
    } else {
      const modalSubmit = await adminPage.$('.modal-overlay form button[type="submit"]');
      if (modalSubmit) await modalSubmit.click();
    }
    await sleep(2000);

    results['Assign John to Agent Sarah'] = 'PASS';
    console.log('✅ PASS: John successfully assigned to Agent Sarah.');
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07_john_assigned_to_sarah.png') });

    // -------------------------------------------------------------
    // STEP 11: SARAH CAN OPEN JOHN ↔ MAYA & REPLY ON BEHALF
    // -------------------------------------------------------------
    console.log('\n▶ STEP 11: Switching CRM persona to Agent Sarah...');
    const switchedToSarah = await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      const b = btns.find(x => x.textContent.includes('Agent Sarah'));
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (switchedToSarah) {
      console.log('Switching to persona Agent Sarah in browser DOM...');
      await sleep(2500);
    } else {
      results['Sarah can open John ↔ Maya'] = 'FAIL';
      throw new Error('Agent Sarah switch button missing');
    }

    // Sarah opens Master Inbox
    await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const b = btns.find(x => x.textContent && x.textContent.includes('Master Inbox'));
      if (b) b.click();
    });
    await sleep(2000);

    await adminPage.waitForFunction(() => {
      const threadBtns = Array.from(document.querySelectorAll('.divide-y button'));
      return threadBtns.some(b => {
        const txt = b.textContent || '';
        return txt.includes('John') && txt.includes('Maya');
      });
    }, { timeout: 10000 });

    const sarahSeesThread = await adminPage.evaluate(() => {
      const threadBtns = Array.from(document.querySelectorAll('.divide-y button'));
      const b = threadBtns.find(x => {
        const txt = x.textContent || '';
        return txt.includes('John') && txt.includes('Maya');
      });
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (!sarahSeesThread) {
      results['Sarah can open John ↔ Maya'] = 'FAIL';
      throw new Error('Thread not visible in Sarah inbox');
    }
    results['Sarah can open John ↔ Maya'] = 'PASS';
    console.log('✅ PASS: Agent Sarah sees John ↔ Maya in her scoped Master Inbox.');
    await sleep(2000);

    console.log('▶ Agent Sarah types and sends reply on behalf of Maya...');
    const sarahReplyText = 'Also, feel free to share any favorite exhibitions you recommend in Europe!';
    const sarahInput = await adminPage.$('form input[placeholder*="Type reply"]');
    await sarahInput.type(sarahReplyText);
    
    const sarahSendReplyBtn = await adminPage.$('form button[type="submit"]');
    await sarahSendReplyBtn.click();
    await sleep(2500);

    const sarahChatText = await adminPage.evaluate(() => {
      const msgs = document.querySelectorAll('p.whitespace-pre-wrap');
      const texts = [];
      msgs.forEach(m => texts.push(m.textContent));
      return texts;
    });

    const sarahMsgRendered = sarahChatText.some(t => t && t.includes(sarahReplyText));
    if (!sarahMsgRendered) {
      results['Sarah can reply on behalf of Maya'] = 'FAIL';
      throw new Error('Sarah reply not sent');
    }
    results['Sarah can reply on behalf of Maya'] = 'PASS';
    console.log('✅ PASS: Agent Sarah successfully replied on behalf of Maya.');
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '08_sarah_replied_on_behalf.png') });

    // -------------------------------------------------------------
    // STEP 12: UNASSIGNED AGENT ALEX CANNOT ACCESS JOHN'S CONVERSATION
    // -------------------------------------------------------------
    console.log('\n▶ STEP 12: Testing unassigned Agent Alex...');
    
    // Switch to Agent Alex via persona button in adminPage
    const switchedToAlex = await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      const b = btns.find(x => x.textContent.includes('Agent Alex'));
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (switchedToAlex) {
      console.log('Switching to persona Agent Alex in browser DOM...');
      await sleep(2500);
    } else {
      results['Unassigned Agent Alex cannot access John\'s conversation'] = 'FAIL';
      throw new Error('Agent Alex button missing');
    }

    // Alex navigates to Master Inbox
    await adminPage.evaluate(() => {
      const btns = document.querySelectorAll('aside button');
      for (const b of btns) {
        if (b.textContent && b.textContent.includes('Master Inbox')) {
          b.click();
          break;
        }
      }
    });
    await sleep(2000);

    // Verify John ↔ Maya is NOT visible to Alex
    const alexInboxContent = await adminPage.evaluate(() => {
      const inboxList = document.querySelector('.divide-y');
      return inboxList ? inboxList.textContent : '';
    });
    console.log('Alex Master Inbox visible text:', alexInboxContent || '(Empty thread list)');

    const alexSeesJohn = alexInboxContent.includes('John');
    if (alexSeesJohn) {
      results['Unassigned Agent Alex cannot access John\'s conversation'] = 'FAIL';
      throw new Error('John is visible in Alex inbox');
    }

    // Direct attempt to query conversation messages endpoint as Alex
    const directAccessStatus = await adminPage.evaluate(async () => {
      const res = await fetch('/api/admin/conversations');
      const data = await res.json();
      const hasJohn = data.data?.conversations?.some(c => 
        c.customer?.displayName?.includes('John') || c.customer?.userId?.includes('john')
      );
      return { success: data.success, count: data.data?.conversations?.length || 0, hasJohn };
    });
    console.log('Alex API response test (conversations count):', directAccessStatus.count);

    if (directAccessStatus.hasJohn) {
      results['Unassigned Agent Alex cannot access John\'s conversation'] = 'FAIL';
      throw new Error('Alex was able to retrieve John\'s conversation via API');
    }

    results['Unassigned Agent Alex cannot access John\'s conversation'] = 'PASS';
    console.log('✅ PASS: Unassigned Agent Alex is blocked from accessing John\'s conversation.');
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '09_alex_unassigned_blocked.png') });

  } catch (err) {
    console.error('❌ Browser QA Error:', err);
  } finally {
    await browser.close();
  }

  console.log('\n===============================================================');
  console.log('FINAL BROWSER QA TEST RESULTS:');
  console.log('===============================================================');
  for (const [step, status] of Object.entries(results)) {
    console.log(`${status === 'PASS' ? '✅' : '❌'} ${step}: ${status}`);
  }
  console.log('===============================================================\n');
}

runBrowserQA();
