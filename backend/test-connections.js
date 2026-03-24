const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const axios = require("axios");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env"), override: true });

async function testAll() {
  console.log("\n🧪 Testing all connections...\n");

  // Test Database
  console.log("1️⃣ Testing PostgreSQL...");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    database: process.env.PGDATABASE || "musicera",
    user: process.env.PGUSER || "postgres",
    password: String(process.env.PGPASSWORD || ""),
  });

  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("   ✅ Database: Connected");
    console.log("   📅 Server time:", result.rows[0].now);
    client.release();
  } catch (e) {
    console.log("   ❌ Database Error:", e.message);
  }

  // Test SMTP
  console.log("\n2️⃣ Testing Gmail SMTP...");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.verify();
    console.log("   ✅ SMTP: Connected and authenticated");
  } catch (e) {
    console.log("   ❌ SMTP Error:", e.message);
  }

  // Test YouTube API
  console.log("\n3️⃣ Testing YouTube API...");
  try {
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/search",
      {
        params: {
          part: "snippet",
          q: "test",
          key: process.env.YOUTUBE_API_KEY,
          maxResults: 1,
        },
        timeout: 5000,
      },
    );
    console.log("   ✅ YouTube API: Working");
    console.log("   📊 Found", response.data.pageInfo.totalResults, "results");
  } catch (e) {
    console.log("   ❌ YouTube API Error:", e.message);
  }

  await pool.end();
  console.log("\n✨ Tests completed\n");
}

testAll();
