import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

async function generate() {
  const oliviaPath = path.resolve('uploads/profiles/w_blonde_street_eb7cd076-c2de-4c55-ba5f-1c4c23de8b14.jpg');
  const chloePath = path.resolve('uploads/profiles/w_brunette_dinner_38dcc320-bad4-4f74-9c0b-a5403febecb7.png');

  const oliviaBase64 = `data:image/jpeg;base64,${fs.readFileSync(oliviaPath).toString('base64')}`;
  const chloeBase64 = `data:image/png;base64,${fs.readFileSync(chloePath).toString('base64')}`;

  // 1. Template for 1080 x 1350 (4:5 aspect ratio - optimized for Facebook Feed)
  // Rendered at 540 x 675 with deviceScaleFactor: 2 = 1080 x 1350
  const html4x5 = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>City Host 4:5 Facebook Ad</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    html, body {
      width: 540px;
      height: 675px;
      overflow: hidden;
      background: radial-gradient(circle at 50% 12%, #0e1933 0%, #030712 55%, #020409 100%);
      color: #fff;
    }
    .wrapper {
      width: 540px;
      height: 675px;
      padding: 24px 22px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
    }

    /* Main Headline */
    .hero-title {
      font-size: 32px;
      font-weight: 850;
      letter-spacing: -0.8px;
      text-align: center;
      color: #ffffff;
      line-height: 1.15;
      text-shadow: 0 3px 12px rgba(0,0,0,0.6);
    }

    /* Travellers Visiting Soon Header */
    .profiles-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 2px;
      margin-top: 2px;
    }
    .travellers-label {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 13.5px;
      font-weight: 800;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: #f8fafc;
    }
    .plane-icon {
      color: #f43f5e;
      display: flex;
      align-items: center;
    }
    .online-now-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3.5px 10px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.15);
      border: 1.5px solid rgba(16, 185, 129, 0.4);
      font-size: 12px;
      font-weight: 750;
      color: #34d399;
    }
    .online-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }

    /* Enlarged Profiles Grid */
    .profiles-grid {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .profile-card {
      background: rgba(15, 23, 42, 0.9);
      border: 1.5px solid rgba(71, 85, 105, 0.65);
      border-radius: 18px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
    }
    .photo-container {
      position: relative;
      width: 100%;
      height: 142px;
      border-radius: 12px;
      overflow: hidden;
      background: #020617;
    }
    .photo-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .photo-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%);
      pointer-events: none;
    }
    .photo-online-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(2, 6, 23, 0.9);
      border: 1.5px solid rgba(16, 185, 129, 0.5);
      display: flex;
      align-items: center;
      gap: 5px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.6);
    }
    .photo-online-badge .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 6px #34d399;
    }
    .photo-online-badge span {
      font-size: 11px;
      font-weight: 800;
      color: #34d399;
    }
    .card-info {
      padding: 7px 2px 7px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .name-age {
      font-size: 15.5px;
      font-weight: 850;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 4px;
      letter-spacing: -0.3px;
    }
    .flag-tag {
      font-size: 12px;
      font-weight: 750;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn-send {
      width: 100%;
      padding: 9px 10px;
      border-radius: 12px;
      background: #ffffff;
      border: none;
      color: #09090b;
      font-size: 13px;
      font-weight: 850;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 3px 12px rgba(255, 255, 255, 0.2);
    }
    .btn-send svg {
      width: 14px;
      height: 14px;
      color: #f43f5e;
      fill: #f43f5e;
    }

    /* Match Funnel Card */
    .funnel-card {
      width: 100%;
      background: rgba(11, 18, 36, 0.92);
      border: 1.5px solid rgba(51, 65, 85, 0.75);
      border-radius: 20px;
      padding: 16px 18px 14px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
    }
    .funnel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .funnel-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 16px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.3px;
    }
    .sparkle-icon {
      color: #f43f5e;
    }
    .custom-filter {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }
    .section-label {
      font-size: 10.5px;
      font-weight: 800;
      color: #94a3b8;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .gender-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .gender-btn {
      padding: 10px 12px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      font-size: 14px;
      font-weight: 750;
    }
    .gender-btn.active {
      background: rgba(30, 41, 59, 0.75);
      border: 1.5px solid rgba(100, 116, 139, 0.8);
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .gender-btn.inactive {
      background: rgba(15, 23, 42, 0.35);
      border: 1px solid rgba(30, 41, 59, 0.6);
      color: #64748b;
    }
    .gender-symbol-female {
      color: #ec4899;
      font-size: 15px;
      font-weight: 800;
    }
    .gender-symbol-male {
      color: #3b82f6;
      font-size: 15px;
      font-weight: 800;
    }
    .age-row-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .age-pill {
      font-size: 11.5px;
      font-weight: 750;
      color: #ffffff;
      background: #1e293b;
      border: 1px solid #475569;
      padding: 2px 10px;
      border-radius: 9999px;
    }
    .select-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }
    .select-box {
      flex: 1;
      background: #090f1e;
      border: 1.5px solid #1e293b;
      border-radius: 11px;
      padding: 9px 12px;
      font-size: 13.5px;
      font-weight: 650;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .select-chevron {
      color: #64748b;
      font-size: 10px;
    }
    .select-to {
      font-size: 12.5px;
      font-weight: 600;
      color: #64748b;
    }
    .btn-find-match {
      width: 100%;
      padding: 13px 18px;
      border-radius: 14px;
      background: #ffffff;
      border: none;
      color: #09090b;
      font-size: 15px;
      font-weight: 850;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 8px 24px rgba(255, 255, 255, 0.18), 0 0 20px rgba(244, 63, 94, 0.18);
      margin-bottom: 12px;
    }
    .btn-find-match .sparkle {
      color: #f43f5e;
      display: flex;
    }
    .btn-find-match .arrow {
      color: #09090b;
      font-size: 17px;
      font-weight: 700;
      margin-left: 2px;
    }
    .trust-badges {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 11px;
      font-weight: 650;
      color: #94a3b8;
    }
    .trust-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .trust-dot {
      color: #334155;
    }
    .icon-green {
      color: #10b981;
    }
    .icon-blue {
      color: #0ea5e9;
    }
    .icon-heart {
      color: #f43f5e;
    }

    /* Footer */
    .footer {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      font-weight: 500;
      color: #64748b;
    }
    .footer span {
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <h1 class="hero-title">Meet Travelers in your city.</h1>

    <div class="profiles-header">
      <div class="travellers-label">
        <span class="plane-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
          </svg>
        </span>
        TRAVELLERS VISITING SOON
      </div>
      <div class="online-now-badge">
        <div class="online-dot"></div>
        Online Now
      </div>
    </div>

    <div class="profiles-grid">
      <!-- Olivia -->
      <div class="profile-card">
        <div class="photo-container">
          <img src="${oliviaBase64}" alt="Olivia">
          <div class="photo-overlay"></div>
          <div class="photo-online-badge">
            <div class="dot"></div>
            <span>Online</span>
          </div>
        </div>
        <div class="card-info">
          <div class="name-age">
            Olivia, 29 <span class="flag-tag">US</span>
          </div>
        </div>
        <button class="btn-send">
          <svg viewBox="0 0 24 24">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
          </svg>
          Send Message
        </button>
      </div>

      <!-- Chloe -->
      <div class="profile-card">
        <div class="photo-container">
          <img src="${chloeBase64}" alt="Chloe">
          <div class="photo-overlay"></div>
          <div class="photo-online-badge">
            <div class="dot"></div>
            <span>Online</span>
          </div>
        </div>
        <div class="card-info">
          <div class="name-age">
            Chloe, 26 <span class="flag-tag">US</span>
          </div>
        </div>
        <button class="btn-send">
          <svg viewBox="0 0 24 24">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
          </svg>
          Send Message
        </button>
      </div>
    </div>

    <div class="funnel-card">
      <div class="funnel-header">
        <div class="funnel-title">
          <span class="sparkle-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            </svg>
          </span>
          Find More Companions
        </div>
        <div class="custom-filter">Custom filter</div>
      </div>

      <div class="section-label">I WANT TO MEET</div>
      <div class="gender-grid">
        <div class="gender-btn active">
          <span class="gender-symbol-female">♀</span>
          Women
        </div>
        <div class="gender-btn inactive">
          <span class="gender-symbol-male">♂</span>
          Men
        </div>
      </div>

      <div class="age-row-header">
        <div class="section-label" style="margin-bottom:0">AGE RANGE</div>
        <div class="age-pill">20 — 32 yrs</div>
      </div>

      <div class="select-row">
        <div class="select-box">
          <span>20 yrs</span>
          <span class="select-chevron">▼</span>
        </div>
        <span class="select-to">to</span>
        <div class="select-box">
          <span>32 yrs</span>
          <span class="select-chevron">▼</span>
        </div>
      </div>

      <button class="btn-find-match">
        <span class="sparkle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
        </span>
        Find My Travel Match
        <span class="arrow">→</span>
      </button>

      <div class="trust-badges">
        <div class="trust-item">
          <svg class="icon-green" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Private Chat
        </div>
        <span class="trust-dot">·</span>
        <div class="trust-item">
          <svg class="icon-blue" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Verified Trips
        </div>
        <span class="trust-dot">·</span>
        <div class="trust-item">
          <svg class="icon-heart" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
          </svg>
          Chat in City Host
        </div>
      </div>
    </div>

    <div class="footer">
      <div>Private Chat</div>
      <span>·</span>
      <div>Terms</div>
      <span>·</span>
      <div>Privacy</div>
    </div>
  </div>
</body>
</html>`;

  const outHtmlPath = path.resolve('public/ad_creative_template.html');
  fs.writeFileSync(outHtmlPath, html4x5, 'utf8');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Facebook 4:5 Feed Aspect Ratio: 540x675 * 2 = 1080x1350
  await page.setViewport({
    width: 540,
    height: 675,
    deviceScaleFactor: 2,
  });

  await page.goto(`file://${outHtmlPath}`, { waitUntil: 'networkidle0' });

  // 1. Output Facebook Feed Standard 1080 x 1350 (4:5)
  const out4x5 = path.resolve('public/cityhost_ad_1080x1350.png');
  await page.screenshot({
    path: out4x5,
    type: 'png',
  });
  console.log('Saved 1080x1350 Facebook Feed Ad:', out4x5);

  // Also overwrite cityhost_ad_creative_hd.png so existing links point to this perfectly scaled image
  const outHd = path.resolve('public/cityhost_ad_creative_hd.png');
  fs.copyFileSync(out4x5, outHd);

  await browser.close();
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
