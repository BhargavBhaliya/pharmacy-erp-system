// Production entry point for hosts that start an app from a single file (e.g. Hostinger's
// Express preset). That host runs no build step and has no npm/npx on PATH, so this builds on
// first start by invoking the installed tools directly with the running node binary, applies
// pending database migrations, then starts the API, which also serves the built web app.
const { spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const apiEntry = path.join(__dirname, "apps/api/dist/src/server.js");
const webIndex = path.join(__dirname, "apps/web/dist/index.html");
const bin = (p) => path.join(__dirname, "node_modules", p);

function run(label, script, args, cwd) {
  console.log(`${label}...`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: path.join(__dirname, cwd),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.slice(-3000);
    throw new Error(`${label} failed (exit ${result.status}, signal ${result.signal}, ${result.error || "no spawn error"})
${output}`);
  }
}

function list(dir) {
  try {
    return fs.readdirSync(dir).join(", ") || "(empty)";
  } catch (err) {
    return `(missing: ${err.code})`;
  }
}

const buildSteps = [
  () => run("Building packages/shared", bin("typescript/bin/tsc"), ["-p", "tsconfig.json"], "packages/shared"),
  () => run("Building apps/api", bin("typescript/bin/tsc"), ["-p", "tsconfig.json"], "apps/api"),
  () => {
    run("Type-checking apps/web", bin("typescript/bin/tsc"), ["-b"], "apps/web");
    run("Building apps/web", bin("vite/bin/vite.js"), ["build"], "apps/web");
  },
];

let buildError = null;
if (!fs.existsSync(apiEntry) || !fs.existsSync(webIndex)) {
  for (const step of buildSteps) {
    try {
      step();
    } catch (err) {
      buildError = err.message;
      console.error("Build failed:", err.message);
      break;
    }
  }
}

if (!fs.existsSync(apiEntry)) {
  // Serve a diagnostic page so the deployed layout can be inspected from a browser instead of
  // the app crashing silently.
  const report = [
    `API build not found at: ${apiEntry}`,
    `build error: ${buildError}`,
    `node ${process.version}, cwd ${process.cwd()}`,
    `root: ${list(__dirname)}`,
    `packages/shared: ${list(path.join(__dirname, "packages/shared"))}`,
    `apps/api: ${list(path.join(__dirname, "apps/api"))}`,
    `apps/web: ${list(path.join(__dirname, "apps/web"))}`,
  ].join("\n");
  console.error(report);
  http
    .createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(report);
    })
    .listen(process.env.PORT || 4000);
} else {
  try {
    run(
      "Applying database migrations",
      bin("prisma/build/index.js"),
      ["migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"],
      "."
    );
  } catch (err) {
    // Keep the server up so /health can report the database problem instead of the app vanishing.
    console.error("Database migration failed:", err.message);
  }
  require(apiEntry);
}
