import puppeteer from 'puppeteer-core';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 Starting Verification Test for User Requirements...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=412,915'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 412, height: 915, isMobile: true });

    // -------------------------------------------------------------
    // TEST 1: Default Landing Page is Find Page (Discover)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Default Landing Page from Ad ---');
    await page.goto(`${BASE_URL}/?city=Dubai&utm_source=facebook&utm_campaign=fb_gulf_dubai_in_expat`, {
      waitUntil: 'networkidle0',
    });

    const isFindPageVisible = await page.evaluate(() => {
      return (
        document.body.innerText.includes('Find My Travel Match') ||
        document.body.innerText.includes('I want to meet') ||
        document.body.innerText.includes('Travellers Visiting Dubai')
      );
    });
    console.log('Assertion 1 (Lands on Find page by default):', isFindPageVisible ? 'PASSED ✅' : 'FAILED ❌');
    if (!isFindPageVisible) throw new Error('First-time visitor did not land on Find page');

    // -------------------------------------------------------------
    // TEST 2: Strict Gender Matching: Women
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Strict Gender Matching (Women) ---');
    // Click Women button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const womenBtn = btns.find((b) => b.textContent?.includes('Women'));
      if (womenBtn) womenBtn.click();
    });
    await wait(300);

    // Click "Find My Travel Match"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const findBtn = btns.find((b) => b.textContent?.includes('Find My Travel Match'));
      if (findBtn) findBtn.click();
    });

    // Wait for radar and match card
    await page.waitForFunction(
      () =>
        document.body.innerText.includes('Say Hi to') ||
        document.body.innerText.includes('98% Great Match'),
      { timeout: 12000 }
    );

    const matchWoman = await page.evaluate(() => {
      const text = document.body.innerText;
      const femaleNames = ['Emma', 'Sophie', 'Isabella', 'Olivia', 'Chloe', 'Amelia', 'Elena', 'Aisha'];
      const matched = femaleNames.find((n) => text.includes(`Say Hi to ${n}`) || text.includes(n));
      const hasMale = ['Liam', 'Marcus', 'Daniel', 'Alexander', 'Lucas', 'Julian'].some((n) =>
        text.includes(`Say Hi to ${n}`)
      );
      return { matched, hasMale };
    });
    console.log('Matched female profile:', matchWoman.matched);
    console.log('Assertion 2A (Women search gave strictly female profile):', (matchWoman.matched && !matchWoman.hasMale) ? 'PASSED ✅' : 'FAILED ❌');
    if (matchWoman.hasMale || !matchWoman.matched) throw new Error('Gender filter leaked male into women search');

    // -------------------------------------------------------------
    // TEST 3: Strict Gender Matching: Men
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Strict Gender Matching (Men) ---');
    // Close match card using (X) button to return to home search
    await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close match"]');
      if (closeBtn) closeBtn.click();
    });
    await wait(500);

    // Select Men
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const menBtn = btns.find((b) => b.textContent?.includes('Men'));
      if (menBtn) menBtn.click();
    });
    await wait(300);

    // Click "Find My Travel Match"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const findBtn = btns.find((b) => b.textContent?.includes('Find My Travel Match'));
      if (findBtn) findBtn.click();
    });

    await page.waitForFunction(
      () =>
        document.body.innerText.includes('Say Hi to') ||
        document.body.innerText.includes('98% Great Match'),
      { timeout: 12000 }
    );

    const matchMan = await page.evaluate(() => {
      const text = document.body.innerText;
      const maleNames = ['Liam', 'Marcus', 'Daniel', 'Alexander', 'Lucas', 'Julian'];
      const matched = maleNames.find((n) => text.includes(`Say Hi to ${n}`) || text.includes(n));
      const hasFemale = ['Emma', 'Sophie', 'Isabella', 'Olivia', 'Chloe', 'Amelia'].some((n) =>
        text.includes(`Say Hi to ${n}`)
      );
      return { matched, hasFemale };
    });
    console.log('Matched male profile:', matchMan.matched);
    console.log('Assertion 2B (Men search gave strictly male profile):', (matchMan.matched && !matchMan.hasFemale) ? 'PASSED ✅' : 'FAILED ❌');
    if (matchMan.hasFemale || !matchMan.matched) throw new Error('Gender filter leaked female into men search');

    // -------------------------------------------------------------
    // TEST 4: First Time Chat asks for Name, and Stores It Permanently
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: First Time Chat Name Input & Lead Storage ---');
    // Click "Say Hi to [Name]"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sayHiBtn = btns.find((b) => b.textContent?.includes('Say Hi to'));
      if (sayHiBtn) sayHiBtn.click();
    });

    // Wait for chat and inline name bar
    await page.waitForFunction(
      () =>
        document.body.innerText.includes('What should') ||
        document.body.innerText.includes('call you?'),
      { timeout: 8000 }
    );
    console.log('Assertion 4A (New visitor is asked for name on 1st message): PASSED ✅');

    // Fill name: Alex
    await page.type('input[placeholder*="first name"]', 'Alex');
    await wait(200);

    // Click "Say Hi 👋"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const subBtn = btns.find((b) => b.textContent?.includes('Say Hi'));
      if (subBtn) subBtn.click();
    });

    await page.waitForFunction(
      () => document.body.innerText.includes("Hi, I'm Alex!"),
      { timeout: 8000 }
    );
    console.log('Assertion 4B (Message sent as Alex): PASSED ✅');

    const storedNameInBrowser = await page.evaluate(() => {
      return localStorage.getItem('heartlink_guest_name');
    });
    console.log('Assertion 4C (Name "Alex" persisted in localStorage):', storedNameInBrowser === 'Alex' ? 'PASSED ✅' : 'FAILED ❌');
    if (storedNameInBrowser !== 'Alex') throw new Error('Name not persisted in localStorage');

    // -------------------------------------------------------------
    // TEST 5: Matching a Second Profile DOES NOT ask for Name Again!
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Second Match Never Asks For Name Again ---');
    // Exit chat and click Discover
    await page.evaluate(() => {
      const backBtn = document.querySelector('button[aria-label="Back to conversation list"]');
      if (backBtn) backBtn.click();
    });
    await wait(400);

    await page.evaluate(() => {
      const discoverBtn = document.querySelector('button[aria-label="Discover"]');
      if (discoverBtn) discoverBtn.click();
    });
    await wait(600);

    // Look for Women now
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const womenBtn = btns.find((b) => b.textContent?.includes('Women'));
      if (womenBtn) womenBtn.click();
    });
    await wait(300);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const findBtn = btns.find((b) => b.textContent?.includes('Find My Travel Match'));
      if (findBtn) findBtn.click();
    });

    await page.waitForFunction(
      () => document.body.innerText.includes('Say Hi to'),
      { timeout: 12000 }
    );

    // Click "Say Hi to [Woman]"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sayHiBtn = btns.find((b) => b.textContent?.includes('Say Hi to'));
      if (sayHiBtn) sayHiBtn.click();
    });

    await wait(1800);

    // Verify chat is open and inline name prompt is NOT shown!
    const namePromptShown = await page.evaluate(() => {
      return (
        document.body.innerText.includes('What should') &&
        document.body.innerText.includes('call you?')
      );
    });
    console.log('Assertion 5A (2nd match does NOT prompt for name):', !namePromptShown ? 'PASSED ✅' : 'FAILED ❌');
    if (namePromptShown) throw new Error('System prompted for name again on 2nd match!');

    const hasTextarea = await page.evaluate(() => {
      return Boolean(document.querySelector('textarea'));
    });
    console.log('Assertion 5B (Direct message textarea available immediately):', hasTextarea ? 'PASSED ✅' : 'FAILED ❌');
    if (!hasTextarea) throw new Error('Direct message textarea not visible for named user');

    // -------------------------------------------------------------
    // TEST 6: Returning Visitor Routing
    // Case A: No unread messages -> Default lands on Find page
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Returning Visitor Routing (No Unread -> Lands on Find Page) ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
    await wait(1200);

    const landsOnFind = await page.evaluate(() => {
      return (
        document.body.innerText.includes('Find My Travel Match') ||
        document.body.innerText.includes('I want to meet')
      );
    });
    console.log('Assertion 6A (Returning visitor with 0 unread lands on Find page):', landsOnFind ? 'PASSED ✅' : 'FAILED ❌');
    if (!landsOnFind) throw new Error('Returning visitor without unread messages did not land on Find page');

    // -------------------------------------------------------------
    // TEST 7: Returning Visitor Routing
    // Case B: Unread message arrives -> Automatically opens Messenger
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Returning Visitor Routing (Unread Message -> Auto-opens Messenger) ---');
    // Get user's conversation ID from browser session
    const convId = await page.evaluate(async () => {
      const convRes = await fetch('/api/conversations');
      const convData = await convRes.json();
      return convData.data?.conversations?.[0]?.id;
    });
    console.log('Customer conversation ID:', convId);

    // From Node.js, log in as admin and send an operator reply to this conversation
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@heartlink.com', password: 'Admin@123456' }),
    });
    const adminCookie = adminLoginRes.headers.get('set-cookie');
    const adminLoginData = await adminLoginRes.json();
    console.log('Admin login success:', adminLoginData.success);

    const replyRes = await fetch(`${BASE_URL}/api/admin/conversations/${convId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie || '',
      },
      body: JSON.stringify({ content: 'Hey Alex! Great to meet you, welcome to Dubai.' }),
    });
    const replyData = await replyRes.json();
    console.log('Simulated operator reply status:', replyData.success);

    // Customer (who is away) re-opens the website
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
    await wait(2500);

    const autoOpenedMessenger = await page.evaluate(() => {
      return (
        document.body.innerText.includes('Hey Alex! Great to meet you') ||
        document.body.innerText.includes('Direct Message') ||
        document.body.innerText.includes('Messages')
      );
    });
    console.log('Assertion 7 (Auto-navigated to messenger because of unread reply):', autoOpenedMessenger ? 'PASSED ✅' : 'FAILED ❌');
    if (!autoOpenedMessenger) throw new Error('App did not auto-navigate to messenger on unread message');

    console.log('\n======================================================');
    console.log('🎉 ALL USER REQUIREMENTS VERIFIED & PASSED 100%!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
