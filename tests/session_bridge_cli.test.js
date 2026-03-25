const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildForkLaunchSpec,
  buildTerminalLauncher,
  detectCurrentProvider,
  detectTerminal,
  getConfigPath,
  loadConfig,
  parseOkRef,
  parseForkCurrentFlags,
  parseInstallFlags,
  resolveCurrentSessionContext,
  saveConfig,
  shellEscape,
} = require("../bin/session-bridge.js");

test("parseInstallFlags accepts terminal and no-prompt", () => {
  const flags = parseInstallFlags([
    "--terminal",
    "cmux",
    "--no-prompt",
    "--home",
    "/tmp/home",
  ]);

  assert.equal(flags.terminal, "cmux");
  assert.equal(flags.noPrompt, true);
  assert.equal(flags.home, "/tmp/home");
});

test("parseForkCurrentFlags collects prompt, terminal, and provider", () => {
  const flags = parseForkCurrentFlags([
    "--provider",
    "claude",
    "--terminal",
    "command",
    "--cwd",
    "/tmp/demo",
    "continue",
    "with",
    "tests",
  ]);

  assert.equal(flags.provider, "claude");
  assert.equal(flags.terminal, "command");
  assert.equal(flags.cwd, "/tmp/demo");
  assert.equal(flags.prompt, "continue with tests");
});

test("buildForkLaunchSpec creates Codex fork command", () => {
  const spec = buildForkLaunchSpec({
    provider: "codex",
    sessionId: "019d23c7-f036-72e2-9ed7-502d32f68abc",
    cwd: "/tmp/my project",
    prompt: "continue with tests",
  });

  assert.equal(
    spec.display,
    "codex fork -C '/tmp/my project' 019d23c7-f036-72e2-9ed7-502d32f68abc 'continue with tests'",
  );
  assert.equal(spec.inlineCommand, spec.display);
});

test("buildForkLaunchSpec creates Claude resume+fork command", () => {
  const spec = buildForkLaunchSpec({
    provider: "claude",
    sessionId: "7b2a68e4-4a6f-4660-b69a-f67ad2e38ef5",
    cwd: "/tmp/my project",
    prompt: "continue with tests",
  });

  assert.equal(
    spec.inlineCommand,
    "claude --resume 7b2a68e4-4a6f-4660-b69a-f67ad2e38ef5 --fork-session 'continue with tests'",
  );
  assert.equal(
    spec.display,
    "cd '/tmp/my project' && claude --resume 7b2a68e4-4a6f-4660-b69a-f67ad2e38ef5 --fork-session 'continue with tests'",
  );
});

test("buildTerminalLauncher creates Ghostty open invocation", () => {
  const launcher = buildTerminalLauncher("ghostty", {
    shellCommand: "codex fork -C /tmp demo",
  });

  assert.equal(launcher.command, "open");
  assert.deepEqual(launcher.args, [
    "-na",
    "Ghostty.app",
    "--args",
    "-e",
    "/bin/zsh",
    "-lc",
    "codex fork -C /tmp demo",
  ]);
});

test("parseOkRef extracts cmux window and workspace ids", () => {
  assert.equal(
    parseOkRef("OK 25643847-24AD-4A1D-BE34-4F6757757164", { kind: "window" }),
    "25643847-24AD-4A1D-BE34-4F6757757164",
  );
  assert.equal(
    parseOkRef("OK workspace:15", { kind: "workspace", prefix: "workspace:" }),
    "workspace:15",
  );
});

test("detectCurrentProvider prefers explicit provider, then live env", () => {
  const originalCodexThread = process.env.CODEX_THREAD_ID;
  const originalClaudeSession = process.env.CLAUDE_SESSION_ID;
  process.env.CODEX_THREAD_ID = "codex-session";
  process.env.CLAUDE_SESSION_ID = "claude-session";

  try {
    assert.equal(detectCurrentProvider("claude"), "claude");
    assert.equal(detectCurrentProvider(null), "codex");
  } finally {
    process.env.CODEX_THREAD_ID = originalCodexThread;
    process.env.CLAUDE_SESSION_ID = originalClaudeSession;
  }
});

test("resolveCurrentSessionContext reads Claude session env", () => {
  const originalClaudeSession = process.env.CLAUDE_SESSION_ID;
  const originalCodexThread = process.env.CODEX_THREAD_ID;
  delete process.env.CODEX_THREAD_ID;
  process.env.CLAUDE_SESSION_ID = "7b2a68e4-4a6f-4660-b69a-f67ad2e38ef5";

  try {
    const context = resolveCurrentSessionContext("/tmp/demo", null);
    assert.deepEqual(context, {
      cwd: "/tmp/demo",
      provider: "claude",
      sessionId: "7b2a68e4-4a6f-4660-b69a-f67ad2e38ef5",
    });
  } finally {
    process.env.CLAUDE_SESSION_ID = originalClaudeSession;
    process.env.CODEX_THREAD_ID = originalCodexThread;
  }
});

test("detectTerminal prefers cmux workspace env", () => {
  const originalWorkspaceId = process.env.CMUX_WORKSPACE_ID;
  const originalTermProgram = process.env.TERM_PROGRAM;
  process.env.CMUX_WORKSPACE_ID = "workspace:1";
  process.env.TERM_PROGRAM = "ghostty";

  try {
    assert.equal(detectTerminal(null), "cmux");
  } finally {
    process.env.CMUX_WORKSPACE_ID = originalWorkspaceId;
    process.env.TERM_PROGRAM = originalTermProgram;
  }
});

test("saveConfig persists preferred terminal", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-bridge-test-"));

  try {
    saveConfig(homeDir, { preferredTerminal: "cmux" });
    assert.equal(getConfigPath(homeDir), path.join(homeDir, ".session-bridge", "config.json"));
    assert.deepEqual(loadConfig(homeDir), { preferredTerminal: "cmux" });
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test("shellEscape single-quotes unsafe values", () => {
  assert.equal(shellEscape("/tmp/demo"), "/tmp/demo");
  assert.equal(shellEscape("hello world"), "'hello world'");
});
