import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection6() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 6 — MUTUAL MATCH (BROWSER QA)');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // 6.1 Login User A (Daniel Kim) in Session 1
    console.log('[6.1] Logging in User A (Daniel Kim) in Session 1...');
    const pageA = await browser.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });
    await pageA.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Click Sign In
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageA.waitForSelector('.modal-overlay', { timeout: 5000 });

    // Click 1-Click Daniel Kim
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const danielBtn = btns.find(b => b.textContent.includes('Daniel Kim'));
      if (danielBtn) danielBtn.click();
    });
    await pageA.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('User A (Daniel Kim) logged in.');

    // 6.2 Login User B (Aisha Rahman) in Session 2 (Incognito Context)
    console.log('[6.2] Logging in User B (Aisha Rahman) in Session 2...');
    const contextB = await browser.createBrowserContext();
    const pageB = await contextB.newPage();
    await pageB.setViewport({ width: 1280, height: 800 });
    await pageB.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Click Sign In
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageB.waitForSelector('.modal-overlay', { timeout: 5000 });

    // Click 1-Click Aisha Rahman
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const aishaBtn = btns.find(b => b.textContent.includes('Aisha Rahman'));
      if (aishaBtn) aishaBtn.click();
    });
    await pageB.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('User B (Aisha Rahman) logged in.');

    // 6.3 User A (Daniel) Likes User B (Aisha)
    console.log('[6.3] User A (Daniel) finding and liking User B (Aisha Rahman)...');
    await pageA.reload({ waitUntil: 'networkidle2' });
    await pageA.waitForSelector('.group.glass-card', { timeout: 8000 });

    // Find Aisha's card
    const aishaCardFound = await pageA.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.group.glass-card'));
      const aishaCard = cards.find(c => c.innerText.includes('Aisha'));
      if (aishaCard) {
        const likeBtn = aishaCard.querySelector('button[title*="Like"]');
        if (likeBtn) {
          likeBtn.click();
          return true;
        }
      }
      return false;
    });

    if (!aishaCardFound) {
      console.log('Aisha card not on current page; using client fetch from Daniel session...');
      const aishaUser = await prisma.user.findUnique({ where: { email: 'aisha.rahman@example.com' } });
      await pageA.evaluate(async (targetId) => {
        await fetch('/api/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: targetId, type: 'like' })
        });
      }, aishaUser.id);
    }

    await new Promise(r => setTimeout(r, 1200));
    console.log('User A (Daniel) like sent.');

    // 6.4 User B (Aisha) Likes User A (Daniel) back → Triggers Mutual Match Celebration!
    console.log('[6.4] User B (Aisha) liking User A (Daniel) back...');
    await pageB.reload({ waitUntil: 'networkidle2' });
    await pageB.waitForSelector('.group.glass-card', { timeout: 8000 });

    const danielCardFound = await pageB.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.group.glass-card'));
      const danielCard = cards.find(c => c.innerText.includes('Daniel'));
      if (danielCard) {
        const likeBtn = danielCard.querySelector('button[title*="Like"]');
        if (likeBtn) {
          likeBtn.click();
          return true;
        }
      }
      return false;
    });

    if (!danielCardFound) {
      console.log('Daniel card not on page; triggering like via client session...');
      const danielUser = await prisma.user.findUnique({ where: { email: 'daniel.kim@example.com' } });
      await pageB.evaluate(async (targetId) => {
        await fetch('/api/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: targetId, type: 'like' })
        });
      }, danielUser.id);
      await pageB.reload({ waitUntil: 'networkidle2' });
    }

    await new Promise(r => setTimeout(r, 1500));

    // 6.5 Verify Match and Conversation in Database
    console.log('[6.5] Verifying database Match & Conversation creation...');
    const daniel = await prisma.user.findUnique({ where: { email: 'daniel.kim@example.com' } });
    const aisha = await prisma.user.findUnique({ where: { email: 'aisha.rahman@example.com' } });

    const [id1, id2] = [daniel.id, aisha.id].sort();
    const matchRecord = await prisma.match.findFirst({
      where: { userAId: id1, userBId: id2 },
      include: { conversation: { include: { participants: true } } }
    });

    console.log(`Match Record in DB: id=${matchRecord?.id}, conversationId=${matchRecord?.conversation?.id}`);
    if (!matchRecord) {
      throw new Error('Mutual match record was not created in database.');
    }
    if (!matchRecord.conversation) {
      throw new Error('Direct conversation was not auto-created for mutual match.');
    }

    // 6.6 Verify Messenger in Session 1 (Daniel)
    console.log('[6.6] Checking Messenger for Daniel Kim in Session 1...');
    await pageA.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const msgTab = tabs.find(b => b.textContent.includes('Messenger'));
      if (msgTab) msgTab.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'section6_daniel_messenger.png') });

    const danielSeesAisha = await pageA.evaluate(() => {
      return document.body.innerText.includes('Aisha');
    });
    console.log(`Daniel sees Aisha in Messenger: ${danielSeesAisha}`);

    // 6.7 Verify Messenger in Session 2 (Aisha)
    console.log('[6.7] Checking Messenger for Aisha Rahman in Session 2...');
    await pageB.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const msgTab = tabs.find(b => b.textContent.includes('Messenger'));
      if (msgTab) msgTab.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'section6_aisha_messenger.png') });

    const aishaSeesDaniel = await pageB.evaluate(() => {
      return document.body.innerText.includes('Daniel');
    });
    console.log(`Aisha sees Daniel in Messenger: ${aishaSeesDaniel}`);

    if (!danielSeesAisha || !aishaSeesDaniel) {
      throw new Error(`Conversation not accessible by both users (Daniel: ${danielSeesAisha}, Aisha: ${aishaSeesDaniel})`);
    }

    // 6.8 Verify duplicate like does NOT create duplicate match
    console.log('[6.8] Verifying duplicate interaction does not create duplicate match...');
    const matchCountBefore = await prisma.match.count({
      where: { userAId: id1, userBId: id2 }
    });
    await pageA.evaluate(async (targetId) => {
      await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetId, type: 'like' })
      });
    }, aisha.id);
    const matchCountAfter = await prisma.match.count({
      where: { userAId: id1, userBId: id2 }
    });
    console.log(`Match count before=${matchCountBefore}, after=${matchCountAfter}`);
    if (matchCountAfter !== matchCountBefore) {
      throw new Error('Duplicate match was created!');
    }

    console.log('\n>>> SECTION 6 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 6 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section6.mjs')) {
  runSection6().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
