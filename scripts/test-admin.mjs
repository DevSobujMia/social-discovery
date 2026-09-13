import puppeteer from 'puppeteer-core';

async function testAdmin() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 800 });
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });

  // Login
  console.log('Clicking login button...');
  await page.click('button[type="submit"]');
  await page.waitForSelector('aside', { timeout: 10000 });
  console.log('Logged in! <aside> sidebar is present.');

  const labels = [
    'Dashboard & KPIs',
    'User Management',
    'Lead Assignments',
    'Master Inbox',
    'Campaigns & Routing',
    'Moderation & Reports'
  ];

  for (let i = 0; i < labels.length; i++) {
    console.log(`Clicking tab ${i}: "${labels[i]}"...`);
    await page.evaluate((index) => {
      const btns = document.querySelectorAll('aside button');
      if (btns[index]) btns[index].click();
    }, i);
    await new Promise(r => setTimeout(r, 1200));
    const textSnippet = await page.evaluate(() => {
      const main = document.querySelector('.flex-1.min-w-0');
      const h2 = main?.querySelector('h2');
      return h2 ? h2.innerText : main?.innerText.substring(0, 50).replace(/\n/g, ' ');
    });
    console.log(`Tab ${i} (${labels[i]}) -> Header: "${textSnippet}"`);
  }

  await browser.close();
}

testAdmin().catch(console.error);
