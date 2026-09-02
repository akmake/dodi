// Seed (or reset) the first platform admin — the safe, out-of-band replacement
// for the removed public self-signup ([איחוד]). Run on the server:
//
//   node scripts/create-admin.mjs <email> <password>
//
// Creates the `owner` role if missing, an active owner user, and its scrypt
// credential — writing directly to Mongo in the exact shapes the app expects
// (uuid `id`, tenant-scoped, `${salt}:${derivedHex}` password hash). Idempotent:
// re-running with an existing email just resets that user's password + role.
import { MongoClient } from "mongodb";
import { randomUUID, randomBytes, scryptSync } from "crypto";
import fs from "fs";
import path from "path";

// --- read env (.env.local then .env), without extra deps ---
function loadEnv() {
  const env = {};
  for (const file of [".env.local", ".env", ".env.production"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2];
    }
  }
  return env;
}

const env = loadEnv();
const URI = process.env.MONGODB_URI || env.MONGODB_URI;
const DB = process.env.MONGODB_DB || env.MONGODB_DB || "bootwhat";
const TENANT = process.env.DEFAULT_TENANT_ID || env.DEFAULT_TENANT_ID || "default";

const [email, password] = process.argv.slice(2);
if (!URI) { console.error("MONGODB_URI חסר (.env.local)"); process.exit(1); }
if (!email || !password) { console.error("שימוש: node scripts/create-admin.mjs <email> <password>"); process.exit(1); }
if (password.length < 8) { console.error("הסיסמה חייבת לפחות 8 תווים"); process.exit(1); }

// Full owner scope set — must mirror src/modules/admin/rbac.ts SCOPES.
const OWNER_SCOPES = [
  "inbox.access", "contacts.view", "contacts.manage", "pii.view", "templates.manage",
  "campaigns.send", "bot.edit", "analytics.view", "users.manage", "data.export",
  "api.access", "settings.manage", "wtm.manage", "btb.manage", "btb.view_own",
  "wta.manage", "wre.manage",
];

function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

const c = new MongoClient(URI);
await c.connect();
const db = c.db(DB);
const now = new Date();

try {
  // 1. owner role
  let role = await db.collection("roles").findOne({ tenantId: TENANT, name: "owner" });
  if (!role) {
    role = { id: randomUUID(), tenantId: TENANT, name: "owner", scopes: OWNER_SCOPES, isSystem: true, createdAt: now, updatedAt: now };
    await db.collection("roles").insertOne(role);
    console.log("✓ נוצר תפקיד owner");
  } else {
    await db.collection("roles").updateOne({ id: role.id }, { $set: { scopes: OWNER_SCOPES, isSystem: true, updatedAt: now } });
  }

  // 2. user
  const emailLc = email.toLowerCase();
  let user = await db.collection("users").findOne({ tenantId: TENANT, email: emailLc });
  if (!user) {
    user = {
      id: randomUUID(), tenantId: TENANT, email: emailLc, name: "Owner", roleId: role.id,
      status: "active", lastLoginAt: null, allowedServices: ["wtm", "btb", "wbr", "wta", "wre"], createdAt: now, updatedAt: now,
    };
    await db.collection("users").insertOne(user);
    console.log("✓ נוצר משתמש", emailLc);
  } else {
    await db.collection("users").updateOne({ id: user.id }, { $set: { roleId: role.id, status: "active", allowedServices: ["wtm", "btb", "wbr", "wta", "wre"], updatedAt: now } });
    console.log("• עודכן משתמש קיים", emailLc);
  }

  // 3. credential (scrypt)
  const hash = hashPassword(password);
  const cred = await db.collection("credentials").findOne({ tenantId: TENANT, userId: user.id });
  if (!cred) {
    await db.collection("credentials").insertOne({ id: randomUUID(), tenantId: TENANT, userId: user.id, passwordHash: hash, createdAt: now, updatedAt: now });
  } else {
    await db.collection("credentials").updateOne({ id: cred.id }, { $set: { passwordHash: hash, updatedAt: now } });
  }
  console.log("✓ סיסמה נקבעה");

  console.log("\n✅ מנהל מוכן. התחבר עם", emailLc);
} finally {
  await c.close();
}
