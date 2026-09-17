import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

export async function runSection1() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 1 — LANDING / DISCOVER (BROWSER QA)');
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
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', response => {
    if (!response.ok() && response.status() !== 304 && !response.url().includes('favicon.ico')) {
      networkErrors.push(`${response.status()} ${response.url()}`);
      console.log(`[NETWORK FAIL] ${response.status()} ${response.url()}`);
    }
  });

  try {
    // 1. Desktop Viewport Test
    console.log('[1.1] Testing Desktop Viewport (1280x800)...');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Verify Title
    const title = await page.title();
    console.log(`Page Title: "${title}"`);
    if (!title.includes('City Host')) {
      throw new Error(`Unexpected page title: ${title}`);
    }

    // Check visible cards
    console.log('[1.2] Checking Profile Cards rendering...');
    await page.waitForSelector('.group.glass-card', { timeout: 8000 });
    const profileCardCount = await page.$$eval('.group.glass-card', cards => cards.length);
    console.log(`Found ${profileCardCount} rendered profile cards on Discover feed.`);
    if (profileCardCount === 0) {
      throw new Error('Zero profile cards found on Discover feed.');
    }

    // Inspect first card details (name, age, city, country, photos)
    const cardData = await page.evaluate(() => {
      const firstCard = document.querySelector('.group.glass-card');
      if (!firstCard) return null;
      const heading = firstCard.querySelector('h2');
      const img = firstCard.querySelector('img');
      return {
        name: heading ? heading.innerText : null,
        imgSrc: img ? img.src : null,
        fullSnippet: firstCard.innerText.substring(0, 100).replace(/\n/g, ' ')
      };
    });
    console.log(`First card details:`, cardData);
    if (!cardData || !cardData.name) {
      throw new Error('Profile card does not display basic info correctly.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section1_desktop_discover.png') });
    console.log('Saved screenshot: section1_desktop_discover.png');

    // 1.3 Test clicking profile to open bio/detail modal
    console.log('[1.3] Testing Profile Details modal open...');
    // Click on the first profile card's "View Bio" button
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.group.glass-card button'));
      const viewBioBtn = btns.find(b => b.textContent.includes('View Bio'));
      if (viewBioBtn) {
        viewBioBtn.click();
        return true;
      }
      return false;
    });
    console.log(`Clicked View Bio button: ${clicked}`);

    await new Promise(r => setTimeout(r, 1000));
    const modalVisible = await page.evaluate(() => {
      const modal = document.querySelector('.modal-overlay');
      return modal !== null;
    });
    console.log(`Profile Detail modal visible: ${modalVisible}`);

    if (!modalVisible) {
      throw new Error('Profile Detail modal (.modal-overlay) did not open upon clicking View Bio.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section1_profile_modal.png') });
    console.log('Saved screenshot: section1_profile_modal.png');

    // 1.4 Test closing modal (back navigation)
    console.log('[1.4] Testing closing modal (back navigation)...');
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-overlay button');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    const modalStillOpen = await page.evaluate(() => {
      return document.querySelector('.modal-overlay') !== null;
    });
    console.log(`Modal closed successfully: ${!modalStillOpen}`);
    if (modalStillOpen) {
      throw new Error('Modal failed to close when clicking close button.');
    }

    // 1.5 Mobile Viewport Test (390x844 - iPhone 14 style)
    console.log('[1.5] Testing Mobile Viewport (390x844)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle2' });

    // Scroll down and up
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => window.scrollBy(0, -500));

    // Check bottom navigation bar
    const hasNav = await page.evaluate(() => {
      const nav = document.querySelector('nav');
      return nav !== null;
    });
    console.log(`Mobile navigation bar visible: ${hasNav}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section1_mobile_discover.png') });
    console.log('Saved screenshot: section1_mobile_discover.png');

    // 1.6 Check for console or network errors
    console.log('[1.6] Verifying console and network status...');
    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
      throw new Error(`Console errors found: ${consoleErrors.join(', ')}`);
    }
    if (networkErrors.length > 0) {
      console.warn('Network errors detected:', networkErrors);
      throw new Error(`Network errors found: ${networkErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 1 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 1 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('section1.mjs')) {
  runSection1().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
