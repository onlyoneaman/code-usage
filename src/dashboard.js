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

  const data = {
    metadata: {
      createdAt: new Date().toISOString(),
      version: appMeta?.version || null,
    },
    claude: claudeData || null,
    codex: codexData || null,
    defaultTab,
    appMeta: appMeta || null,
  };

  // Write single JSON snapshot for debugging / inspection
  writeFileSync(join(outputDir, 'openusage-data.json'), JSON.stringify(data, null, 2));

  const template = readFileSync(templatePath, 'utf8');
  const genTime = new Date().toLocaleString('en-US');

  const dataJs = `var DATA = ${JSON.stringify(data)};`;

  const html = template
    .replace('// DATA_PLACEHOLDER', dataJs)
    .replace(/id="gen-time"><\/div>/, `id="gen-time">Generated: ${genTime}</div>`);

  writeFileSync(outputPath, html);
  await open(outputPath);
}
