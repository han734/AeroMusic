const fetch = require("node-fetch");
const dotenv = require("dotenv");
dotenv.config();

async function testRead() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/aero_storage`;
  console.log("Querying Supabase URL:", url);
  try {
    const res = await fetch(url, {
      headers: {
        "apikey": process.env.SUPABASE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_KEY}`
      }
    });
    console.log("Response status:", res.status);
    const data = await res.json();
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error querying Supabase:", err);
  }
}

testRead();
