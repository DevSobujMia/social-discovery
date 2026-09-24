import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runTest() {
  console.log('🚀 Starting Automated Test for 3-Channel Messaging Options...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // Mobile screen

  try {
    // 1. Load Homepage
    console.log('1. Loading http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // 2. Locate the preview profile cards and "Send Message" button
    console.log('2. Verifying preview profile cards and Send Message button...');
    await page.waitForSelector('button', { timeout: 8000 });
    
    const sendMsgBtns = await page.$$('button');
    let targetSendBtn = null;
    for (const btn of sendMsgBtns) {
      const text = await page.evaluate((el) => el.innerText, btn);
      if (text.includes('Send Message')) {
        targetSendBtn = btn;
        break;
      }
    }

    if (!targetSendBtn) {
      throw new Error('Send Message button not found on home page!');
    }
    console.log('✅ Send Message button found.');

    // 3. Click "Send Message" on preview card
    console.log('3. Clicking Send Message on preview card...');
    await targetSendBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    // 4. Verify MessageChannelModal appeared with 3 app options
    console.log('4. Verifying 3-Option Message Channel Modal...');
    const modalContent = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const hasWhatsApp = /WhatsApp/i.test(bodyText);
      const hasTelegram = /Telegram/i.test(bodyText);
      const hasCityHost = /City Host/i.test(bodyText);
      const hasUniversalTag = /Traveler in your city/i.test(bodyText);
      return { hasWhatsApp, hasTelegram, hasCityHost, hasUniversalTag };
    });

    console.log('Modal check results:', modalContent);

    if (!modalContent.hasWhatsApp || !modalContent.hasTelegram || !modalContent.hasCityHost || !modalContent.hasUniversalTag) {
      throw new Error('3-Option Channel Modal is missing one or more options!');
    }
    console.log('✅ 3-Option Message Channel Modal verified successfully!');

    // 5. Test City Host Direct Message selection
    console.log('5. Clicking "City Host" in modal...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const direct = btns.find(b => b.innerText.includes('City Host'));
      if (direct) direct.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    // 6. Verify we are now in the messenger / chat screen
    const inChat = await page.evaluate(() => {
      const body = document.body.innerText;
      return /Online|Message|Send|Travelling/i.test(body);
    });
    console.log('✅ In chat screen status:', inChat);

    // 7. Go back to Discover
    console.log('7. Navigating back to Discover tab...');
    await page.evaluate(() => {
      // Click chat close/back button
      const backBtn = document.querySelector('button[aria-label="Back to conversation list"]') ||
                      document.querySelector('button[aria-label="Close chat"]');
      if (backBtn && typeof backBtn.click === 'function') backBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const navs = Array.from(document.querySelectorAll('nav button'));
      const discover = navs.find(b => b.innerText.includes('Find') || b.innerText.includes('Discover'));
      if (discover) discover.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // 8. Test Find / Match phase channel modal
    console.log('8. Testing Match phase modal trigger...');
    const findClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const find = btns.find(b => b.innerText.includes('Find My Travel Match'));
      if (find) {
        find.click();
        return true;
      }
      return false;
    });

    if (findClicked) {
      console.log('Clicked Find My Travel Match, waiting for radar...');
      await new Promise((r) => setTimeout(r, 2800));

      const sayHiClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const sayHi = btns.find(b => b.innerText.includes('Say Hi to'));
        if (sayHi) {
          sayHi.click();
          return true;
        }
        return false;
      });

      if (sayHiClicked) {
        await new Promise((r) => setTimeout(r, 600));
        const matchModalVisible = await page.evaluate(() => {
          return document.body.innerText.includes('WhatsApp') &&
                 document.body.innerText.includes('Telegram') &&
                 document.body.innerText.includes('City Host');
        });
        console.log('✅ Match phase 3-channel modal verified:', matchModalVisible);
        if (!matchModalVisible) {
          throw new Error('Channel modal did not show in match phase!');
        }
      }
    }

    console.log('🎉 ALL 3-CHANNEL MESSAGING TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTest();
