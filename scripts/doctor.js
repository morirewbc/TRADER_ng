#!/usr/bin/env node

const {
  ROOT,
  detectListeningPort,
  exists,
  formatTitle,
  getLockPath,
  hasQuarantineAttribute,
  isMacArm64,
  listNextDevProcessesForRoot,
  path,
  requireFromRoot,
  run,
} = require("./easy-common");

const failures = [];
const warnings = [];
const infos = [];

function fail(msg) {
  failures.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function info(msg) {
  infos.push(msg);
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0] || "0");
  if (major < 20) fail(`Node ${process.versions.node} is too old. Use Node 20+.`);
  else if (major > 24) warn(`Node ${process.versions.node} may be unstable with Next 16 (prefer Node 20-24).`);
  else info(`Node ${process.versions.node}`);
}

function checkDependencies() {
  if (!exists(path.join(ROOT, "node_modules"))) {
    fail("node_modules missing. Run: npm run setup");
    return;
  }

  const modules = ["next", "lightningcss", "@tailwindcss/postcss"];
  for (const mod of modules) {
    try {
      requireFromRoot(mod);
      info(`Module OK: ${mod}`);
    } catch {
      fail(`Cannot load module: ${mod}`);
    }
  }
}

function checkMacBinaryTrust() {
  if (process.platform !== "darwin") return;

  const candidates = [
    path.join(ROOT, "node_modules", "lightningcss-darwin-arm64", "lightningcss.darwin-arm64.node"),
    path.join(ROOT, "node_modules", "@next", "swc-darwin-arm64", "next-swc.darwin-arm64.node"),
  ];

  for (const file of candidates) {
    if (!exists(file)) continue;
    if (hasQuarantineAttribute(file)) {
      fail(`Gatekeeper quarantine detected: ${file}`);
    }
  }
}

function checkLockAndProcesses() {
  const running = listNextDevProcessesForRoot();
  const lockPath = getLockPath();
  const hasLock = exists(lockPath);

  if (running.length > 0) {
    const details = running
      .map((p) => {
        const port = detectListeningPort(p.pid);
        return `pid=${p.pid}${port ? ` port=${port}` : ""}`;
      })
      .join(", ");
    info(`Existing TRADER dev server detected (${details}).`);
  }

  if (hasLock && running.length === 0) {
    warn(`Stale lock file present: ${lockPath}`);
  }
}

function checkPreferredPort() {
  const res = run("lsof", ["-nP", "-iTCP:3000", "-sTCP:LISTEN"]);
  if ((res.stdout || "").trim()) warn("Port 3000 is in use. start:easy will auto-pick another port.");
  else info("Port 3000 is free.");
}

function printSummary() {
  console.log(formatTitle("Doctor"));
  console.log(`Project: ${ROOT}`);
  console.log("");

  for (const m of infos) console.log(`INFO: ${m}`);
  for (const m of warnings) console.log(`WARN: ${m}`);
  for (const m of failures) console.log(`FAIL: ${m}`);

  console.log("");
  if (failures.length === 0) {
    console.log(`Doctor passed (${warnings.length} warning${warnings.length === 1 ? "" : "s"}).`);
    process.exit(0);
  } else {
    console.log(`Doctor failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}.`);
    console.log("Try: npm run setup");
    process.exit(1);
  }
}

checkNodeVersion();
checkDependencies();
checkMacBinaryTrust();
checkLockAndProcesses();
checkPreferredPort();
printSummary();

