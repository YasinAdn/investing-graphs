'use strict';

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const requiredFiles = [
  'index.html',
  'psx.html',
  'nasdaq.html',
  'crypto.html',
  'currencies.html',
  'compare.html',
  'styles.css',
  'finance-engine.js',
  'market-data.js',
  'chart-3d-renderer.js',
  'chart-renderer.js',
  'shell.js',
  'page-controllers.js',
  path.join('vendor', 'gsap.min.js'),
  path.join('vendor', 'three.min.js')
];

for (const file of requiredFiles) {
  const full = path.join(publicDir, file);
  if (!fs.existsSync(full)) {
    console.error(`[Vercel Build] Missing required asset: public/${file}`);
    process.exit(1);
  }
}

console.log(`[Vercel Build] Verified ${requiredFiles.length} static assets in public/.`);
