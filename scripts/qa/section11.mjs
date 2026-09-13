import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection11() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 11 — CAMPAIGN / UTM → AGENT ROUTING (BROWSER QA)');
  console.log('==================================================\n');

  // Step 0: Ensure test campaigns exist with routes to Sarah and Alex
  const sarah = await prisma.staffAccount.findUnique({ where: { email: 'sarah@heartlink.com' } });
  const alex = await prisma.staffAccount.findUnique({ where: { email: 'alex@heartlink.com' } });
  const admin = await prisma.staffAccount.findUnique({ where: { email: 'admin@heartlink.com' } });

  if (!sarah || !alex || !admin) {
    throw new Error('Missing staff accounts in database.');
  }

  // Ensure Campaign 1: fb_global_match_2026 -> Sarah
  let camp1 = await prisma.campaign.findUnique({ where: { utmCampaign: 'fb_global_match_2026' } });
  if (!camp1) {
    camp1 = await prisma.campaign.create({
      data: {
        name: 'FB Global Match Campaign',
        platform: 'facebook',
        utmSource: 'facebook',
        utmCampaign: 'fb_global_match_2026',
        createdById: admin.id,
      }
    });
  }
  await prisma.campaignAgentRoute.deleteMany({ where: { campaignId: camp1.id } });
  await prisma.campaignAgentRoute.create({
    data: { campaignId: camp1.id, agentId: sarah.id, createdById: admin.id, isActive: true }
  });

  // Ensure Campaign 2: ig_coaching_2026 -> Alex
  let camp2 = await prisma.campaign.findUnique({ where: { utmCampaign: 'ig_coaching_2026' } });
  if (!camp2) {
    camp2 = await prisma.campaign.create({
      data: {
        name: 'IG Coaching Campaign',
        platform: 'instagram',
        utmSource: 'instagram',
        utmCampaign: 'ig_coaching_2026',
        createdById: admin.id,
      }
    });
  }
  await prisma.campaignAgentRoute.deleteMany({ where: { campaignId: camp2.id } });
  await prisma.campaignAgentRoute.create({
    data: { campaignId: camp2.id, agentId: alex.id, createdById: admin.id, isActive: true }
  });

  console.log('Campaigns configured:');
  console.log('- fb_global_match_2026 -> Sarah Jenkins');
  console.log('- ig_coaching_2026 -> Alex Carter\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // ----------------------------------------------------
    // PART 1: VISITOR A (Facebook Ad -> Routed to Sarah)
    // ----------------------------------------------------
    const contextA = await browser.createBrowserContext();
    const pageA = await contextA.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });

    const timeA = Date.now();
    const leadEmailA = `fb_lead_${timeA}@example.com`;
    const leadNameA = `FB Lead ${timeA.toString().slice(-4)}`;

    console.log(`[11.1] Visitor A clicking Facebook Ad URL...`);
    const adUrlA = `http://localhost:3000/?utm_source=facebook&utm_medium=paid&utm_campaign=fb_global_match_2026`;
    await pageA.goto(adUrlA, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Verify UTM in sessionStorage
    const storedUtmA = await pageA.evaluate(() => sessionStorage.getItem('heartlink_utm'));
    console.log(`Visitor A captured UTM in sessionStorage: ${storedUtmA}`);
    if (!storedUtmA || !storedUtmA.includes('fb_global_match_2026')) {
      throw new Error('Visitor A did not capture UTM campaign in sessionStorage.');
    }

    // Open Auth Modal -> Switch to Signup
    console.log('[11.2] Visitor A opening signup modal and registering...');
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageA.waitForSelector('.modal-overlay', { timeout: 5000 });

    await pageA.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.modal-overlay button'));
      const createBtn = links.find(b => b.textContent.includes('Create one here') || b.textContent.includes('Create Free Account') || b.textContent.includes('Sign up'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Fill registration form for Visitor A
    const nameInputA = await pageA.waitForSelector('.modal-overlay input[placeholder*="Maya Lin"]', { timeout: 5000 });
    await nameInputA.type(leadNameA);

    const emailInputA = await pageA.waitForSelector('.modal-overlay input[type="email"]', { timeout: 5000 });
    await emailInputA.type(leadEmailA);

    const pwdInputA = await pageA.waitForSelector('.modal-overlay input[type="password"]', { timeout: 5000 });
    await pwdInputA.type('Password@123');

    // Submit form
    const submitBtnA = await pageA.waitForSelector('.modal-overlay button[type="submit"]', { timeout: 5000 });
    await submitBtnA.click();
    await pageA.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Visitor A signup successful and modal closed.');

    // Verify user created in DB
    const userA = await prisma.user.findUnique({
      where: { email: leadEmailA },
      include: {
        utmAttribution: true,
        assignments: { where: { status: 'active' }, include: { agent: true } }
      }
    });
    console.log(`User A created in DB: id=${userA?.id}, email=${userA?.email}`);
    if (!userA) throw new Error('User A was not created in database.');

    console.log(`User A UTM Attribution: campaign=${userA.utmAttribution?.utmCampaign}`);
    if (userA.utmAttribution?.utmCampaign !== 'fb_global_match_2026') {
      throw new Error(`Attribution mismatch: expected fb_global_match_2026, got ${userA.utmAttribution?.utmCampaign}`);
    }

    const assignedAgentA = userA.assignments?.[0]?.agent;
    console.log(`User A Auto-Assigned Agent: ${assignedAgentA?.displayName} (${assignedAgentA?.email})`);
    if (assignedAgentA?.email !== 'sarah@heartlink.com') {
      throw new Error(`Auto-routing failure: expected sarah@heartlink.com, got ${assignedAgentA?.email}`);
    }

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'section11_lead_a_signed_up.png') });
    await contextA.close();

    // ----------------------------------------------------
    // PART 2: VISITOR B (Instagram Ad -> Routed to Alex)
    // ----------------------------------------------------
    const contextB = await browser.createBrowserContext();
    const pageB = await contextB.newPage();
    await pageB.setViewport({ width: 1280, height: 800 });

    const timeB = Date.now();
    const leadEmailB = `ig_lead_${timeB}@example.com`;
    const leadNameB = `IG Lead ${timeB.toString().slice(-4)}`;

    console.log(`\n[11.3] Visitor B clicking Instagram Ad URL...`);
    const adUrlB = `http://localhost:3000/?utm_source=instagram&utm_medium=cpc&utm_campaign=ig_coaching_2026`;
    await pageB.goto(adUrlB, { waitUntil: 'networkidle2' });

    // Wait for client-side hydration to capture UTM in sessionStorage
    await pageB.waitForFunction(
      () => sessionStorage.getItem('heartlink_utm') && sessionStorage.getItem('heartlink_utm').includes('ig_coaching_2026'),
      { timeout: 8000 }
    );
    const storedUtmB = await pageB.evaluate(() => sessionStorage.getItem('heartlink_utm'));
    console.log(`Visitor B captured UTM in sessionStorage: ${storedUtmB}`);

    // Open Auth Modal -> Switch to Signup
    console.log('[11.4] Visitor B opening signup modal and registering...');
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageB.waitForSelector('.modal-overlay', { timeout: 5000 });

    await pageB.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.modal-overlay button'));
      const createBtn = links.find(b => b.textContent.includes('Create one here') || b.textContent.includes('Create Free Account') || b.textContent.includes('Sign up'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Fill registration form for Visitor B
    const nameInputB = await pageB.waitForSelector('.modal-overlay input[placeholder*="Maya Lin"]', { timeout: 5000 });
    await nameInputB.type(leadNameB);

    const emailInputB = await pageB.waitForSelector('.modal-overlay input[type="email"]', { timeout: 5000 });
    await emailInputB.type(leadEmailB);

    const pwdInputB = await pageB.waitForSelector('.modal-overlay input[type="password"]', { timeout: 5000 });
    await pwdInputB.type('Password@123');

    // Submit form
    const submitBtnB = await pageB.waitForSelector('.modal-overlay button[type="submit"]', { timeout: 5000 });
    await submitBtnB.click();
    await pageB.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('Visitor B signup successful and modal closed.');

    // Verify user B created in DB
    const userB = await prisma.user.findUnique({
      where: { email: leadEmailB },
      include: {
        utmAttribution: true,
        assignments: { where: { status: 'active' }, include: { agent: true } }
      }
    });
    console.log(`User B created in DB: id=${userB?.id}, email=${userB?.email}`);
    if (!userB) throw new Error('User B was not created in database.');

    console.log(`User B UTM Attribution: campaign=${userB.utmAttribution?.utmCampaign}`);
    if (userB.utmAttribution?.utmCampaign !== 'ig_coaching_2026') {
      throw new Error(`Attribution mismatch: expected ig_coaching_2026, got ${userB.utmAttribution?.utmCampaign}`);
    }

    const assignedAgentB = userB.assignments?.[0]?.agent;
    console.log(`User B Auto-Assigned Agent: ${assignedAgentB?.displayName} (${assignedAgentB?.email})`);
    if (assignedAgentB?.email !== 'alex@heartlink.com') {
      throw new Error(`Auto-routing failure: expected alex@heartlink.com, got ${assignedAgentB?.email}`);
    }

    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'section11_lead_b_signed_up.png') });
    await contextB.close();

    // ----------------------------------------------------
    // PART 3: AGENT CRM ISOLATION VERIFICATION IN BROWSER
    // ----------------------------------------------------
    console.log('\n[11.5] Verifying Agent CRM routing and lead isolation in browser...');
    const adminContext = await browser.createBrowserContext();
    const adminPage = await adminContext.newPage();
    await adminPage.setViewport({ width: 1366, height: 850 });

    await adminPage.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });

    // 3.1 Login as Agent Sarah
    await adminPage.waitForSelector('button', { timeout: 6000 });
    const isAside = await adminPage.$('aside');
    console.log('Is aside already present in adminPage:', !!isAside);
    if (isAside) {
      const switched = await adminPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('header button'));
        const b = btns.find(el => el.textContent.includes('Agent Sarah'));
        if (b) {
          b.click();
          return true;
        }
        return false;
      });
      console.log('Clicked Agent Sarah in header:', switched);
    } else {
      console.log('Clicking Sarah instant login on login card...');
      await adminPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const sarah = btns.find(b => b.textContent && b.textContent.includes('Sarah'));
        if (sarah) sarah.click();
      });
      await adminPage.waitForSelector('aside', { timeout: 10000 });
    }

    const headerTextBefore = await adminPage.evaluate(() => document.querySelector('header')?.innerText || 'NO_HEADER');
    console.log('Header text before wait:', headerTextBefore);

    await adminPage.waitForFunction(
      () => {
        const text = document.querySelector('header')?.innerText || '';
        return text.includes('Sarah Jenkins') || text.includes('Sarah');
      },
      { timeout: 8000 }
    );
    console.log('Sarah logged in successfully!');

    // Switch to User Management tab
    const asideBtnsSarah = await adminPage.$$('aside button');
    for (const btn of asideBtnsSarah) {
      const text = await adminPage.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        break;
      }
    }
    await adminPage.waitForSelector('table', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1000));

    const sarahTable = await adminPage.evaluate(() => document.querySelector('table').innerText);
    const sarahSeesLeadA = sarahTable.includes(leadEmailA);
    const sarahSeesLeadB = sarahTable.includes(leadEmailB);
    console.log(`Sarah sees Lead A (FB): ${sarahSeesLeadA} (expected: true)`);
    console.log(`Sarah sees Lead B (IG): ${sarahSeesLeadB} (expected: false)`);

    if (!sarahSeesLeadA) throw new Error('Sarah cannot see her routed Lead A!');
    if (sarahSeesLeadB) throw new Error('RBAC Leak: Sarah can see Alex\'s routed Lead B!');

    // 3.2 Switch to Agent Alex
    console.log('Switching to Agent Alex...');
    await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      const b = btns.find(el => el.textContent.includes('Agent Alex'));
      if (b) b.click();
    });
    await adminPage.waitForFunction(
      () => document.querySelector('header')?.innerText.includes('Alex Carter'),
      { timeout: 8000 }
    );
    await new Promise(r => setTimeout(r, 1000));

    const alexTable = await adminPage.evaluate(() => document.querySelector('table').innerText);
    const alexSeesLeadA = alexTable.includes(leadEmailA);
    const alexSeesLeadB = alexTable.includes(leadEmailB);
    console.log(`Alex sees Lead A (FB): ${alexSeesLeadA} (expected: false)`);
    console.log(`Alex sees Lead B (IG): ${alexSeesLeadB} (expected: true)`);

    if (alexSeesLeadA) throw new Error('RBAC Leak: Alex can see Sarah\'s routed Lead A!');
    if (!alexSeesLeadB) throw new Error('Alex cannot see his routed Lead B!');

    // 3.3 Switch to Super Admin
    console.log('Switching to Super Admin to verify master visibility...');
    await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      const b = btns.find(el => el.textContent.trim() === 'Admin');
      if (b) b.click();
    });
    await adminPage.waitForFunction(
      () => {
        const text = document.querySelector('header')?.innerText || '';
        return text.includes('System Administrator') || text.includes('ADMIN') || text.includes('admin');
      },
      { timeout: 8000 }
    );
    await new Promise(r => setTimeout(r, 1500));

    const adminTable = await adminPage.evaluate(() => document.querySelector('table').innerText);
    const adminSeesLeadA = adminTable.includes(leadEmailA);
    const adminSeesLeadB = adminTable.includes(leadEmailB);
    console.log(`Super Admin sees Lead A: ${adminSeesLeadA} (expected: true)`);
    console.log(`Super Admin sees Lead B: ${adminSeesLeadB} (expected: true)`);

    if (!adminSeesLeadA || !adminSeesLeadB) {
      throw new Error('Super Admin cannot see all campaign leads!');
    }

    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'section11_admin_campaign_leads.png') });
    await adminContext.close();

    console.log('\n>>> SECTION 11 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 11 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section11.mjs')) {
  runSection11().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
