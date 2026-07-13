const dotenv = require("dotenv");
const path = require("path");

// Load .env from root
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function testWrite() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/aero_storage`;
  const headers = {
    "apikey": process.env.SUPABASE_KEY,
    "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };
  const body = { key: "users", value: [{ username: "test_sync_user" }] };

  console.log("1. Trying POST...");
  try {
    const res = await globalThis.fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(body)
    });
    console.log("POST Response status:", res.status);
    try {
      const data = await res.json();
      console.log("POST Response data:", JSON.stringify(data, null, 2));
    } catch {
      console.log("POST No JSON response body");
    }
  } catch (err) {
    console.error("POST Error:", err);
  }

  console.log("\n2. Trying PATCH...");
  try {
    const res = await globalThis.fetch(`${url}?key=eq.users`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ value: body.value })
    });
    console.log("PATCH Response status:", res.status);
    try {
      const data = await res.json();
      console.log("PATCH Response data:", JSON.stringify(data, null, 2));
    } catch {
      console.log("PATCH No JSON response body");
    }
  } catch (err) {
    console.error("PATCH Error:", err);
  }
}

testWrite();
