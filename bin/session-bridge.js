#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const readline = require("node:readline/promises");

const rootDir = path.resolve(__dirname, "..");
const bundledSkillDir = path.join(rootDir, "skill");
const bundledScript = path.join(
  bundledSkillDir,
  "scripts",
  "session_bridge.py",
);
const bundledClaudeCommand = path.join(rootDir, "claude", "session-bridge.md");
const SUPPORTED_PROVIDERS = ["codex", "claude"];
const SUPPORTED_TERMINALS = ["cmux", "ghostty", "iterm", "terminal", "command"];
const CONFIG_DIRNAME = ".session-bridge";
const CONFIG_FILENAME = "config.json";

async function main(argv = process.argv.slice(2)) {
  const args = argv;
  const command = args[0] || "help";

  switch (command) {
    case "install":
      return runInstall(parseInstallFlags(args.slice(1)));
    case "uninstall":
      return runUninstall(parseCommonFlags(args.slice(1)));
    case "doctor":
      return runDoctor(parseCommonFlags(args.slice(1)));
    case "fork-current":
      return runForkCurrent(parseForkCurrentFlags(args.slice(1)));
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

async function runInstall(flags) {
  const homeDir = resolveHome(flags.home);
  const targets = targetPaths(homeDir);

  ensurePython();
  fs.mkdirSync(path.dirname(targets.claudeCommand), { recursive: true });

  copyDir(bundledSkillDir, targets.codexSkill);
  copyDir(bundledSkillDir, targets.claudeSkill);
  fs.copyFileSync(bundledClaudeCommand, targets.claudeCommand);

  const preferredTerminal = await resolvePreferredTerminal({
    explicitTerminal: flags.terminal,
    homeDir,
    promptIfUnset: !flags.noPrompt,
    persistExplicit: true,
    reason: "install",
  });

  console.log(`Installed session-bridge for Codex: ${targets.codexSkill}`);
  console.log(`Installed session-bridge for Claude: ${targets.claudeSkill}`);
  console.log(`Installed Claude command: ${targets.claudeCommand}`);
  if (preferredTerminal) {
    console.log(`Preferred terminal: ${preferredTerminal}`);
  }
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
  const configuredTerminal = loadConfig(homeDir).preferredTerminal || "unset";

  console.log(`Package root: ${rootDir}`);
  console.log(`Home: ${homeDir}`);
  console.log(`Bundled script: ${bundledScript}`);
  console.log(`Python: ${python ? python.cmd : "missing"}`);
  if (python) {
    console.log(`Python version: ${python.version}`);
  }
  console.log(`Configured terminal: ${configuredTerminal}`);
  console.log(`Detected terminal: ${detectTerminal(null) || "unknown"}`);
  console.log(`Detected provider: ${detectCurrentProvider(null) || "unknown"}`);
  console.log(`Current Codex thread: ${process.env.CODEX_THREAD_ID || "missing"}`);
  console.log(`Current Claude session: ${process.env.CLAUDE_SESSION_ID || "missing"}`);

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

async function runForkCurrent(flags) {
  try {
    const context = resolveCurrentSessionContext(flags.cwd, flags.provider);
    const homeDir = resolveHome(flags.home);
    const terminal = await resolvePreferredTerminal({
      explicitTerminal: flags.terminal,
      homeDir,
      promptIfUnset: !flags.noPrompt,
      persistExplicit: false,
      reason: "fork-current",
    });
    const launchSpec = buildForkLaunchSpec({
      provider: context.provider,
      sessionId: context.sessionId,
      cwd: context.cwd,
      prompt: flags.prompt,
    });

    if (!terminal || terminal === "command") {
      printManualForkCommand(launchSpec.display);
      return terminal ? 0 : 1;
    }

    if (terminal === "cmux") {
      const cmuxLaunch = launchInCmuxWindow({
        cwd: context.cwd,
        shellCommand: launchSpec.inlineCommand,
      });
      console.log(
        `Launched ${context.provider} in ${terminal} window ${cmuxLaunch.windowId} with workspace ${cmuxLaunch.workspaceRef}.`,
      );
      return 0;
    }

    const launcher = buildTerminalLauncher(terminal, {
      shellCommand: launchSpec.shellCommand,
    });
    if (!launcher) {
      printManualForkCommand(launchSpec.display);
      return 1;
    }

    const result = spawnSync(launcher.command, launcher.args, { stdio: "inherit" });
    if (typeof result.status === "number" && result.status === 0) {
      console.log(
        `Launched ${context.provider} in ${terminal} for session ${context.sessionId}.`,
      );
      return 0;
    }

    if (result.error) {
      console.error(result.error.message);
    }
    console.error(`Failed to launch ${terminal}. Run this manually instead:`);
    printManualForkCommand(launchSpec.display);
    return 1;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
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

function parseInstallFlags(args) {
  const flags = {
    home: null,
    noPrompt: false,
    terminal: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--home") {
      flags.home = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (current === "--terminal") {
      flags.terminal = validateTerminalName(args[index + 1] || null);
      index += 1;
      continue;
    }
    if (current === "--no-prompt") {
      flags.noPrompt = true;
    }
  }

  return flags;
}

function parseForkCurrentFlags(args) {
  const flags = {
    cwd: process.cwd(),
    home: null,
    noPrompt: false,
    prompt: "",
    provider: null,
    terminal: null,
  };
  const promptParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--terminal") {
      flags.terminal = validateTerminalName(args[index + 1] || null);
      index += 1;
      continue;
    }
    if (current === "--provider") {
      flags.provider = validateProviderName(args[index + 1] || null);
      index += 1;
      continue;
    }
    if (current === "--cwd") {
      flags.cwd = path.resolve(args[index + 1] || flags.cwd);
      index += 1;
      continue;
    }
    if (current === "--home") {
      flags.home = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (current === "--no-prompt") {
      flags.noPrompt = true;
      continue;
    }
    promptParts.push(current);
  }

  flags.prompt = promptParts.join(" ").trim();
  return flags;
}

function validateTerminalName(terminal) {
  if (!terminal || !SUPPORTED_TERMINALS.includes(terminal)) {
    throw new Error(
      `Unsupported terminal: ${terminal}. Use one of ${SUPPORTED_TERMINALS.join(", ")}.`,
    );
  }
  return terminal;
}

function validateProviderName(provider) {
  if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported provider: ${provider}. Use one of ${SUPPORTED_PROVIDERS.join(", ")}.`,
    );
  }
  return provider;
}

function detectCurrentProvider(explicitProvider) {
  if (explicitProvider) {
    return explicitProvider;
  }
  if (process.env.CODEX_THREAD_ID) {
    return "codex";
  }
  if (process.env.CLAUDE_SESSION_ID) {
    return "claude";
  }
  return null;
}

function resolveCurrentSessionContext(cwd, explicitProvider) {
  const provider = detectCurrentProvider(explicitProvider);
  if (!provider) {
    throw new Error(
      "Current session provider could not be detected. Run from an active Codex/Claude session or pass --provider.",
    );
  }

  if (provider === "codex") {
    const sessionId = process.env.CODEX_THREAD_ID;
    if (!sessionId) {
      throw new Error("Current Codex thread ID was not found.");
    }
    return {
      cwd: path.resolve(cwd || process.cwd()),
      provider,
      sessionId,
    };
  }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    throw new Error("Current Claude session ID was not found.");
  }
  return {
    cwd: path.resolve(cwd || process.cwd()),
    provider,
    sessionId,
  };
}

function buildForkLaunchSpec({ provider, sessionId, cwd, prompt }) {
  if (provider === "codex") {
    const argv = ["codex", "fork", "-C", cwd, sessionId];
    if (prompt) {
      argv.push(prompt);
    }
    const command = formatShellCommand(argv);
    return {
      display: command,
      inlineCommand: command,
      provider,
      shellCommand: command,
    };
  }

  if (provider === "claude") {
    const argv = ["claude", "--resume", sessionId, "--fork-session"];
    if (prompt) {
      argv.push(prompt);
    }
    const inlineCommand = formatShellCommand(argv);
    const shellCommand = `cd ${shellEscape(cwd)} && ${inlineCommand}`;
    return {
      display: shellCommand,
      inlineCommand,
      provider,
      shellCommand,
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function resolvePreferredTerminal({
  explicitTerminal,
  homeDir,
  promptIfUnset,
  persistExplicit,
  reason,
}) {
  const config = loadConfig(homeDir);
  const storedTerminal = normalizeTerminal(config.preferredTerminal);
  const availableChoices = getAvailableTerminalChoices();

  if (explicitTerminal) {
    ensureTerminalAvailable(explicitTerminal, availableChoices);
    if (persistExplicit) {
      saveConfig(homeDir, { preferredTerminal: explicitTerminal });
    }
    return explicitTerminal;
  }

  if (storedTerminal && isTerminalAvailable(storedTerminal, availableChoices)) {
    return storedTerminal;
  }

  if (promptIfUnset && canPrompt()) {
    const selectedTerminal = await promptForTerminalChoice({
      availableChoices,
      defaultTerminal: chooseDefaultTerminal(availableChoices),
      reason,
    });
    if (selectedTerminal) {
      saveConfig(homeDir, { preferredTerminal: selectedTerminal });
      return selectedTerminal;
    }
  }

  const detectedTerminal = detectTerminal(null);
  if (detectedTerminal && isTerminalAvailable(detectedTerminal, availableChoices)) {
    return detectedTerminal;
  }

  const defaultTerminal = chooseDefaultTerminal(availableChoices);
  if (defaultTerminal) {
    return defaultTerminal;
  }

  return "command";
}

function detectTerminal(explicitTerminal) {
  if (explicitTerminal) {
    return explicitTerminal;
  }

  if (process.env.CMUX_WORKSPACE_ID) {
    return "cmux";
  }

  const termProgram = (process.env.TERM_PROGRAM || "").toLowerCase();
  if (termProgram.includes("ghostty")) {
    return "ghostty";
  }
  if (termProgram.includes("iterm")) {
    return "iterm";
  }
  if (termProgram.includes("apple_terminal") || termProgram.includes("terminal")) {
    return "terminal";
  }
  return null;
}

function buildTerminalLauncher(terminal, launchSpec) {
  const { shellCommand } = launchSpec;

  switch (terminal) {
    case "ghostty":
      return {
        command: "open",
        args: ["-na", "Ghostty.app", "--args", "-e", "/bin/zsh", "-lc", shellCommand],
      };
    case "iterm":
      return {
        command: "osascript",
        args: [
          "-e",
          'tell application "iTerm"',
          "-e",
          "activate",
          "-e",
          "create window with default profile",
          "-e",
          `tell current session of current window to write text ${appleScriptString(
            shellCommand,
          )}`,
          "-e",
          "end tell",
        ],
      };
    case "terminal":
      return {
        command: "osascript",
        args: [
          "-e",
          'tell application "Terminal" to activate',
          "-e",
          `tell application "Terminal" to do script ${appleScriptString(shellCommand)}`,
        ],
      };
    default:
      return null;
  }
}

function printManualForkCommand(command) {
  console.log(command);
}

function launchInCmuxWindow({ cwd, shellCommand }) {
  const windowId = parseOkRef(runCommandCapture("cmux", ["new-window"]), {
    kind: "window",
  });
  runCommandCapture("cmux", ["focus-window", "--window", windowId]);
  const workspaceRef = parseOkRef(
    runCommandCapture("cmux", [
      "new-workspace",
      "--cwd",
      cwd,
      "--command",
      shellCommand,
    ]),
    { kind: "workspace", prefix: "workspace:" },
  );
  runCommandCapture("cmux", ["select-workspace", "--workspace", workspaceRef]);
  return { windowId, workspaceRef };
}

function runCommandCapture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  if (typeof result.status === "number" && result.status === 0) {
    return (result.stdout || "").trim();
  }

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.error) {
    throw result.error;
  }
  throw new Error(output || `Failed to run: ${command}`);
}

function parseOkRef(output, options = {}) {
  const match = output.match(/^OK\s+(.+)$/m);
  if (!match) {
    const label = options.kind || "reference";
    throw new Error(`Expected cmux ${label} output, received: ${output || "(empty)"}`);
  }
  const value = match[1].trim();
  if (options.prefix && !value.startsWith(options.prefix)) {
    throw new Error(
      `Expected ${options.kind || "reference"} starting with ${options.prefix}, received: ${value}`,
    );
  }
  return value;
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatShellCommand(argv) {
  return argv.map(shellEscape).join(" ");
}

function shellEscape(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) {
    return text;
  }
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function canPrompt() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptForTerminalChoice({ availableChoices, defaultTerminal, reason }) {
  const choices = availableChoices.filter((choice) => choice.available);
  if (!choices.length) {
    return null;
  }

  const defaultIndex = Math.max(
    0,
    choices.findIndex((choice) => choice.name === defaultTerminal),
  );
  const promptLines = [
    "",
    `Choose a preferred terminal for session-bridge ${reason}:`,
  ];

  choices.forEach((choice, index) => {
    const suffix = index === defaultIndex ? " (default)" : "";
    promptLines.push(`  ${index + 1}) ${choice.label}${suffix}`);
  });
  promptLines.push(`Select 1-${choices.length} and press Enter: `);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (await rl.question(promptLines.join("\n"))).trim();
    if (!answer) {
      return choices[defaultIndex].name;
    }

    const index = Number(answer);
    if (!Number.isInteger(index) || index < 1 || index > choices.length) {
      console.log("Invalid selection. Using the default choice.");
      return choices[defaultIndex].name;
    }

    return choices[index - 1].name;
  } finally {
    rl.close();
  }
}

function chooseDefaultTerminal(availableChoices) {
  const detectedTerminal = detectTerminal(null);
  if (detectedTerminal && isTerminalAvailable(detectedTerminal, availableChoices)) {
    return detectedTerminal;
  }

  const preferredOrder = ["cmux", "ghostty", "iterm", "terminal", "command"];
  for (const terminal of preferredOrder) {
    if (isTerminalAvailable(terminal, availableChoices)) {
      return terminal;
    }
  }
  return null;
}

function getAvailableTerminalChoices() {
  return [
    {
      name: "cmux",
      label: "cmux new window",
      available: commandExists("cmux"),
    },
    {
      name: "ghostty",
      label: "Ghostty",
      available: appExists("Ghostty.app"),
    },
    {
      name: "iterm",
      label: "iTerm",
      available: appExists("iTerm.app") || appExists("iTerm2.app"),
    },
    {
      name: "terminal",
      label: "Terminal.app",
      available: process.platform === "darwin",
    },
    {
      name: "command",
      label: "print command only",
      available: true,
    },
  ];
}

function ensureTerminalAvailable(terminal, availableChoices) {
  if (!isTerminalAvailable(terminal, availableChoices)) {
    throw new Error(`Selected terminal is not available on this machine: ${terminal}`);
  }
}

function isTerminalAvailable(terminal, availableChoices = getAvailableTerminalChoices()) {
  return Boolean(
    availableChoices.find((choice) => choice.name === terminal && choice.available),
  );
}

function commandExists(command) {
  const result = spawnSync("/bin/zsh", ["-lc", `command -v ${shellEscape(command)}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function appExists(appName) {
  const locations = [
    path.join("/Applications", appName),
    path.join(os.homedir(), "Applications", appName),
  ];
  return locations.some((location) => fs.existsSync(location));
}

function normalizeTerminal(terminal) {
  if (!terminal || !SUPPORTED_TERMINALS.includes(terminal)) {
    return null;
  }
  return terminal;
}

function getConfigPath(homeDir) {
  return path.join(homeDir, CONFIG_DIRNAME, CONFIG_FILENAME);
}

function loadConfig(homeDir) {
  const configPath = getConfigPath(homeDir);
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(homeDir, partialConfig) {
  const nextConfig = {
    ...loadConfig(homeDir),
    ...partialConfig,
  };
  const configPath = getConfigPath(homeDir);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
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
  return JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
}

function printHelp() {
  console.log(`session-bridge

Usage:
  session-bridge install [--home <dir>] [--terminal <name>] [--no-prompt]
  session-bridge uninstall [--home <dir>]
  session-bridge doctor [--home <dir>]
  session-bridge fork-current [--provider <name>] [--terminal <name>] [--cwd <dir>] [--no-prompt] [prompt...]
  session-bridge list [session options]
  session-bridge preview <selector> [session options]
  session-bridge pack <selector> [session options]

Supported provider names:
  ${SUPPORTED_PROVIDERS.join(", ")}

Supported terminal names:
  ${SUPPORTED_TERMINALS.join(", ")}

Session options are passed through to the bundled Python engine, for example:
  session-bridge list --source all --limit 12
  session-bridge preview 3 --source all --messages 8
  session-bridge pack 3 --source all --messages 8

Fork the current Codex or Claude session into a new terminal target:
  session-bridge fork-current
  session-bridge fork-current --provider codex --terminal cmux
  session-bridge fork-current --provider claude --terminal command "continue with test cleanup"
`);
}

module.exports = {
  appExists,
  appleScriptString,
  buildForkLaunchSpec,
  buildTerminalLauncher,
  chooseDefaultTerminal,
  commandExists,
  detectCurrentProvider,
  detectTerminal,
  formatShellCommand,
  getAvailableTerminalChoices,
  getConfigPath,
  isTerminalAvailable,
  launchInCmuxWindow,
  loadConfig,
  main,
  normalizeTerminal,
  parseOkRef,
  parseForkCurrentFlags,
  parseInstallFlags,
  resolveCurrentSessionContext,
  resolvePreferredTerminal,
  saveConfig,
  shellEscape,
};

if (require.main === module) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
