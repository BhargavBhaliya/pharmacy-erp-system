// Production entry point for hosts that start an app from a single file (e.g. Hostinger's
// Express preset). Applies pending database migrations, then starts the built API, which also
// serves the built web app.
const { execSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const apiEntry = path.join(__dirname, "apps/api/dist/src/server.js");

function list(dir) {
  try {
    return fs.readdirSync(dir).join(", ") || "(empty)";
  } catch (err) {
    return `(missing: ${err.code})`;
  }
}

if (!fs.existsSync(apiEntry)) {
  // The build output didn't make it to where the host runs the app. Serve a diagnostic page so
  // the deployed layout can be inspected from a browser instead of crashing silently.
  const report = [
    `API build not found at: ${apiEntry}`,
    `node ${process.version}, cwd ${process.cwd()}`,
    `root: ${list(__dirname)}`,
    `apps: ${list(path.join(__dirname, "apps"))}`,
    `apps/api: ${list(path.join(__dirname, "apps/api"))}`,
    `apps/web: ${list(path.join(__dirname, "apps/web"))}`,
    `node_modules exists: ${fs.existsSync(path.join(__dirname, "node_modules"))}`,
    `node_modules/.bin/prisma exists: ${fs.existsSync(path.join(__dirname, "node_modules/.bin/prisma"))}`,
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
    execSync("npx prisma migrate deploy --schema apps/api/prisma/schema.prisma", {
      cwd: __dirname,
      stdio: "inherit",
    });
  } catch (err) {
    // Keep the server up so /health can report the database problem instead of the app vanishing.
    console.error("Database migration failed:", err.message);
  }
  require(apiEntry);
}
