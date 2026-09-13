import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection3() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 3 — PROFILE (BROWSER QA)');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      if (msg.text().includes('400') || msg.text().includes('401')) return;
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', response => {
    if (!response.ok() && response.status() !== 304 && !response.url().includes('favicon.ico')) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // 3.1 Login via quick demo button (Daniel Kim)
    console.log('[3.1] Logging in as test user Daniel Kim...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });

    // Click 1-Click Daniel Kim
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const danielBtn = btns.find(b => b.textContent.includes('Daniel Kim'));
      if (danielBtn) danielBtn.click();
    });

    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Logged in as Daniel Kim.');

    // 3.2 Open Profile Tab
    console.log('[3.2] Navigating to Profile tab...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const profTab = tabs.find(b => b.textContent.includes('Profile') || b.querySelector('img') || b.querySelector('svg.lucide-user'));
      if (profTab) profTab.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Verify profile information
    const profileInfo = await page.evaluate(() => {
      const name = document.querySelector('h2')?.innerText;
      const email = document.querySelector('.glass-card p')?.innerText;
      return { name, email };
    });
    console.log('Displayed Profile Info:', profileInfo);
    if (!profileInfo.name || !profileInfo.name.includes('Daniel')) {
      throw new Error(`Profile name expected Daniel, got: "${profileInfo.name}"`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section3_profile_before_edit.png') });

    // 3.3 Edit Bio, Relationship Intention, Interests
    const newTimestamp = Date.now().toString().slice(-4);
    const newBio = `Adventurous software engineer who loves mountain trekking and espresso. Updated ${newTimestamp}`;
    const newInterests = `Trekking, Specialty Coffee, Photography, Web3, QA ${newTimestamp}`;

    console.log('[3.3] Editing Bio, Intention, and Interests via real user typing...');
    // Select intention
    await page.select('.md\\:col-span-2 select', 'life_partner');

    // Type bio with native keyboard events
    await page.click('.md\\:col-span-2 textarea');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type('.md\\:col-span-2 textarea', newBio);

    // Type interests with native keyboard events
    await page.click('.md\\:col-span-2 input[type="text"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type('.md\\:col-span-2 input[type="text"]', newInterests);

    await new Promise(r => setTimeout(r, 500));

    // 3.4 Click Save Changes
    console.log('[3.4] Submitting Save Changes...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const saveBtn = btns.find(b => b.textContent.includes('Save Changes'));
      if (saveBtn) saveBtn.click();
    });

    await new Promise(r => setTimeout(r, 1500));

    // Check actionNotice toast
    const toastText = await page.evaluate(() => {
      const toast = document.querySelector('.bg-surface-900\\/90, .border-brand-500\\/50, [class*="actionNotice"]');
      return document.body.innerText.includes('updated successfully') ? 'Profile updated successfully' : null;
    });
    console.log(`Save confirmation feedback: "${toastText}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section3_profile_after_edit.png') });

    // 3.5 Refresh page and verify persistence
    console.log('[3.5] Refreshing page to verify persistence...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Navigate to Profile tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const profTab = tabs.find(b => b.textContent.includes('Profile') || b.querySelector('img') || b.querySelector('svg.lucide-user'));
      if (profTab) profTab.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    const persistedValues = await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      const select = document.querySelector('select');
      const inputs = Array.from(document.querySelectorAll('input'));
      const interestsInput = inputs[inputs.length - 1];
      return {
        bio: textarea?.value,
        intention: select?.value,
        interests: interestsInput?.value
      };
    });

    console.log('Persisted Profile Values after Reload:', persistedValues);
    if (!persistedValues.bio.includes(newTimestamp)) {
      throw new Error(`Bio was not persisted! Expected to contain "${newTimestamp}", got: "${persistedValues.bio}"`);
    }
    if (persistedValues.intention !== 'life_partner') {
      throw new Error(`Intention was not persisted! Expected "life_partner", got: "${persistedValues.intention}"`);
    }
    if (!persistedValues.interests.includes(newTimestamp)) {
      throw new Error(`Interests were not persisted! Expected to contain "${newTimestamp}", got: "${persistedValues.interests}"`);
    }

    // 3.6 Test Unauthorized Profile Edit (Security Check)
    console.log('[3.6] Testing unauthorized profile update security...');
    const unauthorizedResult = await page.evaluate(async () => {
      // Call PATCH /api/profiles directly without cookie by forging empty/broken call or via fetch
      // We check if an unauthenticated request is blocked
      const res = await fetch('/api/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: 'Hacked bio' }),
        credentials: 'omit' // Omit cookies to simulate unauthenticated / foreign caller
      });
      return { status: res.status, ok: res.ok };
    });
    console.log('Unauthorized PATCH status (credentials: omit):', unauthorizedResult);
    if (unauthorizedResult.status !== 401 && unauthorizedResult.status !== 403) {
      throw new Error(`Security breach: Unauthorized PATCH /api/profiles returned ${unauthorizedResult.status}`);
    }

    // 3.7 Mobile Viewport layout test (390x844)
    console.log('[3.7] Testing Profile on Mobile Viewport (390x844)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section3_mobile_profile.png') });
    console.log('Saved screenshot: section3_mobile_profile.png');

    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
      throw new Error(`Console errors found: ${consoleErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 3 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 3 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section3.mjs')) {
  runSection3().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
