import puppeteer from 'puppeteer-core';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function testVisitorFlow() {
  console.log('--- Deep Visitor Flow Test ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`  [Console Error]: ${msg.text()}`);
      errors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    console.error(`  [Page Error]: ${err.message}`);
    errors.push(err.message);
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    console.log('1. Homepage loaded.');

    // Click "Find My Travel Match"
    console.log('2. Clicking "Find My Travel Match"...');
    const findBtn = await page.waitForSelector('button ::-p-text(Find My Travel Match)', { timeout: 10000 });
    if (!findBtn) throw new Error('Find button not found');
    await findBtn.click();

    // Wait for spinning phase to complete and reveal match (usually ~2-3 seconds)
    console.log('3. Waiting for match result...');
    await sleep(4000);

    // Check what is displayed
    const stateAfterMatch = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map((h) => h.textContent?.trim());
      const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim());
      return { headings, buttons };
    });
    console.log('Match result view:', stateAfterMatch);

    // Look for "Say Hi" or opener or message button
    const sayHiBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const found = btns.find((b) => b.textContent && (b.textContent.includes('Say Hi') || b.textContent.includes('Chat') || b.textContent.includes('Send')));
      if (found) {
        found.click();
        return found.textContent?.trim();
      }
      return null;
    });
    console.log('4. Clicked action:', sayHiBtn);
    await sleep(2500);

    // Check if we are now in the chat or name input modal
    const chatOrModal = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea')).map((i) => ({
        placeholder: i.placeholder,
        type: i.type,
      }));
      const text = document.body.innerText.substring(0, 300);
      return { inputs, snippet: text.replace(/\n+/g, ' ') };
    });
    console.log('5. Current view state:', chatOrModal);

    // If there is an input for name (guest name prompt)
    const nameInput = await page.$('input[placeholder*="name" i]');
    if (nameInput) {
      console.log('  Found guest name input, typing name...');
      await nameInput.type('Zahid');
      const continueBtn = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find((b) => b.textContent && (b.textContent.includes('Continue') || b.textContent.includes('Start') || b.textContent.includes('Chat')));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      await sleep(2500);
    }

    // Now check if chat window is open
    const chatState = await page.evaluate(() => {
      const msgInput = document.querySelector('textarea, input[placeholder*="message" i], input[placeholder*="Type" i]');
      return {
        hasChatInput: !!msgInput,
        placeholder: msgInput ? msgInput.getAttribute('placeholder') : null,
      };
    });
    console.log('6. Chat state:', chatState);

    // If chat input exists, try typing a message
    const msgBox = await page.$('textarea, input[placeholder*="message" i], input[placeholder*="Type" i]');
    if (msgBox) {
      console.log('7. Typing message...');
      await msgBox.type('Hello, are you in Dhaka?');
      const sendBtn = await page.$('button[aria-label*="send" i], button:has(svg.lucide-send)');
      if (sendBtn) {
        await sendBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await sleep(2000);
    }

    // Check if verification modal appeared (as expected by phone-first gate)
    const modalCheck = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      const text = modal ? modal.textContent : '';
      return {
        hasModal: !!modal,
        textSnippet: text ? text.substring(0, 200) : '',
      };
    });
    console.log('8. Verification / modal state:', modalCheck);

    console.log('--- Deep Visitor Flow Finished. Total errors:', errors.length);
  } catch (err) {
    console.error('Error in deep visitor flow:', err);
  } finally {
    await browser.close();
  }
}

testVisitorFlow();
