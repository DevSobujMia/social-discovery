import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');

const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="50%" stop-color="#e11d48" />
      <stop offset="100%" stop-color="#9333ea" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="128" fill="#090d16" />
  <rect x="16" y="16" width="480" height="480" rx="112" fill="none" stroke="#262e3d" stroke-width="8" />
  <path d="M256 420 C140 330 64 250 64 168 C64 104 112 56 176 56 C214 56 242 76 256 100 C270 76 298 56 336 56 C400 56 448 104 448 168 C448 250 372 330 256 420 Z" fill="url(#brandGrad)" />
</svg>
`;

async function generate() {
  const svgBuffer = Buffer.from(svg);
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.ico'));
  console.log('✅ Icons generated in public directory successfully.');
}

generate().catch(console.error);
