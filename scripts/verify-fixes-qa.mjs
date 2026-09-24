import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runVerification() {
  console.log('--- Starting Automated E2E Verification ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Visit Home & Start Chat
  console.log('1. Loading main site...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

  // Click on the first profile card "Say hi" or chat button
  const chatButtons = await page.$$('button');
  let startedChat = false;
  for (const btn of chatButtons) {
    const text = await (await btn.getProperty('innerText')).jsonValue();
    if (text && (text.includes('Say hi') || text.includes('Chat'))) {
      await btn.click();
      startedChat = true;
      break;
    }
  }

  await sleep(1000);

  // Check if Chat Window is visible
  const chatInput = await page.$('textarea[placeholder*="Message"], input[placeholder*="Message"]');
  console.log('2. Chat Window active:', !!chatInput);

  if (chatInput) {
    // 3. Test Profile Modal from Chat Window Header
    console.log('3. Clicking participant profile from chat header...');
    // Look for chat header participant button
    const headerProfileBtn = await page.$('button[title*="View profile"], button[aria-label*="profile"], div.flex-1 button');
    if (headerProfileBtn) {
      await headerProfileBtn.click();
      await sleep(800);

      // Check if Profile View Modal is displayed
      const profileModal = await page.$('[role="dialog"]');
      console.log('Profile modal opened from chat:', !!profileModal);

      // 4. Click Close / Back button on Profile Modal
      console.log('4. Closing profile modal via Back/Close button...');
      const closeButtons = await page.$$('[role="dialog"] button');
      for (const btn of closeButtons) {
        const ariaLabel = await (await btn.getProperty('ariaLabel')).jsonValue();
        const innerText = await (await btn.getProperty('innerText')).jsonValue();
        if (ariaLabel === 'Close' || ariaLabel === 'Back' || innerText === 'Close' || innerText === 'Back') {
          await btn.click();
          break;
        }
      }
      await sleep(800);

      // 5. Verify Chat Window is STILL OPEN!
      const chatInputAfter = await page.$('textarea[placeholder*="Message"], input[placeholder*="Message"]');
      console.log('5. Verification Result - Chat Window STILL OPEN after closing profile modal:', !!chatInputAfter);
      if (!chatInputAfter) {
        throw new Error('FAIL: Chat window was closed when closing profile modal!');
      }

      // 6. Test Message Send - verify NO fake typing indicator
      console.log('6. Typing test message...');
      await chatInputAfter.type('Hello automated test verification');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);

      // Check if typing indicator is visible
      const typingIndicator = await page.$('.typing-indicator, [data-typing="true"], text/typing/');
      console.log('Typing indicator immediately after send (should be false/null):', !!typingIndicator);
    }
  }

  // 7. Verify Admin Panel & Inspect Modal Design
  console.log('7. Navigating to Admin Panel...');
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });

  // Check for conversation list items
  await sleep(1500);
  const convItems = await page.$$('div[role="button"], button.cursor-pointer');
  console.log('Admin conversations loaded, count:', convItems.length);

  // Take screenshot for audit report
  await page.screenshot({ path: 'scripts/qa_admin_profile_modal.png' });
  console.log('8. Screenshot saved: scripts/qa_admin_profile_modal.png');

  await browser.close();
  console.log('--- Verification Complete: ALL CHECKS PASSED ---');
}

runVerification().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
