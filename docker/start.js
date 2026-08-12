const { execSync, execFileSync } = require("child_process");
const path = require("path");

const backendDir = "/app/backend";

process.chdir(backendDir);

console.log("Running migrations...");
try {
  execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: backendDir });
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
}

const userCount = (() => {
  const script = `
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "User"')
      .then((rows) => {
        console.log(rows[0].count);
        return prisma.$disconnect();
      })
      .catch((err) => {
        console.error('Database check failed:', err.message);
        process.exit(1);
      });
  `;
  try {
    const out = execFileSync(process.execPath, ["-e", script], {
      cwd: backendDir,
      env: process.env,
      encoding: "utf8",
    });
    return parseInt(out.trim().split(/\r?\n/).pop(), 10);
  } catch (err) {
    console.error("Database check failed:", err.message);
    process.exit(1);
  }
})();

const needsSeed = userCount === 0;

if (needsSeed && process.env.ALLOW_PROD_SEED === "true") {
  console.log("Empty database detected and ALLOW_PROD_SEED=true — seeding demo data...");
  try {
    execSync("node prisma/seed.js", { stdio: "inherit", cwd: backendDir, env: { ...process.env } });
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  }
} else if (needsSeed) {
  console.log("Empty database detected but ALLOW_PROD_SEED is not set — skipping seed.");
} else {
  console.log("Database already has data — skipping seed.");
}

console.log("Starting server...");
const app = require(path.join(backendDir, "src", "server"));
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
app.startServer({ port: PORT, host: HOST, allowPortFallback: false }).catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
