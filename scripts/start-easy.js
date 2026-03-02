#!/usr/bin/env node

const { spawn, spawnSync } = require("child_process");
const {
  ROOT,
  detectListeningPort,
  detectPortFromCommand,
  findOpenPort,
  formatTitle,
  listNextDevProcessesForRoot,
  npmCommand,
  openBrowser,
  removeStaleLock,
  waitForServer,
  path,
} = require("./easy-common");

function runNodeScript(scriptName, args = []) {
  return spawnSync(process.execPath, [path.join(ROOT, "scripts", scriptName), ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

function startDevServer(port) {
  const child = spawn(
    npmCommand(),
    ["run", "dev", "--", "--webpack", "--port", String(port)],
    {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  return child;
}

async function main() {
  console.log(formatTitle("Start Easy"));
  console.log("Preparing app...");

  const setup = runNodeScript("setup.js", ["--quick"]);
  if (setup.status !== 0) process.exit(setup.status || 1);

  const doctor = runNodeScript("doctor.js");
  if (doctor.status !== 0) process.exit(doctor.status || 1);

  const running = listNextDevProcessesForRoot();
  if (running.length > 0) {
    const processInfo = running[0];
    const port =
      detectListeningPort(processInfo.pid) ||
      detectPortFromCommand(processInfo.command) ||
      3000;
    const url = `http://localhost:${port}/chat`;
    console.log(`Using existing server: ${url}`);
    openBrowser(url);
    process.exit(0);
  }

  const removedLock = removeStaleLock();
  if (removedLock) console.log("Removed stale Next dev lock file.");

  const port = await findOpenPort(3000, 50);
  const url = `http://localhost:${port}/chat`;
  console.log(`Starting app on port ${port}...`);

  const child = startDevServer(port);

  waitForServer(port, 120000).then((ready) => {
    if (ready) {
      console.log(`Opening browser: ${url}`);
      openBrowser(url);
    } else {
      console.log("Server is taking longer than expected to respond.");
    }
  });

  child.on("exit", (code) => {
    process.exit(code == null ? 0 : code);
  });
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
