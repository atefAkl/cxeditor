/* Simple build: copy src -> dist (no bundler)
   Usage: node scripts/build.js
*/

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

function ensureDir(dir) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
	fs.copyFileSync(from, to);
	console.log('Copied', path.relative(root, from), '->', path.relative(root, to));
}

ensureDir(distDir);
copyFile(path.join(srcDir, 'exeditor.js'), path.join(distDir, 'exeditor.js'));
copyFile(path.join(srcDir, 'exeditor.css'), path.join(distDir, 'exeditor.css'));

console.log('Done.');
