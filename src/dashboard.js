import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, "..", "templates", "dashboard.html");
const outputDir = join(homedir(), ".code-usage", "current");
const outputPath = join(outputDir, "code-usage-dashboard.html");
const jsonPath = join(outputDir, "openusage-data.json");

export async function buildAndOpen({
  claudeData,
  codexData,
  opencodeData,
  ampData,
  piData,
  providerStatuses,
  defaultTab,
  appMeta,
  noOpen,
}) {
  mkdirSync(outputDir, { recursive: true });

  const data = {
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: "code-usage",
      version: appMeta?.version || null,
      repo: appMeta?.repoUrl || null,
      author: appMeta?.authorName || null,
      authorUrl: appMeta?.authorUrl || null,
      packageUrl: appMeta?.packageUrl || null,
      jsonPath,
      providers: Array.isArray(providerStatuses) ? providerStatuses : [],
    },
    claude: claudeData || null,
    codex: codexData || null,
    opencode: opencodeData || null,
    amp: ampData || null,
    pi: piData || null,
    defaultTab,
    appMeta: appMeta || null,
  };

  // Write single JSON snapshot for debugging / inspection
  writeFileSync(jsonPath, JSON.stringify(data, null, 2));

  const template = readFileSync(templatePath, "utf8");
  const genTime = new Date().toLocaleString("en-US");

  const dataJs = `var DATA = ${JSON.stringify(data)};`;

  const html = template
    .replace("// DATA_PLACEHOLDER", () => dataJs)
    .replace(/id="gen-time"><\/div>/, () => `id="gen-time">Generated: ${genTime}</div>`);

  writeFileSync(outputPath, html);

  if (!noOpen) {
    await open(outputPath);
  }
}
