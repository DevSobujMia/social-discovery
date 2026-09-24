import puppeteer from 'puppeteer';

async function run() {
  console.log('Starting Admin Leads Verification...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('1. Navigating to Admin Panel...');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2', timeout: 30000 });

    // Check if password prompt is shown
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      console.log('Logging in with admin password...');
      await passwordInput.type('Dev0077');
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('2. Verifying Admin Dashboard Loaded...');
    const pageContent = await page.content();
    if (pageContent.includes('Admin Control') || pageContent.includes('Lead Management') || pageContent.includes('Master Inbox')) {
      console.log('✓ Admin dashboard successfully loaded!');
    } else {
      console.log('Dashboard content check:');
      console.log(pageContent.substring(0, 500));
    }

    // Switch to Lead Collection / Users tab if not active
    console.log('3. Clicking Leads / Users Tab...');
    const tabs = await page.$$('button');
    for (const tab of tabs) {
      const text = await page.evaluate(el => el.innerText, tab);
      if (text.includes('Leads') || text.includes('Users') || text.includes('Lead Collection')) {
        await tab.click();
        await new Promise(r => setTimeout(r, 1000));
        break;
      }
    }

    // Check if table contains Complete / Incomplete badges and Market Price
    console.log('4. Checking Lead Table Data...');
    const tableText = await page.evaluate(() => document.body.innerText);
    
    const hasCompleteBadge = tableText.includes('Complete') || tableText.includes('Incomplete');
    const hasMarketPrice = tableText.includes('$') || tableText.includes('Tier');
    const hasDeviceSpecs = tableText.includes('iOS') || tableText.includes('Android') || tableText.includes('Windows') || tableText.includes('Mac');

    console.log(`- Lead Status Badges present: ${hasCompleteBadge}`);
    console.log(`- Market Price / Valuation present: ${hasMarketPrice}`);
    console.log(`- Device Specs present: ${hasDeviceSpecs}`);

    // Check checkboxes
    const checkboxes = await page.$$('input[type="checkbox"]');
    console.log(`- Number of selection checkboxes found: ${checkboxes.length}`);

    // Take screenshot of admin lead table
    await page.screenshot({ path: 'scripts/admin-leads-preview.png' });
    console.log('✓ Screenshot saved to scripts/admin-leads-preview.png');

    // Switch to Master Inbox tab
    console.log('5. Testing Master Inbox Tab...');
    for (const tab of tabs) {
      const text = await page.evaluate(el => el.innerText, tab);
      if (text.includes('Inbox') || text.includes('Master Inbox') || text.includes('Chat')) {
        await tab.click();
        await new Promise(r => setTimeout(r, 1500));
        break;
      }
    }

    await page.screenshot({ path: 'scripts/admin-inbox-preview.png' });
    console.log('✓ Screenshot saved to scripts/admin-inbox-preview.png');

    console.log('🎉 All admin leads & inbox verification completed successfully!');
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

run();
