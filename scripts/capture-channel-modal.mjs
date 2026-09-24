import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await page.waitForSelector('button');

  const btns = await page.$$('button');
  for (const btn of btns) {
    const text = await page.evaluate(el => el.innerText, btn);
    if (text.includes('Send Message')) {
      await btn.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'public/screenshot_3_channel_modal.png' });
  console.log('📸 Screenshot saved to public/screenshot_3_channel_modal.png');

  await browser.close();
}

capture();
