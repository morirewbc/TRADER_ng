const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { createRequire } = require("module");

const ROOT = path.resolve(__dirname, "..");
const requireFromRoot = createRequire(path.join(ROOT, "package.json"));

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
    ...opts,
  });
}

function runInherit(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf8",
    ...opts,
  });
}

function exists(p) {
  return fs.existsSync(p);
}

function isMacArm64() {
  return process.platform === "darwin" && process.arch === "arm64";
}

function removeQuarantine(targetPath) {
  if (!exists(targetPath) || process.platform !== "darwin") return;
  run("xattr", ["-dr", "com.apple.quarantine", targetPath]);
}

function hasQuarantineAttribute(targetPath) {
  if (!exists(targetPath) || process.platform !== "darwin") return false;
  const res = run("xattr", ["-l", targetPath]);
  return (res.stdout || "").includes("com.apple.quarantine");
}

function listNextDevProcessesForRoot() {
  if (process.platform === "win32") return [];
  const res = run("ps", ["-Ao", "pid=,command="]);
  if (res.status !== 0) return [];

  const marker = path.join(ROOT, "node_modules", ".bin", "next dev");
  return (res.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const firstSpace = line.indexOf(" ");
      if (firstSpace < 0) return null;
      const pid = Number(line.slice(0, firstSpace).trim());
      const command = line.slice(firstSpace + 1).trim();
      return Number.isFinite(pid) ? { pid, command } : null;
    })
    .filter((v) => v && v.command.includes(marker));
}

function detectListeningPort(pid) {
  if (!pid || process.platform === "win32") return null;
  const res = run("lsof", [
    "-nP",
    "-a",
    "-p",
    String(pid),
    "-iTCP",
    "-sTCP:LISTEN",
  ]);

  const out = (res.stdout || "").split("\n");
  for (const line of out) {
    const m = line.match(/:(\d+)\s+\(LISTEN\)/);
    if (m) return Number(m[1]);
  }
  return null;
}

function detectPortFromCommand(command) {
  if (!command) return null;
  const explicit = command.match(/--port(?:=|\s+)(\d{2,5})/);
  if (explicit) return Number(explicit[1]);

  // Handles forms like: next dev -p 3200
  const short = command.match(/(?:^|\s)-p\s+(\d{2,5})(?:\s|$)/);
  if (short) return Number(short[1]);

  return null;
}

function getLockPath() {
  return path.join(ROOT, ".next", "dev", "lock");
}

function removeStaleLock() {
  const lockPath = getLockPath();
  if (!exists(lockPath)) return false;
  fs.rmSync(lockPath, { force: true });
  return true;
}

function canConnect(port, pathname = "/") {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve(Boolean(res.statusCode));
      },
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function waitForServer(port, timeoutMs = 120000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      const ok = await canConnect(port, "/chat");
      if (ok) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 700);
    };
    tick();
  });
}

function findOpenPort(start = 3000, tries = 50) {
  const tryPort = (port, remaining) =>
    new Promise((resolve, reject) => {
      if (remaining <= 0) {
        reject(new Error("No free port found"));
        return;
      }
      const server = net.createServer();
      server.once("error", () => {
        server.close(() => {
          resolve(tryPort(port + 1, remaining - 1));
        });
      });
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    });

  return tryPort(start, tries);
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function formatTitle(title) {
  return `\n=== ${title} ===`;
}

module.exports = {
  ROOT,
  exists,
  findOpenPort,
  formatTitle,
  getLockPath,
  hasQuarantineAttribute,
  isMacArm64,
  listNextDevProcessesForRoot,
  detectListeningPort,
  detectPortFromCommand,
  npmCommand,
  openBrowser,
  removeQuarantine,
  removeStaleLock,
  requireFromRoot,
  run,
  runInherit,
  waitForServer,
  os,
  path,
  fs,
};
