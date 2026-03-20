// Clean server.js - fixes syntax, 404s, infinite scroll
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path");
const readline = require("readline");
const fs = require("fs/promises");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();

const app = express();
const PORT = 3000;
const PYTHON_BIN =
  process.env.PYTHON_BIN || "/Library/Developer/CommandLineTools/usr/bin/python3";
const EMOTION_REQUEST_TIMEOUT_MS = parseInt(
  process.env.EMOTION_REQUEST_TIMEOUT_MS || "6000",
  10,
);

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname)));

function getPythonSpawnEnv() {
  const pythonVersion = process.env.PYTHON_VERSION || "3.9";
  const userSitePackages = path.join(
    os.homedir(),
    "Library",
    "Python",
    pythonVersion,
    "lib",
    "python",
    "site-packages",
  );

  return {
    ...process.env,
    PYTHONNOUSERSITE: "",
    PYTHONPATH: process.env.PYTHONPATH
      ? `${userSitePackages}:${process.env.PYTHONPATH}`
      : userSitePackages,
  };
}

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432"),
  database: process.env.PGDATABASE || "musicera",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "11092002",
});

let dbReady = false;
let emotionWorkerProcess = null;
let emotionWorkerReady = null;
let emotionWorkerRequestId = 0;
const pendingEmotionRequests = new Map();

async function initializeDatabase() {
  console.log("🔄 Initializing database...");
  try {
    // Test connection
    const client = await pool.connect();
    console.log("✅ PG Pool connected");
    client.release();

    console.log("📊 Creating/verifying users table...");
    await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                face_descriptor TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    await pool.query(`
            CREATE TABLE IF NOT EXISTS face_data (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                face_descriptor TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    dbReady = true;
    console.log("🎉 DB ready - full mode");
  } catch (error) {
    console.error("❌ DB error:", error.message);
    console.log(
      "⚠️  Starting in lite mode (frontend + search OK, auth disabled)",
    );
    dbReady = false;
  }
}

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, faceDescriptor } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into database
    const result = await pool.query(
      `INSERT INTO users (name, email, password, face_descriptor) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, name, email, created_at`,
      [
        name,
        email,
        hashedPassword,
        faceDescriptor ? JSON.stringify(faceDescriptor) : null,
      ],
    );

    const user = result.rows[0];

    console.log(`New user registered: ${email}`);

    res.json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
        hasFace: !!faceDescriptor,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Error registering user",
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
    const result = await pool.query(
      "SELECT id, name, email, password, face_descriptor FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if user has face registered
    const hasFace =
      user.face_descriptor &&
      user.face_descriptor !== "null" &&
      user.face_descriptor.trim() !== "" &&
      user.face_descriptor.length > 10;

    console.log(`User logged in: ${email}, hasFace: ${hasFace}`);

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        hasFace: hasFace,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Error logging in",
    });
  }
});

app.post("/api/face-login", async (req, res) => {
  try {
    const { faceDescriptor } = req.body;

    if (!faceDescriptor) {
      return res.status(400).json({
        success: false,
        message: "Face descriptor is required",
      });
    }

    // Get all users with face data
    const result = await pool.query(
      "SELECT id, name, email, face_descriptor FROM users WHERE face_descriptor IS NOT NULL AND face_descriptor != 'null' AND length(face_descriptor) > 10",
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "No users registered with face recognition",
      });
    }

    // Convert input descriptor to array
    let inputDescriptor;
    if (typeof faceDescriptor === "string") {
      inputDescriptor = JSON.parse(faceDescriptor);
    } else {
      inputDescriptor = faceDescriptor;
    }

    // Find matching face (simple Euclidean distance comparison)
    let matchedUser = null;
    let lowestDistance = Infinity;

    for (const user of result.rows) {
      if (user.face_descriptor) {
        let storedDescriptor;
        if (typeof user.face_descriptor === "string") {
          storedDescriptor = JSON.parse(user.face_descriptor);
        } else {
          storedDescriptor = user.face_descriptor;
        }

        // Calculate Euclidean distance
        let distance = 0;
        for (let i = 0; i < inputDescriptor.length; i++) {
          distance += Math.pow(inputDescriptor[i] - storedDescriptor[i], 2);
        }
        distance = Math.sqrt(distance);

        console.log(`Face match distance for ${user.email}: ${distance}`);

        // Threshold for face match - lowered to 0.6 for better matching
        if (distance < 0.6 && distance < lowestDistance) {
          lowestDistance = distance;
          matchedUser = user;
        }
      }
    }

    if (!matchedUser) {
      return res.status(401).json({
        success: false,
        message:
          "Face not recognized. Please try again or login with email/password. Distance: " +
          lowestDistance,
      });
    }

    console.log(
      `Face login successful: ${matchedUser.email} (distance: ${lowestDistance})`,
    );

    res.json({
      success: true,
      message: "Face login successful",
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        email: matchedUser.email,
        hasFace: true,
      },
    });
  } catch (error) {
    console.error("Face login error:", error);
    res.status(500).json({
      success: false,
      message: "Error with face login",
    });
  }
});

app.post("/api/save-face", async (req, res) => {
  try {
    const { email, faceDescriptor } = req.body;

    if (!email || !faceDescriptor) {
      return res.status(400).json({
        success: false,
        message: "Email and face descriptor are required",
      });
    }

    // Update user's face descriptor
    const result = await pool.query(
      "UPDATE users SET face_descriptor = $1 WHERE email = $2 RETURNING id, name, email",
      [JSON.stringify(faceDescriptor), email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(`Face saved for user: ${email}`);

    res.json({
      success: true,
      message: "Face data saved successfully",
      user: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        email: result.rows[0].email,
        hasFace: true,
      },
    });
  } catch (error) {
    console.error("Save face error:", error);
    res.status(500).json({
      success: false,
      message: "Error saving face data",
    });
  }
});

function rejectPendingEmotionRequests(error) {
  for (const { reject, timeout } of pendingEmotionRequests.values()) {
    clearTimeout(timeout);
    reject(error);
  }
  pendingEmotionRequests.clear();
}

function ensureEmotionWorker() {
  if (emotionWorkerReady) {
    return emotionWorkerReady;
  }

  emotionWorkerReady = new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "backend", "emotion_detection.py");
    const worker = spawn(PYTHON_BIN, [scriptPath, "--worker"], {
      cwd: __dirname,
      env: getPythonSpawnEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    emotionWorkerProcess = worker;
    let settled = false;
    let stderrBuffer = "";

    const stdoutReader = readline.createInterface({
      input: worker.stdout,
      crlfDelay: Infinity,
    });

    settled = true;
    resolve();

    const settleReject = (error) => {
      if (!settled) {
        settled = true;
        emotionWorkerReady = null;
        reject(error);
      }
    };

    stdoutReader.on("line", (line) => {
      let payload = null;

      try {
        payload = JSON.parse(line);
      } catch (error) {
        return;
      }

      if (!payload || !payload.id) {
        return;
      }

      const request = pendingEmotionRequests.get(payload.id);
      if (!request) {
        return;
      }

      clearTimeout(request.timeout);
      pendingEmotionRequests.delete(payload.id);

      if (payload.error) {
        request.reject(new Error(payload.error));
        return;
      }

      delete payload.id;
      request.resolve(payload);
    });

    worker.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    worker.on("error", (error) => {
      emotionWorkerProcess = null;
      rejectPendingEmotionRequests(error);
      settleReject(error);
    });

    worker.on("close", (code) => {
      const error = new Error(
        stderrBuffer.trim() ||
          `Emotion detection worker stopped with code ${code}`,
      );
      emotionWorkerProcess = null;
      emotionWorkerReady = null;
      rejectPendingEmotionRequests(error);
      settleReject(error);
    });
  });

  return emotionWorkerReady;
}

async function runPythonEmotionDetection(imagePath) {
  await ensureEmotionWorker();

  return new Promise((resolve, reject) => {
    if (!emotionWorkerProcess || !emotionWorkerProcess.stdin.writable) {
      reject(new Error("Emotion detection worker is not available"));
      return;
    }

    const id = `emotion-${++emotionWorkerRequestId}`;
    const timeout = setTimeout(() => {
      pendingEmotionRequests.delete(id);
      reject(
        new Error(
          `Emotion detection timed out after ${EMOTION_REQUEST_TIMEOUT_MS}ms`,
        ),
      );
    }, EMOTION_REQUEST_TIMEOUT_MS);

    pendingEmotionRequests.set(id, { resolve, reject, timeout });
    emotionWorkerProcess.stdin.write(
      `${JSON.stringify({ id, imagePath })}\n`,
      (error) => {
        if (!error) {
          return;
        }

        clearTimeout(timeout);
        pendingEmotionRequests.delete(id);
        reject(error);
      },
    );
  });
}

app.post("/api/emotion-detect", async (req, res) => {
  const { image } = req.body;

  if (!image || typeof image !== "string") {
    return res.status(400).json({
      success: false,
      message: "A base64 encoded image is required",
    });
  }

  const matches = image.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!matches) {
    return res.status(400).json({
      success: false,
      message: "Invalid image payload",
    });
  }

  const extension = matches[1] === "jpeg" ? "jpg" : matches[1];
  const imageBuffer = Buffer.from(matches[2], "base64");
  const tempImagePath = path.join(
    os.tmpdir(),
    `musicera-emotion-${crypto.randomUUID()}.${extension}`,
  );

  try {
    await fs.writeFile(tempImagePath, imageBuffer);
    const result = await runPythonEmotionDetection(tempImagePath);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Emotion detection error:", error.message);
    res.status(500).json({
      success: false,
      message:
        "Emotion detection failed. Install Python dependencies from requirements.txt and try again.",
      error: error.message,
    });
  } finally {
    await fs.unlink(tempImagePath).catch(() => {});
  }
});

// Fallback for 404 images
app.get(/^\/(placeholder-audio|audio)\.(jpg|svg|png)$/, (req, res) => {
  res.sendFile(path.join(__dirname, "audio.svg"));
});

/* MP3 FEATURE DISABLED
// Proxy MP3 endpoint to bypass CORS - fixes audio playback
app.get("/api/proxy-audio", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URL parameter required" });
  }

  try {
    console.log("🔊 Proxying MP3:", url);
    const response = await axios.get(url, {
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MusicEra/1.0)",
      },
      timeout: 10000,
    });

    res.set({
      "Content-Type": response.headers["content-type"] || "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
      "Content-Length": response.headers["content-length"],
    });

    response.data.pipe(res);
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).json({ error: "Failed to proxy audio" });
  }
});
MP3 FEATURE DISABLED */

// MP3 search with infinite pagination & working audio URLs
app.post("/api/search", async (req, res) => {
  const { query, format = "mp4", page = 1 } = req.body;
  const perPage = 20;
  if (!query)
    return res.status(400).json({ success: false, message: "Query required" });

  try {
    let allResults = [];
    if (format === "mp4") {
      const ytKey = process.env.YOUTUBE_API_KEY || "demo";
      const { data } = await axios.get(
        "https://youtube.googleapis.com/youtube/v3/search",
        {
          params: {
            part: "snippet",
            q: query.trim(),
            type: "video",
            videoCategoryId: "10",
            maxResults: 50,
            key: ytKey,
          },
        },
      );
      allResults = data.items.map((i) => ({
        id: i.id.videoId,
        title: i.snippet.title,
        artist: i.snippet.channelTitle,
        thumbnail: i.snippet.thumbnails.medium.url,
        url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
        type: "youtube",
        format,
      }));
    } /* else {
      // Reliable free MP3 URLs + infinite - MP3 DISABLED
      for (let i = 1; i <= perPage * 2; i++) {
        allResults.push({
          id: `demo${(page - 1) * perPage + i}`,
          title: `${query} Track ${i}`,
          artist: `Demo Artist ${i}`,
          thumbnail: "/audio.svg",
          url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 16) + 1}.mp3`,
          type: "freesound",
          format: "mp3",
        });
      }
    } */
    const startIdx = (page - 1) * perPage;
    const results = allResults.slice(startIdx, startIdx + perPage);
    res.json({
      success: true,
      results,
      hasMore: allResults.length > startIdx + perPage,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Search failed" });
  }
});

async function startServer() {
  console.log("🚀 Starting MusicEra server...");
  await initializeDatabase();
  try {
    console.log("🧠 Warming emotion detection worker...");
    await ensureEmotionWorker();
  } catch (error) {
    console.error("⚠️ Emotion worker warmup failed:", error.message);
  }
  console.log("🌐 Starting HTTP server...");
  app.listen(PORT, () => {
    const status = dbReady ? "FULL (DB OK)" : "LITE (no DB)";
    console.log(`\n🎵 MusicEra on http://localhost:${PORT} [${status}]`);
    console.log("✅ Ready! Open browser.");
  });
}

startServer();
