#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const bundledSkillDir = path.join(rootDir, "skill");
const bundledScript = path.join(
  bundledSkillDir,
  "scripts",
  "session_bridge.py",
);
const bundledClaudeCommand = path.join(rootDir, "claude", "session-bridge.md");

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "install":
      return runInstall(parseCommonFlags(args.slice(1)));
    case "uninstall":
      return runUninstall(parseCommonFlags(args.slice(1)));
    case "doctor":
      return runDoctor(parseCommonFlags(args.slice(1)));
    case "list":
    case "preview":
    case "pack":
      return runPython(command, args.slice(1));
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return 0;
    case "--version":
    case "-v":
      console.log(readPackageJson().version);
      return 0;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      return 1;
  }
}

function runInstall(flags) {
  const homeDir = resolveHome(flags.home);
  const targets = targetPaths(homeDir);

  ensurePython();
  fs.mkdirSync(path.dirname(targets.claudeCommand), { recursive: true });

  copyDir(bundledSkillDir, targets.codexSkill);
  copyDir(bundledSkillDir, targets.claudeSkill);
  fs.copyFileSync(bundledClaudeCommand, targets.claudeCommand);

  console.log(`Installed session-bridge for Codex: ${targets.codexSkill}`);
  console.log(`Installed session-bridge for Claude: ${targets.claudeSkill}`);
  console.log(`Installed Claude command: ${targets.claudeCommand}`);
  return 0;
}

function runUninstall(flags) {
  const homeDir = resolveHome(flags.home);
  const targets = targetPaths(homeDir);

  removePath(targets.codexSkill);
  removePath(targets.claudeSkill);
  removePath(targets.claudeCommand);

  console.log(`Removed: ${targets.codexSkill}`);
  console.log(`Removed: ${targets.claudeSkill}`);
  console.log(`Removed: ${targets.claudeCommand}`);
  return 0;
}

function runDoctor(flags) {
  const homeDir = resolveHome(flags.home);
  const targets = targetPaths(homeDir);
  const python = detectPython();

  console.log(`Package root: ${rootDir}`);
  console.log(`Home: ${homeDir}`);
  console.log(`Bundled script: ${bundledScript}`);
  console.log(`Python: ${python ? python.cmd : "missing"}`);
  if (python) {
    console.log(`Python version: ${python.version}`);
  }

  printStatus("Codex skill", targets.codexSkill);
  printStatus("Claude skill", targets.claudeSkill);
  printStatus("Claude command", targets.claudeCommand);
  return python ? 0 : 1;
}

function runPython(command, forwardedArgs) {
  const python = ensurePython();
  const result = spawnSync(python.cmd, [bundledScript, command, ...forwardedArgs], {
    stdio: "inherit",
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    console.error(result.error.message);
  }
  return 1;
}

function printStatus(label, targetPath) {
  const exists = fs.existsSync(targetPath);
  console.log(`${label}: ${exists ? "installed" : "missing"} (${targetPath})`);
}

function parseCommonFlags(args) {
  const flags = { home: null };
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--home") {
      flags.home = args[index + 1] || null;
      index += 1;
    }
  }
  return flags;
}

function resolveHome(overrideHome) {
  if (overrideHome) {
    return path.resolve(overrideHome);
  }
  return process.env.HOME || os.homedir();
}

function targetPaths(homeDir) {
  return {
    codexSkill: path.join(homeDir, ".agents", "skills", "session-bridge"),
    claudeSkill: path.join(homeDir, ".claude", "skills", "session-bridge"),
    claudeCommand: path.join(homeDir, ".claude", "commands", "session-bridge.md"),
  };
}

function copyDir(source, target) {
  removePath(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function removePath(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function detectPython() {
  const candidates = ["python3", "python"];
  for (const candidate of candidates) {
    const versionResult = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (versionResult.status === 0) {
      return {
        cmd: candidate,
        version: `${versionResult.stdout}${versionResult.stderr}`.trim(),
      };
    }
  }
  return null;
}

function ensurePython() {
  const python = detectPython();
  if (!python) {
    console.error("python3 or python is required to run session-bridge.");
    process.exit(1);
  }
  return python;
}

function readPackageJson() {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
  );
}

function printHelp() {
  console.log(`session-bridge

Usage:
  session-bridge install [--home <dir>]
  session-bridge uninstall [--home <dir>]
  session-bridge doctor [--home <dir>]
  session-bridge list [session options]
  session-bridge preview <selector> [session options]
  session-bridge pack <selector> [session options]

Session options are passed through to the bundled Python engine, for example:
  session-bridge list --source all --limit 12
  session-bridge preview 3 --source all --messages 8
  session-bridge pack 3 --source all --messages 8
`);
}

process.exit(main());
