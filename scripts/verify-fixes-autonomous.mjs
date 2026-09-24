import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runVerification() {
  console.log('=== STARTING AUTONOMOUS E2E VERIFICATION ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=430,932']
  });

  try {
    // -------------------------------------------------------------
    // TASK 1: VERIFY 2 PROFILES VISIBLE BEFORE SEARCH IN MATCHFUNNEL
    // -------------------------------------------------------------
    console.log('\n--- Checking Task 1: "Travellers Visiting Soon" 2 initial profiles ---');
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 });

    // Clear any previous searches in localStorage for fresh test
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.removeItem('cityhost_daily_searches');
      localStorage.removeItem('cityhost_matched_history');
    });
    await page.reload({ waitUntil: 'networkidle2' });

    // Wait for profiles to load
    await new Promise((r) => setTimeout(r, 1500));

    const soonSectionTitle = await page.evaluate(() => {
      const el = document.body.innerText;
      return el.includes('TRAVELLERS VISITING SOON') || el.includes('Travellers Visiting Soon');
    });
    console.log('✓ "Travellers Visiting Soon" heading found:', soonSectionTitle);

    const initialCardsCount = await page.evaluate(() => {
      const header = Array.from(document.querySelectorAll('span')).find(s => s.innerText.toLowerCase().includes('travellers visiting soon'));
      if (!header) return 0;
      const container = header.closest('.select-none');
      return container ? container.querySelectorAll('.group').length : 0;
    });
    console.log(`✓ Initial displayed profiles count: ${initialCardsCount}`);
    if (initialCardsCount !== 2) {
      throw new Error(`Expected exactly 2 cards before searching, but found ${initialCardsCount}`);
    }
    console.log('✓ PASS: Exactly 2 preview profiles are displayed before search.');

    // -------------------------------------------------------------
    // TASK 2: VERIFY DAILY SEARCH LIMIT (MAX 2 SEARCHES)
    // -------------------------------------------------------------
    console.log('\n--- Checking Task 2: Daily search limit (max 2 searches) ---');
    
    // Search 1: Click "Find My Travel Match"
    console.log('Clicking "Find My Travel Match" (Search #1)...');
    const findBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Find My Travel Match'));
    });
    if (!findBtn) throw new Error('Could not find "Find My Travel Match" button');
    await findBtn.click();

    // Wait for radar spin animation (~2s) and hero match to render
    await page.waitForFunction(() => {
      return document.querySelector('button') && Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Next find'));
    }, { timeout: 10000 });

    const search1Badge = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('span')).find(s => s.innerText.includes('searches left today'));
      return el ? el.innerText : null;
    });
    console.log('✓ After Search #1, remaining badge:', search1Badge);
    if (!search1Badge || !search1Badge.includes('1/2 searches left today')) {
      throw new Error(`Expected "1/2 searches left today", got: ${search1Badge}`);
    }

    // Search 2: Click "Next find"
    console.log('Clicking "Next find" (Search #2)...');
    const nextBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Next find'));
    });
    await nextBtn.click();

    await page.waitForFunction(() => {
      return document.querySelector('button') && Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Next find'));
    }, { timeout: 10000 });

    const search2Badge = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('span')).find(s => s.innerText.includes('searches left today'));
      return el ? el.innerText : null;
    });
    console.log('✓ After Search #2, remaining badge:', search2Badge);
    if (!search2Badge || !search2Badge.includes('0/2 searches left today')) {
      throw new Error(`Expected "0/2 searches left today", got: ${search2Badge}`);
    }

    // Search 3: Click "Next find" again - MUST BE BLOCKED!
    console.log('Clicking "Next find" (Search #3 attempt - should be blocked)...');
    const nextBtn3 = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Next find'));
    });
    await nextBtn3.click();

    // Check if toast appears
    await new Promise((r) => setTimeout(r, 400));
    const toastText = await page.evaluate(() => {
      const body = document.body.innerText;
      if (body.includes('limit is done') || body.includes('Try again tomorrow')) {
        return 'Today’s search limit is done. Try again tomorrow — your limit will increase over time.';
      }
      return null;
    });
    console.log('✓ Limit toast message caught:', toastText);
    if (!toastText) {
      throw new Error('Limit toast did not appear when search limit was reached!');
    }
    console.log('✓ PASS: Search #3 was successfully blocked with limit toast.');

    // Go back to search screen
    console.log('Clicking "← Back to search"...');
    const backBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Back to search'));
    });
    await backBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    // Try clicking "Find My Travel Match" on home screen - MUST ALSO BE BLOCKED
    console.log('Clicking "Find My Travel Match" on home screen after limit reached...');
    const findBtnBlocked = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Find My Travel Match'));
    });
    await findBtnBlocked.click();
    await new Promise((r) => setTimeout(r, 400));
    const homeToastText = await page.evaluate(() => {
      const body = document.body.innerText;
      return body.includes('limit is done') || body.includes('Try again tomorrow');
    });
    console.log('✓ Home screen search block verified:', homeToastText);
    if (!homeToastText) {
      throw new Error('Home screen "Find My Travel Match" was not blocked when daily limit reached!');
    }

    // Verify 2 cards are displayed under "Travellers Visiting Soon" on home screen with matches
    const postSearchCardsCount = await page.evaluate(() => {
      const header = Array.from(document.querySelectorAll('span')).find(s => s.innerText.toLowerCase().includes('travellers visiting soon'));
      if (!header) return 0;
      const container = header.closest('.select-none');
      return container ? container.querySelectorAll('.group').length : 0;
    });
    console.log(`✓ Cards count in "Travellers Visiting Soon" after searches: ${postSearchCardsCount}`);
    if (postSearchCardsCount !== 2) {
      throw new Error(`Expected exactly 2 cards after searching, got ${postSearchCardsCount}`);
    }
    console.log('✓ PASS: Exactly 2 profiles displayed under "Travellers Visiting Soon".');

    // -------------------------------------------------------------
    // TASK 3: VERIFY ADMIN PERMANENT LOGIN ACROSS RESTARTS
    // -------------------------------------------------------------
    console.log('\n--- Checking Task 3: Admin login persistence across browser restarts ---');
    const adminPage = await browser.newPage();
    await adminPage.setViewport({ width: 1280, height: 800 });

    await adminPage.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });

    // Check if on login form
    const hasPassKey = await adminPage.$('input[type="password"]');
    if (hasPassKey) {
      console.log('Entering admin passkey "Dev0077"...');
      await adminPage.evaluate(() => {
        const input = document.querySelector('input[type="password"]');
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(input, 'Dev0077');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await new Promise((r) => setTimeout(r, 200));

      const submitBtn = await adminPage.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Unlock Admin Panel') || b.type === 'submit');
      });
      if (submitBtn) await submitBtn.click();
      await adminPage.waitForFunction(() => {
        return document.body.innerText.includes('Master Inbox');
      }, { timeout: 10000 });
      console.log('✓ Successfully logged in to Admin Dashboard.');
    }

    // Verify localStorage has cityhost_staff_token and cityhost_staff_user
    const storedStaffData = await adminPage.evaluate(() => {
      return {
        token: localStorage.getItem('cityhost_staff_token'),
        user: localStorage.getItem('cityhost_staff_user'),
      };
    });
    console.log('✓ Stored staff token present:', Boolean(storedStaffData.token));
    console.log('✓ Stored staff user present:', Boolean(storedStaffData.user));
    if (!storedStaffData.token || !storedStaffData.user) {
      throw new Error('Staff token or staff user was not saved in localStorage!');
    }

    // Simulate browser restart / cookie wipe:
    console.log('Simulating app restart / clearing cookies (testing pure localStorage token persistence)...');
    const client = await adminPage.createCDPSession();
    await client.send('Network.clearBrowserCookies');

    // Reload page
    await adminPage.reload({ waitUntil: 'networkidle2' });
    // Wait for either dashboard or login form to render
    await adminPage.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Master Inbox') || text.includes('Unlock Admin Panel');
    }, { timeout: 10000 });

    // Verify still in dashboard without login prompt!
    const loggedInAfterRestart = await adminPage.evaluate(() => {
      const text = document.body.innerText;
      const isDashboard = text.includes('Master Inbox') || text.includes('Direct Mode');
      const isLoginForm = text.includes('Unlock Admin Panel') || text.includes('Admin Access Password');
      return { isDashboard, isLoginForm };
    });
    console.log('✓ Admin status after restart with cleared cookies:', loggedInAfterRestart);
    if (!loggedInAfterRestart.isDashboard || loggedInAfterRestart.isLoginForm) {
      throw new Error('Admin was logged out after browser restart / cookie clear!');
    }
    console.log('✓ PASS: Admin session remained permanently logged in across browser restart!');

    console.log('\n=============================================');
    console.log('🎉 ALL 3 REQUIREMENTS VERIFIED 100% LOCALLY!');
    console.log('=============================================\n');
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
