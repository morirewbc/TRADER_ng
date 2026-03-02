#!/usr/bin/env node

const {
  ROOT,
  exists,
  formatTitle,
  isMacArm64,
  npmCommand,
  removeQuarantine,
  requireFromRoot,
  runInherit,
  path,
  os,
} = require("./easy-common");

function verifyCoreModules() {
  const checks = ["next", "lightningcss", "@tailwindcss/postcss"];
  for (const mod of checks) {
    requireFromRoot(mod);
  }
}

function main() {
  const quick = process.argv.includes("--quick");

  console.log(formatTitle("Setup"));
  console.log(`Project: ${ROOT}`);

  const hasNodeModules = exists(path.join(ROOT, "node_modules"));
  const shouldInstall = !hasNodeModules || !quick;

  if (shouldInstall) {
    console.log("Installing dependencies...");
    const install = runInherit(npmCommand(), ["install"]);
    if (install.status !== 0) process.exit(install.status || 1);
  } else {
    console.log("Dependencies already installed (quick mode).");
  }

  if (process.platform === "darwin") {
    console.log("Clearing macOS quarantine flags for native Node modules...");
    const targets = [
      path.join(ROOT, "node_modules"),
      path.join(ROOT, "node_modules", "@next"),
      path.join(ROOT, "node_modules", "lightningcss"),
      path.join(ROOT, "node_modules", "lightningcss-darwin-arm64"),
      path.join(ROOT, "node_modules", "@next", "swc-darwin-arm64"),
      path.join(os.homedir(), "Library", "Caches", "next-swc"),
    ];
    for (const target of targets) removeQuarantine(target);
  }

  try {
    verifyCoreModules();
    if (isMacArm64()) {
      const swc = path.join(
        ROOT,
        "node_modules",
        "@next",
        "swc-darwin-arm64",
        "next-swc.darwin-arm64.node",
      );
      if (!exists(swc)) {
        throw new Error(`Missing required binary: ${swc}`);
      }
    }
  } catch (err) {
    console.error("Setup failed while verifying dependencies.");
    console.error((err && err.message) || err);
    process.exit(1);
  }

  console.log("Setup complete.");
}

main();

