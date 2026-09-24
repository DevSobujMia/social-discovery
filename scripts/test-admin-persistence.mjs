import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function test() {
  console.log('=== TESTING ADMIN DATA PERSISTENCE & NO RELOAD LOOP ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  let reloadCount = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) reloadCount++;
  });

  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // If password input is present, log in
  const hasPass = await page.$('input[type="password"]');
  if (hasPass) {
    console.log('Logging in with Dev0077...');
    await page.evaluate(() => {
      const input = document.querySelector('input[type="password"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Dev0077');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 200));

    const submitBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Unlock Admin Panel') || b.type === 'submit');
    });
    if (submitBtn) await submitBtn.click();

    await page.waitForFunction(() => {
      return document.body.innerText.includes('Master Inbox');
    }, { timeout: 10000 });
    console.log('✓ Logged in!');
  }

  // Reset reload count to monitor if page randomly reloads
  reloadCount = 0;

  // Wait 12 seconds (previously token died in 7s and caused 401 empty data)
  console.log('Waiting 12 seconds to observe data persistence and verify NO auto-reload loops...');
  await new Promise(r => setTimeout(r, 12000));

  const state = await page.evaluate(() => {
    const text = document.body.innerText;
    const chatBtn = Array.from(document.querySelectorAll('button, span')).find(b => b.innerText.includes('Chat List'));
    const userBtn = Array.from(document.querySelectorAll('button, span')).find(b => b.innerText.includes('All Users'));
    const has401Toast = text.includes('Unauthorized') || text.includes('Invalid') || text.includes('Sign in to continue');
    return {
      chatListText: chatBtn?.innerText || 'not found',
      allUsersText: userBtn?.innerText || 'not found',
      has401Toast,
      snippet: text.slice(0, 300)
    };
  });

  console.log('✓ State after 12 seconds:');
  console.log('  Chat List:', state.chatListText);
  console.log('  All Users:', state.allUsersText);
  console.log('  Any 401 or auth error:', state.has401Toast);
  console.log('  Unwanted reloads detected:', reloadCount);

  if (state.has401Toast) {
    throw new Error('401 or auth error appeared!');
  }
  if (reloadCount > 0) {
    throw new Error(`Auto-reload loop detected! Page reloaded ${reloadCount} times!`);
  }

  console.log('\n✓ Refreshing page once manually to verify session is still intact...');
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const afterReloadState = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      isDashboard: text.includes('Master Inbox') || text.includes('Direct Mode'),
      isLoginForm: text.includes('Unlock Admin Panel') || text.includes('Admin Access Password'),
    };
  });
  console.log('✓ After manual reload:', afterReloadState);

  if (!afterReloadState.isDashboard || afterReloadState.isLoginForm) {
    throw new Error('Admin logged out after manual reload!');
  }

  console.log('\n🎉 ALL ADMIN CHECKS PASSED: DATA PERSISTENT, NO 401s, NO AUTO-RELOADS!');
  await browser.close();
}

test().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
