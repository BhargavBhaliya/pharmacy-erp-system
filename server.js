// Production entry point for hosts that start an app from a single file (e.g. Hostinger's
// Express preset). Applies pending database migrations, then starts the built API, which also
// serves the built web app.
const { execSync } = require("child_process");
const path = require("path");

try {
  execSync("npx prisma migrate deploy --schema apps/api/prisma/schema.prisma", {
    cwd: __dirname,
    stdio: "inherit",
  });
} catch (err) {
  // Keep the server up so /health can report the database problem instead of the app vanishing.
  console.error("Database migration failed:", err.message);
}

require(path.join(__dirname, "apps/api/dist/src/server.js"));
