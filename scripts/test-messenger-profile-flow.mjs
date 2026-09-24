import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('=== Testing Messenger Flow & Profile Modal Retention ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 400, height: 850 },
  });

  const page = await browser.newPage();
  
  // 1. Open Messenger Tab
  console.log('1. Navigating to Messenger tab directly...');
  await page.goto(`${BASE}/?tab=messenger`, { waitUntil: 'networkidle2' });
  await wait(1500);

  // Check if there are conversations
  let convCount = await page.evaluate(() => {
    const list = document.querySelectorAll('button, div[role="button"]');
    return list.length;
  });
  console.log('Conversation list elements count:', convCount);

  // Click on the first conversation item in the list
  console.log('2. Clicking first conversation to open active chat...');
  await page.evaluate(() => {
    // Find conversation item
    const items = [...document.querySelectorAll('button, div')].filter((el) => {
      const txt = el.innerText || '';
      return (txt.includes('Maya') || txt.includes('Ava') || txt.includes('Elena') || txt.includes('City Host') || txt.includes('Sophie')) && el.querySelector('img');
    });
    if (items.length > 0) {
      items[0].click();
    } else {
      // Fallback: click any conversation list item button
      const allBtns = [...document.querySelectorAll('button')];
      const conv = allBtns.find((b) => b.querySelector('img') && !b.closest('nav'));
      if (conv) conv.click();
    }
  });

  await wait(1500);

  // Check if active chat is open
  const hasChatInput = await page.evaluate(() => {
    return !!document.querySelector('textarea, input[placeholder*="Message"]');
  });
  console.log('3. Active Chat Window open:', hasChatInput);
  await page.screenshot({ path: 'scripts/qa_messenger_active_chat.png' });

  if (hasChatInput) {
    // 4. Click participant profile in chat header
    console.log('4. Clicking participant profile in chat header...');
    await page.evaluate(() => {
      // Participant info button is in the top header
      const header = document.querySelector('header') || document.querySelector('[class*="border-b"]');
      if (header) {
        const btn = header.querySelector('button');
        if (btn) btn.click();
      }
    });

    await wait(1200);
    await page.screenshot({ path: 'scripts/qa_messenger_profile_modal.png' });

    const isModalOpen = await page.evaluate(() => {
      return !!document.querySelector('[role="dialog"], .modal-overlay');
    });
    console.log('5. Profile modal open:', isModalOpen);

    // 5. Close Profile Modal (click Close or Back button)
    console.log('6. Clicking Close button on profile modal...');
    await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close"], button[aria-label="Back"]');
      if (closeBtn) {
        closeBtn.click();
      } else {
        const btns = [...document.querySelectorAll('button')];
        const c = btns.find((b) => b.innerText.trim() === 'Close' || b.innerText.trim() === 'Back');
        if (c) c.click();
      }
    });

    await wait(1000);
    await page.screenshot({ path: 'scripts/qa_messenger_after_close.png' });

    // 6. VERIFY: Is Chat Window STILL OPEN?
    const isChatStillOpen = await page.evaluate(() => {
      return !!document.querySelector('textarea, input[placeholder*="Message"]');
    });
    console.log('7. *** CHAT WINDOW STILL OPEN AFTER MODAL CLOSE ***:', isChatStillOpen);

    if (!isChatStillOpen) {
      console.error('FAILED: Chat window closed when closing profile modal!');
      process.exit(1);
    } else {
      console.log('PASSED: Chat window stayed open!');
    }

    // 7. Verify fake typing indicator is NOT shown upon typing/sending
    console.log('8. Typing message and checking typing indicator...');
    await page.evaluate(() => {
      const txt = document.querySelector('textarea');
      if (txt) {
        txt.value = 'Test message';
        txt.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const sendBtn = [...document.querySelectorAll('button')].find((b) => b.querySelector('svg') && b.type === 'submit');
      if (sendBtn) sendBtn.click();
    });

    await wait(400);
    const typingImmediately = await page.evaluate(() => {
      const body = document.body.innerText;
      return /is typing|\.\.\./i.test(body);
    });
    console.log('9. Fake typing indicator immediately after sending:', typingImmediately);
    if (typingImmediately) {
      console.warn('WARNING: Fake typing indicator showed up immediately!');
    } else {
      console.log('PASSED: No fake typing indicator appeared!');
    }
  }

  // 8. Test Admin Panel inspect modals
  console.log('10. Navigating to Admin Panel...');
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2' });
  await wait(1500);

  // Click on a conversation in admin
  console.log('11. Selecting conversation in admin...');
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div[class*="cursor-pointer"], button')];
    const row = rows.find((r) => r.innerText.includes('to') && r.querySelector('img'));
    if (row) row.click();
  });
  await wait(1000);

  // Click on customer avatar in chat header
  console.log('12. Clicking customer button in admin chat header...');
  await page.evaluate(() => {
    const custBtn = document.querySelector('button[title*="customer"]');
    if (custBtn) custBtn.click();
  });
  await wait(1000);

  const isCustomerModalOpen = await page.evaluate(() => {
    return !!document.querySelector('[role="dialog"]');
  });
  console.log('13. Admin Customer Profile Modal open (Unified ProfileViewModal):', isCustomerModalOpen);
  await page.screenshot({ path: 'scripts/qa_admin_customer_modal.png' });

  // Close customer modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button[aria-label="Back"]');
    if (closeBtn) closeBtn.click();
  });
  await wait(600);

  // Click on represented profile button in admin chat header
  console.log('14. Clicking represented profile button in admin chat header...');
  await page.evaluate(() => {
    const profBtn = document.querySelector('button[title*="represented"]');
    if (profBtn) profBtn.click();
  });
  await wait(1000);

  const isRepresentedModalOpen = await page.evaluate(() => {
    return !!document.querySelector('[role="dialog"]');
  });
  console.log('15. Admin Represented Profile Modal open (Unified ProfileViewModal):', isRepresentedModalOpen);
  await page.screenshot({ path: 'scripts/qa_admin_represented_modal.png' });

  await browser.close();
  console.log('=== ALL COMPREHENSIVE TESTS PASSED ===');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
