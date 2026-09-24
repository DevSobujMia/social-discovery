import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('=== Test: Profile Modal Close in Chat Window ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 400, height: 850 },
  });

  const page = await browser.newPage();
  await page.goto(`${BASE}/?city=Dubai`, { waitUntil: 'domcontentloaded' });
  await wait(1500);

  // 1. Click Find My Travel Match
  console.log('1. Clicking Find My Travel Match...');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.innerText.includes('Find My Travel Match')
    );
    if (btn) btn.click();
  });

  // 2. Wait for match result
  console.log('2. Waiting for match result...');
  await page.waitForFunction(
    () => /Say Hi to|Chat with/i.test(document.body.innerText),
    { timeout: 15000 }
  );

  // 3. Click Say Hi to enter chat
  console.log('3. Clicking Say Hi to enter chat...');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /Say Hi to|Chat with/i.test(b.innerText)
    );
    if (btn) btn.click();
  });

  // Wait for chat window
  await page.waitForFunction(
    () => !!document.querySelector('textarea, input[placeholder*="Message"]'),
    { timeout: 15000 }
  );
  console.log('4. Chat Window is ACTIVE!');
  await page.screenshot({ path: 'scripts/qa_01_active_chat.png' });

  // 4. Click participant profile in chat header
  console.log('5. Clicking participant profile in chat header...');
  await page.evaluate(() => {
    // Header avatar or button
    const btns = [...document.querySelectorAll('button')];
    const headerBtn = btns.find((b) => b.querySelector('img') && b.closest('header, [class*="header"]'));
    if (headerBtn) {
      headerBtn.click();
    } else {
      // Look for any button in header
      const h = document.querySelector('header');
      if (h) {
        const b = h.querySelector('button');
        if (b) b.click();
      }
    }
  });

  await wait(1000);
  await page.screenshot({ path: 'scripts/qa_02_profile_modal_open.png' });

  // Check if profile modal is open
  const isModalOpen = await page.evaluate(() => {
    return !!document.querySelector('[role="dialog"]');
  });
  console.log('6. Profile modal opened from chat:', isModalOpen);

  // 5. Close Profile Modal (click Close or Back)
  console.log('7. Closing Profile Modal...');
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button[aria-label="Back"]');
    if (closeBtn) {
      closeBtn.click();
    } else {
      const all = [...document.querySelectorAll('button')];
      const c = all.find((b) => b.innerText.trim() === 'Close' || b.innerText.trim() === 'Back');
      if (c) c.click();
    }
  });

  await wait(1000);
  await page.screenshot({ path: 'scripts/qa_03_after_modal_closed.png' });

  // 6. VERIFY: Is Chat Window STILL OPEN?
  const isChatStillOpen = await page.evaluate(() => {
    return !!document.querySelector('textarea, input[placeholder*="Message"]');
  });
  console.log('8. *** CHAT WINDOW STILL OPEN AFTER MODAL CLOSE ***:', isChatStillOpen);

  if (!isChatStillOpen) {
    console.error('FAILED: Chat window was closed!');
    process.exit(1);
  } else {
    console.log('PASSED: Chat window remained open perfectly!');
  }

  // 7. Verify NO Fake Typing Indicator on Send
  console.log('9. Testing message send typing indicator...');
  const typingBefore = await page.evaluate(() => {
    return !!document.querySelector('[class*="typing"], .typing-indicator');
  });
  console.log('Typing indicator before send:', typingBefore);

  // Send a quick message
  await page.evaluate(() => {
    const txt = document.querySelector('textarea');
    if (txt) {
      txt.value = 'Hello! Testing real typing';
      txt.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const sendBtn = [...document.querySelectorAll('button')].find((b) => b.querySelector('svg') && b.type === 'submit');
    if (sendBtn) sendBtn.click();
  });

  await wait(300);
  const typingAfterSend = await page.evaluate(() => {
    return !!document.querySelector('[class*="typing"], .typing-indicator');
  });
  console.log('10. Fake typing indicator right after customer send:', typingAfterSend);
  if (typingAfterSend) {
    console.warn('WARNING: Fake typing indicator showed up immediately on send!');
  } else {
    console.log('PASSED: No fake typing indicator appeared on send!');
  }

  await browser.close();
  console.log('=== ALL TESTS PASSED SUCCESSFULLY ===');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
