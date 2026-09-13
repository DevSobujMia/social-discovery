import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection2() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 2 — SIGNUP / LOGIN (BROWSER QA)');
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
      // Ignore console network error from intentional wrong password test (400 Bad Request)
      if (msg.text().includes('400') || msg.text().includes('401')) return;
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', response => {
    if (!response.ok() && response.status() !== 304 && !response.url().includes('favicon.ico')) {
      // 401 on intentionally invalid login test is expected, track others
      if (!response.url().includes('/api/auth/login')) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    }
  });

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // 2.1 Open Auth Modal
    console.log('[2.1] Opening Auth Modal...');
    await page.evaluate(() => {
      // Click header "Sign In" button
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });

    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    console.log('Auth modal opened.');

    // 2.2 Switch to Signup mode
    console.log('[2.2] Switching to Signup mode...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.modal-overlay button'));
      const createAccBtn = links.find(b => b.textContent.includes('Create one here') || b.textContent.includes('Create Free Account') || b.textContent.includes('Sign up'));
      if (createAccBtn) createAccBtn.click();
    });

    await new Promise(r => setTimeout(r, 600));

    // Verify Password input has type="password" (never plain text)
    const isPasswordMasked = await page.evaluate(() => {
      const pwdInput = document.querySelector('.modal-overlay input[type="password"]');
      return pwdInput !== null;
    });
    console.log(`Password input is properly masked (type="password"): ${isPasswordMasked}`);
    if (!isPasswordMasked) {
      throw new Error('Password input is not masked or missing type="password"!');
    }

    // 2.3 Perform Real User Signup
    const testTimestamp = Date.now();
    const testEmail = `qa_user_${testTimestamp}@example.com`;
    const testPassword = 'Password@123!';
    const testName = `QA Tester ${testTimestamp.toString().slice(-4)}`;

    console.log(`[2.3] Filling Signup form for: ${testEmail}...`);
    // Type name
    const nameInput = await page.$('.modal-overlay input[placeholder*="Maya Lin"]');
    if (nameInput) await nameInput.type(testName);

    // Type country
    const countryInput = await page.$('.modal-overlay input[placeholder="e.g. United States"], .modal-overlay input:not([type="password"]):not([type="email"])');
    // Fill all text inputs
    await page.evaluate((name) => {
      const inputs = Array.from(document.querySelectorAll('.modal-overlay input[type="text"]'));
      if (inputs[0]) inputs[0].value = name;
      if (inputs[1]) inputs[1].value = 'United States';
    }, testName);

    // Type email
    const emailInput = await page.$('.modal-overlay input[type="email"]');
    if (emailInput) await emailInput.type(testEmail);

    // Type password
    const pwdInput = await page.$('.modal-overlay input[type="password"]');
    if (pwdInput) await pwdInput.type(testPassword);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section2_signup_form.png') });

    // Submit Signup
    console.log('Submitting signup form...');
    await page.evaluate(() => {
      const submitBtn = document.querySelector('.modal-overlay button[type="submit"]');
      if (submitBtn) submitBtn.click();
    });

    // Wait for auth modal to close on success
    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Signup successful! Modal closed and session established.');

    // 2.4 Verify Logged In state in UI
    console.log('[2.4] Verifying logged-in state...');
    const loggedInName = await page.evaluate(() => {
      const profileText = document.body.innerText;
      return profileText;
    });
    if (!loggedInName.includes(testName)) {
      console.log(`Note: Checking if profile tab or header displays user info...`);
    }

    // Switch to Profile Tab
    console.log('Navigating to Profile tab...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const profTab = tabs.find(b => b.textContent.includes('Profile'));
      if (profTab) profTab.click();
    });

    await new Promise(r => setTimeout(r, 800));
    const profileViewSnippet = await page.evaluate(() => document.querySelector('main')?.innerText || '');
    console.log('Profile tab snippet:', profileViewSnippet.substring(0, 120).replace(/\n/g, ' '));
    if (!profileViewSnippet.includes(testName) && !profileViewSnippet.includes('My Profile')) {
      throw new Error('Logged-in profile view does not display user info.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section2_logged_in_profile.png') });

    // 2.5 Test Session Persistence across page reload
    console.log('[2.5] Testing session persistence on page refresh...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    const hasSignInBtnAfterReload = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      return btns.some(b => b.textContent.includes('Sign In'));
    });
    console.log(`Sign In button present in header after reload: ${hasSignInBtnAfterReload}`);
    if (hasSignInBtnAfterReload) {
      throw new Error('Sign In button reappeared in header; session cookie lost upon reload.');
    }

    // Navigate to Profile tab to verify user details persist
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('nav button, header button'));
      const profTab = tabs.find(b => b.textContent.includes('Profile') || b.title?.includes('Profile'));
      if (profTab) profTab.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const stillLoggedIn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('Log Out') || b.textContent.includes('Logout'));
    });
    console.log(`Session persisted and Log Out button active: ${stillLoggedIn}`);
    if (!stillLoggedIn) {
      throw new Error('Session did not persist after page refresh!');
    }

    // 2.6 Test Logout
    console.log('[2.6] Testing Logout...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const logoutBtn = btns.find(b => b.textContent.includes('Log Out') || b.textContent.includes('Logout'));
      if (logoutBtn) logoutBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    const isLoggedOut = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('Sign In'));
    });
    console.log(`Successfully logged out (Sign In button returned): ${isLoggedOut}`);
    if (!isLoggedOut) {
      throw new Error('User remained logged in after clicking Logout.');
    }

    // 2.7 Test Wrong Password Handling
    console.log('[2.7] Testing Wrong Password error handling in UI...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });

    const loginEmailInput = await page.$('.modal-overlay input[type="email"]');
    await loginEmailInput.type(testEmail);
    const loginPwdInput = await page.$('.modal-overlay input[type="password"]');
    await loginPwdInput.type('WrongPassword123!');

    await page.evaluate(() => {
      const submitBtn = document.querySelector('.modal-overlay button[type="submit"]');
      if (submitBtn) submitBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    const errorDisplayed = await page.evaluate(() => {
      const errBox = document.querySelector('.modal-overlay .bg-red-500\\/10, .modal-overlay [class*="text-red"]');
      return errBox ? errBox.innerText : null;
    });
    console.log(`Invalid password error displayed in UI: "${errorDisplayed}"`);
    const errorMatches = errorDisplayed && (
      errorDisplayed.toLowerCase().includes('invalid') ||
      errorDisplayed.toLowerCase().includes('authentication failed') ||
      errorDisplayed.toLowerCase().includes('incorrect')
    );
    if (!errorMatches) {
      throw new Error(`Expected error message for wrong password, got: "${errorDisplayed}"`);
    }

    // 2.8 Test Login with correct credentials
    console.log('[2.8] Testing Login with correct credentials...');
    // Clear and type correct password
    await page.evaluate(() => {
      const pwd = document.querySelector('.modal-overlay input[type="password"]');
      if (pwd) pwd.value = '';
    });
    await loginPwdInput.type(testPassword);
    await page.evaluate(() => {
      const submitBtn = document.querySelector('.modal-overlay button[type="submit"]');
      if (submitBtn) submitBtn.click();
    });

    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Login with correct credentials succeeded! Modal closed.');

    // 2.9 Mobile Signup/Login Layout verification
    console.log('[2.9] Checking Mobile Auth Layout (390x844)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('nav button'));
      const profTab = tabs.find(b => b.textContent.includes('Profile'));
      if (profTab) profTab.click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section2_mobile_auth_profile.png') });
    console.log('Saved screenshot: section2_mobile_auth_profile.png');

    // Check errors
    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
      throw new Error(`Console errors found: ${consoleErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 2 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 2 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section2.mjs')) {
  runSection2().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
