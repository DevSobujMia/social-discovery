import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function verifyProd() {
  console.log('Testing live production https://cityhost.live...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  await page.goto('https://cityhost.live', { waitUntil: 'networkidle2' });
  await page.waitForSelector('button');

  const btns = await page.$$('button');
  for (const btn of btns) {
    const text = await page.evaluate(el => el.innerText, btn);
    if (text.includes('Send Message')) {
      await btn.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 800));

  const modalCheck = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      hasCityHost: body.includes('City Host'),
      hasWhatsApp: body.includes('WhatsApp'),
      hasTelegram: body.includes('Telegram'),
      hasTravelerTag: body.includes('Traveler in your city'),
    };
  });

  console.log('Live Production Check Results:', modalCheck);
  await browser.close();
}

verifyProd().catch(console.error);
