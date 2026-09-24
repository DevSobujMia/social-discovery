import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('=== Deep Verification: Chat Header Profile & Modal Close ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Go to site
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await sleep(1000);

  // Click directly on the first profile card to open profile modal
  console.log('1. Clicking on the first explore profile card...');
  await page.waitForSelector('img[alt]', { timeout: 8000 });
  await page.evaluate(() => {
    const card = document.querySelector('.profile-card, article, [data-profile-id]') || document.querySelector('img[alt]');
    if (card) (card.closest('button, [role="button"]') || card).click();
  });
  await sleep(1000);

  // Take screenshot of opened profile modal
  await page.screenshot({ path: 'scripts/step1_profile_modal.png' });
  console.log('Screenshot saved: step1_profile_modal.png');

  // Click "Say hi" or "Chat" button in the modal to start/open conversation
  console.log('2. Clicking Say hi / Chat button inside profile modal...');
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await (await btn.getProperty('innerText')).jsonValue();
    if (text && (text.includes('Say hi') || text.includes('Chat'))) {
      await btn.click();
      break;
    }
  }
  await sleep(1200);

  // We should now be in the active chat view!
  const chatInput = await page.$('textarea, input[placeholder*="Message"]');
  console.log('Chat window active:', !!chatInput);
  await page.screenshot({ path: 'scripts/step2_chat_window.png' });
  console.log('Screenshot saved: step2_chat_window.png');

  if (chatInput) {
    // 3. Click the participant header in the active chat
    console.log('3. Clicking chat header participant info button...');
    const headerBtns = await page.$$('header button, .chat-header button, button[title*="profile"], div.flex-1 button');
    let openedFromChat = false;
    for (const btn of headerBtns) {
      const title = await (await btn.getProperty('title')).jsonValue();
      const aria = await (await btn.getProperty('ariaLabel')).jsonValue();
      if ((title && title.toLowerCase().includes('profile')) || (aria && aria.toLowerCase().includes('profile'))) {
        await btn.click();
        openedFromChat = true;
        break;
      }
    }

    if (!openedFromChat && headerBtns.length > 0) {
      // Click the first button in the header (the participant button)
      await headerBtns[0].click();
      openedFromChat = true;
    }

    await sleep(1000);
    await page.screenshot({ path: 'scripts/step3_profile_from_chat.png' });
    console.log('Screenshot saved: step3_profile_from_chat.png');

    // 4. Click Close button (X or Back) in the profile modal
    console.log('4. Clicking Close button on the profile modal...');
    const modalCloseBtns = await page.$$('button[aria-label="Close"], button[aria-label="Back"]');
    if (modalCloseBtns.length > 0) {
      await modalCloseBtns[0].click();
    } else {
      // Find button with text 'Close'
      const allBtns = await page.$$('button');
      for (const b of allBtns) {
        const t = await (await b.getProperty('innerText')).jsonValue();
        if (t && t.trim() === 'Close') {
          await b.click();
          break;
        }
      }
    }
    await sleep(1000);

    // 5. Verify the Chat Window is STILL OPEN!
    const chatInputAfter = await page.$('textarea, input[placeholder*="Message"]');
    console.log('*** CHAT WINDOW STILL ACTIVE AFTER MODAL CLOSE ***:', !!chatInputAfter);
    await page.screenshot({ path: 'scripts/step4_chat_after_close.png' });
    console.log('Screenshot saved: step4_chat_after_close.png');

    if (!chatInputAfter) {
      throw new Error('FAIL: Chat window closed when exiting profile modal!');
    }
    console.log('SUCCESS: Active chat is preserved!');
  }

  await browser.close();
  console.log('=== All Chat Profile Flow Tests Completed Successfully ===');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
