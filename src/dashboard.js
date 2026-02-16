import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, '..', 'templates', 'dashboard.html');
const outputPath = '/tmp/code-usage-dashboard.html';

export async function buildAndOpen({ claudeData, codexData, defaultTab }) {
  const template = readFileSync(templatePath, 'utf8');
  const genTime = new Date().toLocaleString('en-US');

  const claudeJson = claudeData
    ? `var CLAUDE_DATA = ${JSON.stringify(claudeData.stats)};\nvar CLAUDE_EXTRA = ${JSON.stringify(claudeData.extra)};`
    : 'var CLAUDE_DATA = null;\nvar CLAUDE_EXTRA = null;';

  const codexJson = codexData
    ? `var CODEX_DATA = ${JSON.stringify(codexData)};`
    : 'var CODEX_DATA = null;';

  const html = template
    .replace('// DATA_PLACEHOLDER', `${claudeJson}\n${codexJson}\nvar DEFAULT_TAB = "${defaultTab}";`)
    .replace(/id="gen-time"><\/div>/, `id="gen-time">Generated: ${genTime}</div>`);

  writeFileSync(outputPath, html);
  await open(outputPath);
}
