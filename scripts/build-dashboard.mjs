import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { minify as minifyJs } from 'terser';
import CleanCSS from 'clean-css';

const shellPath = 'templates/src/dashboard.shell.html';
const cssPath = 'templates/src/styles.css';
const jsPath = 'templates/src/main.js';
const outPath = 'templates/dashboard.html';

const shell = readFileSync(shellPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');
const js = readFileSync(jsPath, 'utf8');

const cssMinResult = new CleanCSS({ level: 2 }).minify(css);
if (cssMinResult.errors.length) {
  throw new Error(`CSS minify failed: ${cssMinResult.errors.join('; ')}`);
}

const jsMinResult = await minifyJs(js, {
  compress: true,
  mangle: true,
  format: { comments: false },
});
if (!jsMinResult.code) {
  throw new Error('JS minify failed: empty output');
}

if (!shell.includes('/* INLINE_STYLES */')) {
  throw new Error(`Missing CSS placeholder in ${shellPath}`);
}
if (!shell.includes('// INLINE_SCRIPT')) {
  throw new Error(`Missing JS placeholder in ${shellPath}`);
}

const finalHtml = shell
  .replace('/* INLINE_STYLES */', cssMinResult.styles)
  .replace('// INLINE_SCRIPT', `// DATA_PLACEHOLDER\n${jsMinResult.code}`);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, finalHtml);

console.log(`Built ${outPath}`);
