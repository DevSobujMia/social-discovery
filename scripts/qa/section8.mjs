import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection8() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 8 — BLOCK / REPORT (BROWSER QA)');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const consoleErrors = [];

  try {
    const daniel = await prisma.user.findUnique({ where: { email: 'daniel.kim@example.com' } });
    const aisha = await prisma.user.findUnique({ where: { email: 'aisha.rahman@example.com' } });

    // Session 1: Daniel
    console.log('[8.1] Logging into Daniel Kim session...');
    const pageA = await browser.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });
    await pageA.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageA.waitForSelector('.modal-overlay', { timeout: 5000 });
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const danielBtn = btns.find(b => b.textContent.includes('Daniel Kim'));
      if (danielBtn) danielBtn.click();
    });
    await pageA.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });

    // Session 2: Aisha in incognito context
    console.log('[8.2] Logging into Aisha Rahman session in separate context...');
    const contextB = await browser.createBrowserContext();
    const pageB = await contextB.newPage();
    await pageB.setViewport({ width: 1280, height: 800 });
    await pageB.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageB.waitForSelector('.modal-overlay', { timeout: 5000 });
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const aishaBtn = btns.find(b => b.textContent.includes('Aisha Rahman'));
      if (aishaBtn) aishaBtn.click();
    });
    await pageB.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });

    // 8.3 Daniel blocks Aisha
    console.log('[8.3] Daniel executing block action on Aisha...');
    const blockRes = await pageA.evaluate(async (targetId) => {
      const res = await fetch('/api/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetId })
      });
      return { status: res.status, data: await res.json() };
    }, aisha.id);
    console.log('Block API Response:', blockRes);
    if (blockRes.status !== 200 || !blockRes.data.success) {
      throw new Error(`Block action failed with status ${blockRes.status}`);
    }

    // 8.4 Verify database state
    console.log('[8.4] Verifying database block record and conversation status...');
    const blockInDb = await prisma.blockedUser.findFirst({
      where: { blockerId: daniel.id, blockedId: aisha.id }
    });
    console.log(`Blocked record exists in DB: ${blockInDb !== null}`);
    if (!blockInDb) {
      throw new Error('BlockedUser record was not created in DB.');
    }

    const conv = await prisma.conversation.findFirst({
      where: {
        participants: {
          some: { userId: daniel.id }
        },
        AND: {
          participants: {
            some: { userId: aisha.id }
          }
        }
      }
    });
    console.log(`Shared conversation status in DB: "${conv?.status}"`);
    if (conv?.status !== 'blocked') {
      throw new Error(`Expected conversation status "blocked", got "${conv?.status}"`);
    }

    // 8.5 Verify Aisha CANNOT continue messaging Daniel
    console.log('[8.5] Verifying blocked user cannot send messages...');
    const aishaSendAttempt = await pageB.evaluate(async (convId) => {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Are you there? Testing block prevention.' })
      });
      return { status: res.status, data: await res.json() };
    }, conv.id);
    console.log('Blocked messaging attempt response:', aishaSendAttempt);
    if (aishaSendAttempt.status !== 400 && aishaSendAttempt.status !== 403) {
      throw new Error(`Security violation: Blocked user was able to send message! Status: ${aishaSendAttempt.status}`);
    }

    // 8.6 Verify Report Action
    console.log('[8.6] Testing User Report action...');
    const reportRes = await pageA.evaluate(async (targetId) => {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetId,
          reason: 'harassment',
          description: 'Automated Browser QA Report Verification'
        })
      });
      return { status: res.status, data: await res.json() };
    }, aisha.id);
    console.log('Report API Response:', reportRes);
    if (reportRes.status !== 201 || !reportRes.data.success) {
      throw new Error(`Report action failed with status ${reportRes.status}`);
    }

    const reportInDb = await prisma.report.findFirst({
      where: { reporterId: daniel.id, reportedUserId: aisha.id },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`Report recorded in DB: id=${reportInDb?.id}, reason="${reportInDb?.reason}"`);
    if (!reportInDb) {
      throw new Error('Report was not saved to database.');
    }

    // 8.7 Clean Unblock to keep test environment healthy
    console.log('[8.7] Unblocking to restore test environment state...');
    await pageA.evaluate(async (targetId) => {
      await fetch(`/api/block?userId=${targetId}`, { method: 'DELETE' });
    }, aisha.id);
    // Restore conversation status
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { status: 'active' }
    });
    console.log('Unblocked and conversation reactivated.');

    console.log('\n>>> SECTION 8 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 8 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section8.mjs')) {
  runSection8().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
