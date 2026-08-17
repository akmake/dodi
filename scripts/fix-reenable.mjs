import { MongoClient } from "mongodb";
import { readFileSync } from "node:fs";

const env = {};
for (const f of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
  } catch {}
}
const client = new MongoClient(env.MONGODB_URI);
await client.connect();
const db = client.db(env.MONGODB_DB || "bootwhat");
const convos = db.collection("wa_conversations");

const muted = await convos.find({ aiEnabled: false }).toArray();
console.log("muted conversations:", muted.map((c) => `${c.waId} (status=${c.status})`).join(", ") || "(none)");

const res = await convos.updateMany(
  { aiEnabled: false },
  { $set: { aiEnabled: true, status: "open" } }
);
console.log(`re-enabled: matched=${res.matchedCount} modified=${res.modifiedCount}`);

// Clear any stuck active flow runs so a fresh "שלום" can start cleanly.
const runs = db.collection("flow_runs");
const stuck = await runs.updateMany(
  { status: { $in: ["running", "waiting"] } },
  { $set: { status: "stopped" } }
);
console.log(`stopped stale flow_runs: ${stuck.modifiedCount}`);

console.log("\nDONE — now send 'שלום' to the bot.");
await client.close();
