import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import open from 'open';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, '..', 'templates', 'dashboard.html');
const outputDir = join(homedir(), '.code-usage', 'current');
const outputPath = join(outputDir, 'code-usage-dashboard.html');

export async function buildAndOpen({ claudeData, codexData, defaultTab, appMeta }) {
  mkdirSync(outputDir, { recursive: true });

  // Write clean JSON snapshots for debugging / inspection
  if (claudeData) writeFileSync(join(outputDir, 'claude.json'), JSON.stringify(claudeData, null, 2));
  if (codexData) writeFileSync(join(outputDir, 'codex.json'), JSON.stringify(codexData, null, 2));

  const template = readFileSync(templatePath, 'utf8');
  const genTime = new Date().toLocaleString('en-US');

  const dataJs = [
    `var CLAUDE = ${claudeData ? JSON.stringify(claudeData) : 'null'};`,
    `var CODEX = ${codexData ? JSON.stringify(codexData) : 'null'};`,
    `var DEFAULT_TAB = "${defaultTab}";`,
    `var APP_META = ${JSON.stringify(appMeta || null)};`,
  ].join('\n');

  const html = template
    .replace('// DATA_PLACEHOLDER', dataJs)
    .replace(/id="gen-time"><\/div>/, `id="gen-time">Generated: ${genTime}</div>`);

  writeFileSync(outputPath, html);
  await open(outputPath);
}
