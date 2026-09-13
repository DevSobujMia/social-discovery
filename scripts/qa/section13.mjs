import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection13() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 13 — DESKTOP HUMAN QA (BROWSER QA)');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 13.1 Desktop Viewport (1440 x 900)
    await page.setViewport({ width: 1440, height: 900 });
    console.log('[13.1] Navigating to Desktop Landing (1440x900)...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Check desktop layout & header
    const desktopHeader = await page.evaluate(() => {
      const header = document.querySelector('header');
      const logo = header ? header.innerText.toLowerCase().includes('heartlink') : false;
      const navLinks = header ? Array.from(header.querySelectorAll('button')).map(b => b.innerText.trim()) : [];
      return { logo, navLinks };
    });
    console.log('Desktop Header verified:', desktopHeader);
    if (!desktopHeader.logo) throw new Error('Header logo not found on desktop.');

    // Verify desktop profile grid (multi-column)
    await page.waitForSelector('.group.glass-card', { timeout: 8000 });
    const cardCount = await page.evaluate(() => document.querySelectorAll('.group.glass-card').length);
    console.log(`Desktop Discover cards rendered: ${cardCount}`);
    if (cardCount < 10) throw new Error(`Insufficient discover cards rendered on desktop: ${cardCount}`);

    // Desktop Scrolling
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 600));
    const scrolledY = await page.evaluate(() => window.scrollY);
    console.log(`Desktop vertical scroll verified: scrollY = ${scrolledY}px`);
    if (scrolledY < 500) throw new Error('Desktop scrolling failed.');
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section13_desktop_landing.png') });

    // 13.2 Desktop Profile Modal Inspection
    console.log('[13.2] Testing Profile Detail Modal on Desktop...');
    const modalOpened = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.group.glass-card'));
      if (cards.length > 0) {
        const viewBio = Array.from(cards[0].querySelectorAll('button')).find(b => b.innerText.includes('View Bio'));
        if (viewBio) {
          viewBio.click();
          return true;
        }
      }
      return false;
    });
    console.log(`Desktop View Bio modal clicked: ${modalOpened}`);
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });

    const modalWidth = await page.evaluate(() => {
      const content = document.querySelector('.modal-content');
      return content ? content.clientWidth : 0;
    });
    console.log(`Desktop Modal Content Width: ${modalWidth}px`);
    if (modalWidth < 300) throw new Error('Desktop modal layout too narrow.');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section13_desktop_modal.png') });

    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-overlay button');
      if (closeBtn) closeBtn.click();
    });
    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 5000 });

    // 13.3 Desktop Login Form
    console.log('[13.3] Testing Desktop Login Form...');
    await page.evaluate(() => {
      const signBtns = Array.from(document.querySelectorAll('header button')).filter(b => b.innerText.includes('Sign In'));
      if (signBtns.length > 0) signBtns[0].click();
    });
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });

    const emailInput = await page.waitForSelector('.modal-overlay input[type="email"]', { timeout: 4000 });
    await emailInput.type('daniel.kim@example.com');
    const pwdInput = await page.$('.modal-overlay input[type="password"]');
    await pwdInput.type('User@123456');

    const submitBtn = await page.$('.modal-overlay button[type="submit"]');
    await submitBtn.click();
    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Desktop login as Daniel Kim successful.');
    await new Promise(r => setTimeout(r, 1500));

    // 13.4 Desktop Profile Page
    console.log('[13.4] Testing Desktop Profile Page & Form...');
    const profileClicked = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button')).filter(b => 
        b.innerText.includes('Profile') || b.querySelector('svg.lucide-user') || b.querySelector('img')
      );
      if (tabs.length > 0) {
        tabs[0].click();
        return true;
      }
      return false;
    });
    console.log(`Profile button clicked: ${profileClicked}`);
    await new Promise(r => setTimeout(r, 1200));

    const isDaniel = await page.evaluate(() => document.body.innerText.includes('Daniel Kim'));
    console.log(`Profile page shows Daniel Kim: ${isDaniel}`);
    if (!isDaniel) throw new Error('Daniel Kim not shown on desktop profile page.');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section13_desktop_profile.png') });

    // 13.5 Desktop Messenger 2-Pane View
    console.log('[13.5] Testing Desktop Messenger (2-Pane View)...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button')).filter(b => b.innerText.includes('Messenger'));
      if (tabs.length > 0) tabs[0].click();
    });
    await page.waitForSelector('.divide-y button', { timeout: 8000 });

    // Check 2-pane presence on desktop
    const isDualPane = await page.evaluate(() => {
      const convList = document.querySelector('.divide-y');
      const activePane = document.querySelector('div[class*="flex-1 flex flex-col bg-surface-950"]');
      return !!convList && !!activePane;
    });
    console.log(`Desktop Messenger Dual-Pane rendered: ${isDualPane}`);
    if (!isDualPane) throw new Error('Desktop Messenger dual pane layout failed.');

    // Select first conversation
    const convButtons = await page.$$('.divide-y button');
    await convButtons[0].click();
    await new Promise(r => setTimeout(r, 1000));

    // Send a desktop message
    const desktopMsg = `Desktop QA verified at ${new Date().toLocaleTimeString()} 💻 🚀`;
    console.log(`Sending desktop message: "${desktopMsg}"...`);
    const chatInput = await page.waitForSelector('input[placeholder*="Write a message"]', { timeout: 5000 });
    await chatInput.type(desktopMsg);
    const sendBtn = await page.waitForSelector('button[type="submit"]', { timeout: 5000 });
    await sendBtn.click();
    await new Promise(r => setTimeout(r, 1500));

    const msgVisible = await page.evaluate((txt) => document.body.innerText.includes(txt), desktopMsg);
    console.log(`Desktop message rendered in bubble: ${msgVisible}`);
    if (!msgVisible) throw new Error('Sent desktop message not visible in thread.');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section13_desktop_chat.png') });

    // 13.6 Desktop Admin View
    console.log('[13.6] Testing Desktop Admin CRM...');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });

    // Log in as Super Admin (pre-populated with admin credentials)
    const adminSubmit = await page.waitForSelector('button[type="submit"]', { timeout: 6000 });
    await adminSubmit.click();

    await page.waitForSelector('aside', { timeout: 10000 });
    console.log('Super Admin logged into desktop CRM dashboard.');

    // Navigate to User Management
    const asideButtons = await page.$$('aside button');
    for (const btn of asideButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        break;
      }
    }
    await page.waitForSelector('tbody tr', { timeout: 10000 });
    const userRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    console.log(`Admin desktop users table rendered: ${userRows} rows`);
    if (userRows === 0) throw new Error('Admin users table is empty on desktop.');

    // Verify desktop tables & KPI grid
    const adminMetrics = await page.evaluate(() => {
      const kpis = document.querySelectorAll('.card-interactive, [class*="card"]');
      const table = document.querySelector('table');
      return { kpiCount: kpis.length, hasTable: !!table };
    });
    console.log('Desktop Admin layout verified:', adminMetrics);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section13_desktop_admin.png') });

    if (consoleErrors.length > 0) {
      console.warn('Console errors on desktop:', consoleErrors);
      throw new Error(`Console errors found on desktop: ${consoleErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 13 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 13 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section13.mjs')) {
  runSection13().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
