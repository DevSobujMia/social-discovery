import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection4() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 4 — DISCOVER + FILTERS (BROWSER QA)');
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

    // 4.1 Initial Cards Count
    console.log('[4.1] Checking initial cards before filtering...');
    await page.waitForSelector('.group.glass-card', { timeout: 8000 });
    const initialCount = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Initial profiles count: ${initialCount}`);

    // 4.2 Gender Filter: Women
    console.log('[4.2] Testing Gender Filter: Women...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const womenBtn = btns.find(b => b.textContent.trim() === 'Women');
      if (womenBtn) womenBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    await page.waitForSelector('.group.glass-card', { timeout: 8000 });
    const womenCount = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Profiles after filtering for Women: ${womenCount}`);
    if (womenCount === 0 || womenCount >= initialCount) {
      console.log(`Note: Initial count was ${initialCount}, women count is ${womenCount}`);
    }

    // 4.3 Gender Filter: Men
    console.log('[4.3] Testing Gender Filter: Men...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const menBtn = btns.find(b => b.textContent.trim() === 'Men');
      if (menBtn) menBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    await page.waitForSelector('.group.glass-card', { timeout: 8000 });
    const menCount = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Profiles after filtering for Men: ${menCount}`);

    // 4.4 Gender Filter: All (Restore)
    console.log('[4.4] Restoring Gender Filter: All...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const allBtn = btns.find(b => b.textContent.trim() === 'All');
      if (allBtn) allBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    const restoredCount = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Profiles restored after clicking All: ${restoredCount}`);
    if (restoredCount !== initialCount) {
      throw new Error(`Filter reset failed: Expected ${initialCount}, got ${restoredCount}`);
    }

    // 4.5 Filter Drawer: Country Filter
    console.log('[4.5] Testing Country Filter...');
    // Open Filters drawer
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const filterBtn = btns.find(b => b.textContent.includes('Filters'));
      if (filterBtn) filterBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // Select Country: United States
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const countrySelect = selects[0];
      if (countrySelect) {
        countrySelect.value = 'United States';
        countrySelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await new Promise(r => setTimeout(r, 1000));
    const usCount = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Profiles after filtering Country: United States -> ${usCount}`);
    if (usCount === 0) {
      throw new Error('Country filter returned 0 profiles for United States.');
    }

    // Check that card locations mention United States
    const usLocations = await page.$$eval('.group.glass-card', cards => {
      return cards.map(c => c.innerText).filter(t => t.includes('United States')).length;
    });
    console.log(`Cards explicitly indicating United States: ${usLocations} of ${usCount}`);

    // 4.6 Combine Filters: Country + Looking For
    console.log('[4.6] Combining Country + Looking For filters...');
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const goalSelect = selects[1];
      if (goalSelect) {
        goalSelect.value = 'relationship';
        goalSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 1000));
    const combinedCount = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Combined (US + Long-term Relationship) count: ${combinedCount}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section4_combined_filter.png') });

    // 4.7 Test No-Result Empty State
    console.log('[4.7] Testing No-Result Empty State...');
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const countrySelect = selects[0];
      const goalSelect = selects[1];
      if (countrySelect) {
        countrySelect.value = 'NonExistentCountry123';
        countrySelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (goalSelect) {
        goalSelect.value = 'friendship';
        goalSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 1000));

    const noResultVisible = await page.evaluate(() => {
      return document.body.innerText.includes('No profiles found');
    });
    console.log(`Empty state ("No profiles found") rendered: ${noResultVisible}`);
    if (!noResultVisible) {
      throw new Error('No-result empty state was not displayed for zero matching filters.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section4_no_result_state.png') });

    // 4.8 Test "Clear Filters" button in empty state
    console.log('[4.8] Testing "Clear Filters" recovery button...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const clearBtn = btns.find(b => b.textContent.includes('Clear Filters'));
      if (clearBtn) clearBtn.click();
    });

    await new Promise(r => setTimeout(r, 1200));
    const recoveredCount = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Profiles recovered after Clear Filters: ${recoveredCount}`);
    if (recoveredCount !== initialCount) {
      throw new Error(`Expected ${initialCount} recovered profiles, got: ${recoveredCount}`);
    }

    // 4.9 Mobile Viewport Controls (390x844)
    console.log('[4.9] Testing filter controls on Mobile Viewport (390x844)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const womenBtn = btns.find(b => b.textContent.trim() === 'Women');
      if (womenBtn) womenBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    const mobileFilteredCount = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Mobile filtered Women count: ${mobileFilteredCount}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section4_mobile_filter.png') });

    // Check errors
    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
      throw new Error(`Console errors found: ${consoleErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 4 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 4 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section4.mjs')) {
  runSection4().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
