#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const skillPath = path.join(rootDir, "skill", "SKILL.md");
const packageJsonPath = path.join(rootDir, "package.json");
const checkOnly = process.argv.includes("--check");

const skillContent = fs.readFileSync(skillPath, "utf8");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const skillVersion = readSkillVersion(skillContent);
if (!skillVersion) {
  console.error("Could not find `version` in skill/SKILL.md frontmatter.");
  process.exit(1);
}

if (packageJson.version === skillVersion) {
  console.log(`Version in sync: ${skillVersion}`);
  process.exit(0);
}

if (checkOnly) {
  console.error(
    `Version mismatch: SKILL.md=${skillVersion}, package.json=${packageJson.version}`,
  );
  process.exit(1);
}

packageJson.version = skillVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Synced package.json version to ${skillVersion}`);

function readSkillVersion(markdown) {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const versionMatch = frontmatterMatch[1].match(/^version:\s*([^\n]+)$/m);
  return versionMatch ? versionMatch[1].trim() : null;
}
