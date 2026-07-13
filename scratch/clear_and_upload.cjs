const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load .env from root
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function clearAndUpload() {
  const usersFile = path.join(__dirname, "..", "data", "users.json");
  if (!fs.existsSync(usersFile)) {
    console.error("Local users.json file not found at:", usersFile);
    return;
  }

  const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
  console.log(`Loaded ${users.length} local accounts from users.json:`, JSON.stringify(users));

  const url = `${process.env.SUPABASE_URL}/rest/v1/aero_storage`;
  const headers = {
    "apikey": process.env.SUPABASE_KEY,
    "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };

  // 1. DELETE existing row
  console.log("1. Deleting existing users row...");
  try {
    const delRes = await globalThis.fetch(`${url}?key=eq.users`, {
      method: "DELETE",
      headers
    });
    console.log("DELETE status:", delRes.status);
  } catch (err) {
    console.error("DELETE failed:", err);
  }

  // 2. POST actual users
  console.log("2. Uploading actual users database...");
  try {
    const postRes = await globalThis.fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ key: "users", value: users })
    });
    console.log("POST status:", postRes.status);
    if (postRes.status === 201 || postRes.status === 204 || postRes.status === 200) {
      console.log("SUCCESS! Accounts database successfully synced to Supabase!");
    } else {
      console.error("Upload failed.");
    }
  } catch (err) {
    console.error("POST failed:", err);
  }
}

clearAndUpload();
