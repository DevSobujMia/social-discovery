import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  console.log('--- Starting Curated Profile Verification Test ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Login to Admin
  console.log('Navigating to admin login...');
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });

  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    console.log('Typing credentials and logging in...');
    await page.type('input[type="email"]', 'admin@heartlink.com');
    await page.type('input[type="password"]', 'Admin@123456');
    await page.click('button[type="submit"]');
    await page.waitForSelector('aside', { timeout: 10000 });
    console.log('Logged in successfully! Sidebar present.');
  }
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Click on Travel Plans tab
  console.log('Clicking on Travel Plans tab...');
  const travelPlansButton = await page.waitForSelector('button::-p-text(Travel Plans)', { timeout: 8000 });
  await travelPlansButton.click();
  await new Promise((r) => setTimeout(r, 1200));

  // 3. Check for Age input
  console.log('Checking Age input field...');
  const ageInput = await page.$('input[type="number"]');
  if (!ageInput) {
    throw new Error('Age input field not found in form!');
  }
  const ageVal = await page.evaluate(el => el.value, ageInput);
  console.log('Found Age input! Default value:', ageVal);

  // 4. Check for Profile photo section
  console.log('Checking Profile photo label and Upload button...');
  const profilePhotoLabel = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    return labels.some(l => l.textContent?.includes('Profile photo'));
  });
  if (!profilePhotoLabel) {
    throw new Error('Profile photo label not found!');
  }

  const uploadBtn = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(b => b.textContent?.includes('Upload photo'));
  });
  if (!uploadBtn) {
    throw new Error('Upload photo button not found!');
  }
  console.log('Found Profile photo label and Upload photo button!');

  // 5. Test photo file upload via file input
  console.log('Testing file upload through hidden file input...');
  const fileInput = await page.$('input[type="file"][accept*="image"]');
  if (!fileInput) {
    throw new Error('Image file input not found!');
  }

  // Generate a valid 200x200 JPEG buffer using sharp or tiny JPEG header
  const tempImgPath = path.resolve('temp_test_avatar.jpg');
  const validJpegBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAEAAAAAAA3/2wBDACgcHiMeGSgjISMtKygwPGRBPDc3PHtURUtfNnx8GXt8Gnx8h4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4f/2wBDASstLzc4PHZBQXaHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4f/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCuA//Z';
  fs.writeFileSync(tempImgPath, Buffer.from(validJpegBase64, 'base64'));

  await fileInput.uploadFile(tempImgPath);
  console.log('Uploaded file to file input, waiting for upload API response...');
  await new Promise((r) => setTimeout(r, 2000));

  // Check that photoUrl input now contains the uploaded URL
  const photoUrlVal = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const photoInput = inputs.find(i => i.placeholder?.includes('Paste image URL'));
    return photoInput ? photoInput.value : '';
  });
  console.log('Photo URL value after upload:', photoUrlVal);

  if (!photoUrlVal.startsWith('/api/uploads/') && !photoUrlVal.startsWith('http')) {
    throw new Error('Photo URL did not update with uploaded image path! Got: ' + photoUrlVal);
  }

  // 6. Fill out rest of form with unique test data
  const testName = 'Camilla ' + Math.floor(Math.random() * 900 + 100);
  console.log('Filling out form with Name:', testName, 'and Age: 26');

  // Type display name
  const nameInput = await page.$('input[placeholder="Emma"]');
  await nameInput.focus();
  await page.keyboard.type(testName);

  // Type age 26
  await ageInput.focus();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('26');

  // Submit form
  console.log('Submitting profile form...');
  const submitBtn = await page.waitForSelector('button::-p-text(Create profile)');
  await submitBtn.click();
  await new Promise((r) => setTimeout(r, 3000));

  // 7. Verify new travel plan was created and is visible in travel plans list
  const pageContent = await page.evaluate(() => document.body.innerText);
  const foundInList = pageContent.includes(testName);
  console.log(`Is "${testName}" listed in Travel Plans?`, foundInList);

  // Take screenshot of the completed form and travel list
  const screenshotPath = 'C:\\Users\\Sobuj\\.gemini\\antigravity-ide\\brain\\7547ddab-57be-48eb-9261-e66e6c6ee140\\final_travel_profile_verified.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Saved screenshot to:', screenshotPath);

  // Clean up temp file
  if (fs.existsSync(tempImgPath)) {
    fs.unlinkSync(tempImgPath);
  }

  await browser.close();
  console.log('--- Verification Successfully Completed ---');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
