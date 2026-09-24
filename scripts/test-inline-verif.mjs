import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testFullVerificationFlow() {
  console.log('=== STARTING HUMAN VERIFICATION TEST ===');
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });

  // 1. Customer tab
  const customerPage = await browser.newPage();
  await customerPage.setViewport({ width: 390, height: 844, isMobile: true });
  await customerPage.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  // Click Send Message on Chloe (second card)
  console.log('Clicking Send Message on Chloe...');
  await customerPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.includes('Send Message'));
    if (btns[1]) btns[1].click();
    else if (btns[0]) btns[0].click();
  });

  // Wait for chat to open
  console.log('Waiting for chat textarea...');
  await customerPage.waitForSelector('textarea[placeholder="Message"]', { timeout: 10000 });

  // Type and send first message as guest
  console.log('Sending first message as guest...');
  await customerPage.type('textarea[placeholder="Message"]', 'Hello Chloe! Are you free to meet?');
  await customerPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const sendBtn = btns.find(b => b.getAttribute('aria-label') === 'Send message' || b.innerHTML.includes('lucide-send') || b.querySelector('svg.lucide-send'));
    if (sendBtn) sendBtn.click();
  });

  await new Promise(r => setTimeout(r, 2000));

  // Check conversation ID from customer localStorage or state
  const convId = await customerPage.evaluate(() => {
    const meta = localStorage.getItem('cityhost_active_chat');
    if (meta) {
      try { return JSON.parse(meta).id; } catch {}
    }
    return null;
  });
  console.log('Customer conversation ID:', convId);

  // 2. Open Admin tab and trigger Human Verification
  console.log('Opening admin tab to trigger verification...');
  const adminPage = await browser.newPage();
  await adminPage.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  // If password input is present, log in with Dev0077
  const hasPass = await adminPage.$('input[type="password"]');
  if (hasPass) {
    console.log('Entering Dev0077 on admin...');
    await adminPage.type('input[type="password"]', 'Dev0077');
    await adminPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Unlock') || b.type === 'submit');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000));
  }

  // Find conversation in admin list and click it
  console.log('Selecting conversation in admin...');
  await adminPage.evaluate((targetConvId) => {
    const items = Array.from(document.querySelectorAll('div, li, button'));
    // Find item with conversation id or target
    const convItem = items.find(el => el.getAttribute('data-conv-id') === targetConvId || el.textContent?.includes('Chloe') || el.textContent?.includes('Guest'));
    if (convItem) convItem.click();
  }, convId);
  await new Promise(r => setTimeout(r, 1500));

  // Click the [ 🛡️ Ask Human Verification ] button in admin chat header
  console.log('Clicking Ask Human Verification button in admin...');
  const clickedVerif = await adminPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent?.includes('Ask Human Verification'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Ask Human Verification button:', clickedVerif);

  // 3. Switch back to Customer tab and verify
  await new Promise(r => setTimeout(r, 2500));
  customerPage.bringToFront();

  // Screenshot customer screen to verify inline form appearance and NO modal / NO center card
  await customerPage.screenshot({ path: 'public/test_verification_inline_form.png', fullPage: false });
  console.log('Screenshot taken: public/test_verification_inline_form.png');

  const checkUI = await customerPage.evaluate(() => {
    const text = document.body.innerText;
    const hasModal = document.querySelector('.fixed.inset-0.z-\\[100\\]') !== null;
    const hasCenterCard = text.includes('Community Safety Verification');
    const hasInlineName = document.querySelector('input[placeholder="Your name or nickname"]') !== null;
    const hasInlinePhone = document.querySelector('input[placeholder="Mobile or WhatsApp number"]') !== null;
    const hasStartChatBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Start Chat'));
    const hasMessageTextarea = document.querySelector('textarea[placeholder="Message"]') !== null;
    return {
      hasModal,
      hasCenterCard,
      hasInlineName,
      hasInlinePhone,
      hasStartChatBtn,
      hasMessageTextarea
    };
  });
  console.log('Verification UI check:', checkUI);

  // 4. Fill in name and phone in inline form
  console.log('Filling in Name & Number in inline form...');
  await customerPage.type('input[placeholder="Your name or nickname"]', 'Alex Mercer');
  await customerPage.type('input[placeholder="Mobile or WhatsApp number"]', '+12025550198');

  // Click Start Chat
  await customerPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const startBtn = btns.find(b => b.textContent?.includes('Start Chat'));
    if (startBtn) startBtn.click();
  });

  await new Promise(r => setTimeout(r, 3000));

  // 5. Verify that chat is unlocked, textarea is back, and NO auto greeting message was sent
  const afterSubmitCheck = await customerPage.evaluate(() => {
    const text = document.body.innerText;
    const hasInlineForm = document.querySelector('input[placeholder="Your name or nickname"]') !== null;
    const hasMessageTextarea = document.querySelector('textarea[placeholder="Message"]') !== null;
    const hasAutoGreeting = text.includes("Hi, I'm Alex Mercer!");
    return {
      hasInlineForm,
      hasMessageTextarea,
      hasAutoGreeting
    };
  });
  console.log('After submit check:', afterSubmitCheck);

  await customerPage.screenshot({ path: 'public/test_after_verified.png', fullPage: false });
  console.log('Screenshot taken: public/test_after_verified.png');

  await browser.close();
  console.log('=== TEST COMPLETED ===');
}

testFullVerificationFlow().catch(console.error);
