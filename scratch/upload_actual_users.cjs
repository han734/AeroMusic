const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load .env from root
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function uploadUsers() {
  const appData = process.env.APPDATA || (process.platform === 'win32' ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : '');
  const usersFile = path.join(appData, 'AeroMusic', 'data', 'users.json');
  if (!fs.existsSync(usersFile)) {
    console.error("Local AppData users.json file not found at:", usersFile);
    return;
  }

  const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
  console.log(`Loaded ${users.length} local accounts from users.json`);

  const url = `${process.env.SUPABASE_URL}/rest/v1/aero_storage`;
  const headers = {
    "apikey": process.env.SUPABASE_KEY,
    "Authorization": `Bearer ${process.env.SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };

  try {
    const res = await globalThis.fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({ key: "users", value: users })
    });
    console.log("Upload POST status:", res.status);
    if (res.status === 201 || res.status === 204 || res.status === 200) {
      console.log("SUCCESS! Accounts database successfully uploaded to Supabase!");
    } else {
      console.error("Upload failed.");
    }
  } catch (err) {
    console.error("Error during upload:", err);
  }
}

uploadUsers();
