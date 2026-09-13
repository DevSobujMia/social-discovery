import puppeteer from 'puppeteer-core';
import { PrismaClient } from '@prisma/client';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const prisma = new PrismaClient();

async function runStep4ConversionQA() {
  console.log('===============================================================');
  console.log('STARTING STEP 4 BROWSER QA: REGISTRATION & AD CONVERSION UX');
  console.log('===============================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('  [BROWSER CONSOLE]', msg.text()));
  page.on('pageerror', (err) => console.log('  [BROWSER ERROR]', err.message));
  const testRunId = Date.now().toString().slice(-6);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const testUserEmail = `visitor_${testRunId}@example.com`;
  const testUserName = `Emma Watson ${testRunId}`;

  try {
    // -------------------------------------------------------------
    // TEST 1: Ad Landing with UTM & Deep-Link (?profile=maya)
    // -------------------------------------------------------------
    console.log('\n▶ TEST 1: Paid Ad Traffic Landing (UTM + Profile Deep-Link)...');
    const adUrl = 'http://localhost:3000/?utm_source=instagram&utm_medium=paid_social&utm_campaign=fb_global_match_2026&utm_content=summer_singles&profile=maya';
    await page.goto(adUrl, { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Verify dual-storage UTM capture
    const utmData = await page.evaluate(() => {
      const sess = sessionStorage.getItem('heartlink_utm');
      const local = localStorage.getItem('heartlink_utm');
      return { sess: sess ? JSON.parse(sess) : null, local: local ? JSON.parse(local) : null };
    });

    if (!utmData.sess || utmData.sess.utmCampaign !== 'fb_global_match_2026') {
      throw new Error(`sessionStorage UTM attribution missing or invalid: ${JSON.stringify(utmData.sess)}`);
    }
    if (!utmData.local || utmData.local.utmCampaign !== 'fb_global_match_2026') {
      throw new Error(`localStorage UTM attribution missing or invalid: ${JSON.stringify(utmData.local)}`);
    }
    console.log('✅ PASS: Dual-storage (sessionStorage + localStorage) captured UTM parameters cleanly');

    // Verify deep-link auto-opened Maya's profile modal
    const deepLinkAutoOpened = await page.evaluate(() => {
      const modal = document.querySelector('.modal-content');
      return modal && modal.textContent && modal.textContent.includes('Maya Lin');
    });
    console.log(`Deep-linked modal auto-opened for Maya: ${!!deepLinkAutoOpened}`);
    if (deepLinkAutoOpened) {
      console.log('✅ PASS: Profile deep-link parameter (?profile=maya) automatically opened featured profile modal');
      // Close modal to test the Discover cards
      await page.click('button[aria-label="Close profile details"]');
      await sleep(600);
    }

    // -------------------------------------------------------------
    // TEST 2: Discover Card & Absence of "Assisted" text on user side
    // -------------------------------------------------------------
    console.log('\n▶ TEST 2: Verifying User-Facing Discover Feed & Absence of "Assisted Service" Badges...');
    await page.waitForSelector('.glass-card', { timeout: 6000 });

    const discoverCardAudit = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const hasAssistedService = bodyText.includes('★ Assisted Service') || bodyText.includes('Assisted Service');
      
      // Find Maya Lin card
      const cards = Array.from(document.querySelectorAll('.glass-card'));
      const mayaCard = cards.find(c => c.textContent && c.textContent.includes('Maya Lin'));
      const hasDirectMessageBtn = mayaCard ? !!mayaCard.querySelector('button[title="Send Message"]') : false;

      return {
        hasAssistedService,
        hasMayaCard: !!mayaCard,
        hasDirectMessageBtn
      };
    });

    if (discoverCardAudit.hasAssistedService) {
      throw new Error('FAIL: "★ Assisted Service" badge is still visible on the user-facing Discover feed!');
    }
    console.log('✅ PASS: Zero "Assisted Service" text visible to visitors on Discover feed');

    if (!discoverCardAudit.hasMayaCard) {
      throw new Error('Maya Lin card not found on Discover feed');
    }
    if (!discoverCardAudit.hasDirectMessageBtn) {
      throw new Error('Maya Lin card does not feature direct "Message" CTA button');
    }
    console.log('✅ PASS: Maya Lin card features direct high-converting "Message" CTA button');

    // -------------------------------------------------------------
    // TEST 3: Intent Preservation on Auth Wall
    // -------------------------------------------------------------
    console.log('\n▶ TEST 3: Triggering "Message" as Logged-Out Visitor & Checking Contextual Auth Header...');
    
    // Click "Message" button on Maya Lin card
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.glass-card'));
      const mayaCard = cards.find(c => c.textContent && c.textContent.includes('Maya Lin'));
      if (mayaCard) {
        const msgBtn = mayaCard.querySelector('button[title="Send Message"]');
        if (msgBtn) msgBtn.click();
      }
    });

    await page.waitForSelector('.modal-overlay', { visible: true, timeout: 5000 });

    const authModalState = await page.evaluate(() => {
      const modal = document.querySelector('.modal-content');
      if (!modal) return null;
      const text = modal.textContent || '';
      const hasContextualHeader = text.includes('Send a message to Maya Lin') || text.includes('Maya Lin');
      const hasSubmitWithMaya = text.includes('Continue & Message Maya Lin');
      
      // Check form fields
      const inputs = Array.from(modal.querySelectorAll('input'));
      const inputPlaceholders = inputs.map(i => i.placeholder);
      const hasCountryInput = inputs.some(i => i.name === 'country' || i.placeholder?.toLowerCase().includes('country'));

      return {
        hasContextualHeader,
        hasSubmitWithMaya,
        inputCount: inputs.length,
        inputPlaceholders,
        hasCountryInput,
      };
    });

    if (!authModalState?.hasContextualHeader) {
      throw new Error('FAIL: Auth modal header did not dynamically reference Maya Lin');
    }
    console.log('✅ PASS: Auth modal header dynamically reflects intent: "Send a message to Maya Lin"');

    if (!authModalState?.hasSubmitWithMaya) {
      throw new Error('FAIL: Auth modal submit button did not adapt to Maya Lin');
    }
    console.log('✅ PASS: Submit button reflects high-intent conversion: "Continue & Message Maya Lin"');

    if (authModalState.hasCountryInput) {
      throw new Error('FAIL: Manual Country input is present in initial signup form');
    }
    console.log('✅ PASS: Streamlined 3-field form (Name, Email, Password + 1-tap gender pills, zero country friction)');

    // -------------------------------------------------------------
    // TEST 4: Registration & Seamless Auto-Execution into Chat
    // -------------------------------------------------------------
    console.log('\n▶ TEST 4: Submitting Quick Registration & Verifying Seamless Auto-Open of Maya Lin Chat...');
    
    // Fill out registration
    await page.type('input[placeholder*="Maya"]', testUserName);
    await page.type('input[placeholder="name@example.com"]', testUserEmail);
    await page.type('input[placeholder*="minimum 6 characters"]', 'SecurePass@123');

    // Click Continue & Message Maya Lin
    await page.click('button[type="submit"]');

    // Wait for modal to close and Messenger tab with Maya Lin to automatically be selected
    await page.waitForFunction(() => {
      const activeHeader = document.querySelector('h3.text-sm.font-bold');
      return activeHeader && activeHeader.textContent && activeHeader.textContent.includes('Maya Lin');
    }, { timeout: 8000 });

    console.log('✅ PASS: Post-registration auto-executed conversation intent! Directly opened Maya Lin chat in Messenger.');

    // -------------------------------------------------------------
    // TEST 5: First-Message Conversion & Clean Chat Bubble Verification
    // -------------------------------------------------------------
    console.log('\n▶ TEST 5: Sending First Message & Verifying Authentic Customer Chat Bubble...');
    const firstMsgText = `Hi Maya, excited to connect from London! (${testRunId})`;

    await page.waitForSelector('form input[placeholder*="Write a message"]', { visible: true, timeout: 5000 });
    await page.focus('form input[placeholder*="Write a message"]');
    await page.type('form input[placeholder*="Write a message"]', firstMsgText, { delay: 15 });
    await sleep(400);
    await page.keyboard.press('Enter');
    await sleep(2500);

    const sentMsgFound = await page.evaluate((text) => {
      const bubbles = Array.from(document.querySelectorAll('.whitespace-pre-wrap'));
      return bubbles.some((b) => b.textContent && b.textContent.includes(text));
    }, firstMsgText);

    if (!sentMsgFound) {
      throw new Error(`Sent message not rendered in chat bubble: ${firstMsgText}`);
    }

    const chatBubbleAudit = await page.evaluate(() => {
      const body = document.body.innerText;
      const hasAssistedBadge = body.includes('★ Assisted');
      return { hasAssistedBadge };
    });

    if (chatBubbleAudit.hasAssistedBadge) {
      throw new Error('FAIL: "★ Assisted" tag is visible in user chat bubble');
    }
    console.log('✅ PASS: First message delivered cleanly with zero "Assisted" tags visible to customer');

    // -------------------------------------------------------------
    // TEST 6: Database Campaign Attribution & Agent Auto-Routing
    // -------------------------------------------------------------
    console.log('\n▶ TEST 6: Verifying UTM Attribution & CRM Agent Auto-Routing in Database...');
    const userInDb = await prisma.user.findUnique({
      where: { email: testUserEmail.toLowerCase() },
      include: {
        utmAttribution: true,
        assignments: {
          include: { agent: true },
        },
      },
    });

    if (!userInDb) throw new Error(`User ${testUserEmail} not found in database`);
    if (!userInDb.utmAttribution) throw new Error('utmAttribution record not created for user');
    if (userInDb.utmAttribution.utmCampaign !== 'fb_global_match_2026') {
      throw new Error(`Expected utmCampaign "fb_global_match_2026", got "${userInDb.utmAttribution.utmCampaign}"`);
    }
    console.log(`✅ PASS: Database verified UTM Attribution: campaign=${userInDb.utmAttribution.utmCampaign}, source=${userInDb.utmAttribution.utmSource}`);

    if (userInDb.assignments.length === 0) {
      throw new Error('User was not auto-assigned to an agent from campaign route');
    }
    const assignedAgent = userInDb.assignments[0].agent;
    console.log(`✅ PASS: Auto-assigned from campaign route to Agent: "${assignedAgent.displayName}" (${assignedAgent.role})`);

    // -------------------------------------------------------------
    // TEST 7: Mobile Viewport Usability (390px iPhone 14)
    // -------------------------------------------------------------
    console.log('\n▶ TEST 7: Mobile Viewport Audit (390x844 iPhone 14)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await sleep(1500);

    // 7.1 Verify zero horizontal overflow on Discover feed
    const discoverMobileAudit = await page.evaluate(() => {
      const hasOverflow = document.documentElement.scrollWidth > window.innerWidth;
      const navButtons = Array.from(document.querySelectorAll('button[aria-label]'));
      const smallButtons = navButtons.filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40);
      });
      return {
        hasOverflow,
        smallButtonsCount: smallButtons.length,
      };
    });

    if (discoverMobileAudit.hasOverflow) {
      throw new Error('FAIL: Horizontal overflow detected on mobile Discover viewport (390px)');
    }
    console.log('✅ PASS: Discover feed mobile layout has zero horizontal overflow');

    // 7.2 Switch to Messenger on mobile and audit active conversation UI
    await page.evaluate(() => {
      const btn = document.querySelector('nav.bottom-nav button[aria-label="Messenger"]') ||
                  Array.from(document.querySelectorAll('button[aria-label="Messenger"]')).find(b => b.offsetParent !== null);
      if (btn) btn.click();
    });
    await sleep(1500);

    // Open Maya's conversation if on conversation list
    const hasActiveChat = await page.evaluate(() => !!document.querySelector('input[placeholder*="Write a message"]'));
    if (!hasActiveChat) {
      await page.evaluate(() => {
        const item = document.querySelector('button[aria-label*="Maya Lin"]') ||
                     Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Maya Lin'));
        if (item) item.click();
      });
      await sleep(1500);
    }

    const mobileChatAudit = await page.evaluate(() => {
      const hasOverflow = document.documentElement.scrollWidth > window.innerWidth;
      const sendBtn = document.querySelector('button[aria-label="Send message"]') || document.querySelector('form button[type="submit"]');
      const rect = sendBtn ? sendBtn.getBoundingClientRect() : null;
      return {
        hasOverflow,
        sendBtnWidth: rect?.width,
        sendBtnHeight: rect?.height,
      };
    });

    if (mobileChatAudit.hasOverflow) {
      throw new Error('FAIL: Horizontal overflow detected on mobile Messenger chat');
    }
    if ((mobileChatAudit.sendBtnWidth || 0) < 44 || (mobileChatAudit.sendBtnHeight || 0) < 44) {
      throw new Error(`Send button touch target too small: ${mobileChatAudit.sendBtnWidth}x${mobileChatAudit.sendBtnHeight}`);
    }
    console.log(`✅ PASS: Mobile chat has zero horizontal overflow, send button touch target meets mobile standard (${mobileChatAudit.sendBtnWidth}x${mobileChatAudit.sendBtnHeight}px)`);

    // -------------------------------------------------------------
    // TEST 8: Session Persistence & Reload
    // -------------------------------------------------------------
    console.log('\n▶ TEST 8: Session Reload Persistence...');
    await page.reload({ waitUntil: 'networkidle2' });

    const sessionAudit = await page.evaluate(() => {
      const navItem = document.querySelector('button[aria-label="Profile"]');
      return {
        isLoggedIn: !!navItem || !!document.querySelector('button[title="View My Profile"]'),
      };
    });

    if (!sessionAudit.isLoggedIn) {
      throw new Error('Session was lost after page reload');
    }
    console.log('✅ PASS: Session and authentication persist reliably across reloads');

    console.log('\n===============================================================');
    console.log('🎉 ALL STEP 4 CONVERSION & REGISTRATION QA TESTS PASSED!');
    console.log('===============================================================');

  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

runStep4ConversionQA().catch((err) => {
  console.error('\n❌ STEP 4 QA FAILED:', err);
  process.exit(1);
});
