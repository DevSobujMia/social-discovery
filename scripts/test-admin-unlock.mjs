import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', (msg) => console.log('BROWSER:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="password"]');

  await page.type('input[type="password"]', 'Dev0077');
  await page.click('button[type="submit"]');

  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: 'scripts/admin_after_unlock.png' });

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Page body after unlock (first 300 chars):', bodyText.slice(0, 300));

  await browser.close();
}

test().catch(console.error);
