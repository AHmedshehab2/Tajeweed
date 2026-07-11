const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const backendDir = "/app/backend";
const dbPath = path.join(backendDir, "data", "prod.db");

process.chdir(backendDir);

console.log("Running migrations...");
execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: backendDir });

const needsSeed = (() => {
  try {
    if (!fs.existsSync(dbPath)) return true;
    const out = execSync(
      'npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM User;"',
      { encoding: "utf-8", cwd: backendDir, stdio: ["pipe", "pipe", "pipe"] }
    );
    return out.includes("0");
  } catch {
    return true;
  }
})();

if (needsSeed) {
  console.log("Empty database detected — seeding demo data...");
  execSync("node prisma/seed.js", { stdio: "inherit", cwd: backendDir });
} else {
  console.log("Database already has data — skipping seed.");
}

console.log("Starting server...");
require(path.join(backendDir, "src", "server"));
