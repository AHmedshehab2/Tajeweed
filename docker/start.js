const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const backendDir = "/app/backend";
const dbPath = path.join(backendDir, "data", "prod.db");

process.chdir(backendDir);

console.log("Running migrations...");
try {
  execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: backendDir });
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
}

const needsSeed = (() => {
  if (!fs.existsSync(dbPath)) return true;
  const stat = fs.statSync(dbPath);
  return stat.size < 1024;
})();

if (needsSeed) {
  console.log("Empty database detected — seeding demo data...");
  try {
    execSync("node prisma/seed.js", { stdio: "inherit", cwd: backendDir, env: { ...process.env, ALLOW_PROD_SEED: "true" } });
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  }
} else {
  console.log("Database already has data — skipping seed.");
}

console.log("Starting server...");
try {
  const app = require(path.join(backendDir, "src", "server"));
  const PORT = Number(process.env.PORT || 4000);
  const HOST = process.env.HOST || "0.0.0.0";
  app.listen(PORT, HOST, () => console.log(`Server running on ${HOST}:${PORT}`));
} catch (err) {
  console.error("Server failed to start:", err);
  process.exit(1);
}
