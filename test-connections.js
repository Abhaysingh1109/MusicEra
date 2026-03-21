const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const axios = require("axios");

async function testAll() {
  console.log("\n🧪 Testing all connections...\n");

  // Test Database
  console.log("1️⃣ Testing PostgreSQL...");
  const pool = new Pool({
    host: "localhost",
    port: 5432,
    database: "musicera",
    user: "postgres",
    password: "11092002",
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
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: "abhaysingh11091999@gmail.com",
      pass: "qmxl dctn bqml ckdg",
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
          key: "AIzaSyB3m-ZzyvNyIfLYsuyXVNTfD3gP8qk4VhI",
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
