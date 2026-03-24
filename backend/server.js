// Clean server.js - fixes syntax, 404s, infinite scroll
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const readline = require("readline");
const fs = require("fs/promises");
const os = require("os");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const dotenv = require("dotenv");
const axios = require("axios");
const nodemailer = require("nodemailer");
const { existsSync } = require("fs");

const ROOT_ENV_PATH = path.join(__dirname, "..", ".env");
const BACKEND_ENV_PATH = path.join(__dirname, ".env");

dotenv.config({ path: ROOT_ENV_PATH });
dotenv.config({ path: BACKEND_ENV_PATH, override: true });

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";
function isTruthyEnv(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

const IS_RENDER =
  isTruthyEnv(process.env.RENDER) ||
  [
    "RENDER_SERVICE_ID",
    "RENDER_INSTANCE_ID",
    "RENDER_EXTERNAL_URL",
    "RENDER_EXTERNAL_HOSTNAME",
  ].some((key) => Boolean(process.env[key]));
const LOCAL_VENV_PYTHON = path.join(__dirname, "..", ".venv", "bin", "python3");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const ML_FEATURES_ENABLED = isTruthyEnv(
  process.env.ML_FEATURES_ENABLED || (IS_RENDER ? "false" : "true"),
);
const PYTHON_ISOLATED_ENV = isTruthyEnv(
  process.env.PYTHON_ISOLATED_ENV || (IS_RENDER ? "true" : "false"),
);

function pythonHasDeepFace(pythonBin) {
  if (!ML_FEATURES_ENABLED) {
    return false;
  }

  try {
    const probeCode = IS_RENDER
      ? "import importlib.util as u; mods=('numpy','cv2','deepface'); raise SystemExit(0 if all(u.find_spec(m) is not None for m in mods) else 1)"
      : "import numpy, cv2, deepface, tensorflow; print('ok')";
    const probe = spawnSync(pythonBin, ["-c", probeCode], {
      timeout: 12000,
      env: getPythonSpawnEnv(),
      stdio: ["ignore", "ignore", "ignore"],
    });
    return probe.status === 0;
  } catch (error) {
    return false;
  }
}

function resolvePythonBin() {
  if (!ML_FEATURES_ENABLED) {
    return process.env.PYTHON_BIN || "python3";
  }

  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const candidates = [];
  if (existsSync(LOCAL_VENV_PYTHON)) {
    candidates.push(LOCAL_VENV_PYTHON);
  }
  candidates.push("python3");

  for (const candidate of candidates) {
    if (pythonHasDeepFace(candidate)) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1] || "python3";
}

const PYTHON_BIN = resolvePythonBin();
const FACE_AUTH_AVAILABLE = pythonHasDeepFace(PYTHON_BIN);
const EMOTION_REQUEST_TIMEOUT_MS = parseInt(
  process.env.EMOTION_REQUEST_TIMEOUT_MS || "6000",
  10,
);
const FACE_AUTH_REQUEST_TIMEOUT_MS = parseInt(
  process.env.FACE_AUTH_REQUEST_TIMEOUT_MS || (IS_RENDER ? "45000" : "12000"),
  10,
);
const FACE_AUTH_WORKER_STARTUP_TIMEOUT_MS = parseInt(
  process.env.FACE_AUTH_WORKER_STARTUP_TIMEOUT_MS ||
    (IS_RENDER ? "90000" : "30000"),
  10,
);
const OTP_EXPIRY_MINUTES = Math.max(
  1,
  parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10),
);
const OTP_MAX_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10),
);
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE =
  String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const MAIL_FROM =
  process.env.MAIL_FROM ||
  process.env.SMTP_FROM ||
  process.env.SMTP_USER ||
  "no-reply@musicera.local";
const OTP_DEV_FALLBACK_ENABLED =
  String(process.env.OTP_DEV_FALLBACK_ENABLED || "true").toLowerCase() ===
  "true";
const OTP_ALLOW_PRODUCTION_DEV_FALLBACK =
  String(
    process.env.OTP_ALLOW_PRODUCTION_DEV_FALLBACK || "false",
  ).toLowerCase() === "true";
const SMTP_CONNECT_TIMEOUT_MS = Math.max(
  3000,
  parseInt(process.env.SMTP_CONNECT_TIMEOUT_MS || "10000", 10),
);
const SMTP_GREETING_TIMEOUT_MS = Math.max(
  3000,
  parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || "10000", 10),
);
const SMTP_SOCKET_TIMEOUT_MS = Math.max(
  5000,
  parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || "15000", 10),
);
const SMTP_VERIFY_TIMEOUT_MS = Math.max(
  3000,
  parseInt(process.env.SMTP_VERIFY_TIMEOUT_MS || "8000", 10),
);
const OTP_MAIL_TIMEOUT_MS = Math.max(
  3000,
  parseInt(process.env.OTP_MAIL_TIMEOUT_MS || "12000", 10),
);
const SMTP_SKIP_VERIFY = isTruthyEnv(
  process.env.SMTP_SKIP_VERIFY || (IS_RENDER ? "true" : "false"),
);
const SMTP_SEND_RETRIES = Math.max(
  0,
  parseInt(process.env.SMTP_SEND_RETRIES || "1", 10),
);
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const PG_SSL_MODE = String(
  process.env.PGSSL || process.env.PGSSLMODE || "",
).toLowerCase();
const PG_SSL_ENABLED =
  PG_SSL_MODE === "true" ||
  PG_SSL_MODE === "require" ||
  DATABASE_URL.includes("sslmode=require");
const PG_SSL_REJECT_UNAUTHORIZED =
  String(process.env.PGSSL_REJECT_UNAUTHORIZED || "false").toLowerCase() ===
  "true";

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(FRONTEND_DIR));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/api/capabilities", (_req, res) => {
  const faceLoginEnabled = ML_FEATURES_ENABLED && FACE_AUTH_AVAILABLE;

  let faceLoginReason = "Face login is enabled.";
  if (!ML_FEATURES_ENABLED) {
    faceLoginReason =
      "Face login is disabled on this deployment (ML features are turned off).";
  } else if (!FACE_AUTH_AVAILABLE) {
    faceLoginReason = "Face login dependencies are unavailable on this server.";
  }

  res.status(200).json({
    success: true,
    capabilities: {
      faceLoginEnabled,
      faceLoginReason,
      emotionDetectionEnabled: ML_FEATURES_ENABLED,
    },
  });
});

function getPythonSpawnEnv() {
  const env = {
    ...process.env,
  };

  if (PYTHON_ISOLATED_ENV) {
    env.PYTHONNOUSERSITE = "1";
    env.PYTHONPATH = "";
    env.PYTHONHOME = "";
    return env;
  }

  delete env.PYTHONNOUSERSITE;
  delete env.PYTHONPATH;
  delete env.PYTHONHOME;
  return env;
}

const poolConfig = DATABASE_URL
  ? {
      connectionString: DATABASE_URL,
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: parseInt(process.env.PGPORT || "5432", 10),
      database: process.env.PGDATABASE || "musicera",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "",
    };

if (PG_SSL_ENABLED) {
  poolConfig.ssl = {
    rejectUnauthorized: PG_SSL_REJECT_UNAUTHORIZED,
  };
}

const pool = new Pool(poolConfig);

let dbReady = false;
let emotionWorkerProcess = null;
let emotionWorkerReady = null;
let emotionWorkerRequestId = 0;
const pendingEmotionRequests = new Map();
let faceAuthWorkerProcess = null;
let faceAuthWorkerReady = null;
let faceAuthWorkerRequestId = 0;
const pendingFaceAuthRequests = new Map();
let mailTransporterPromise = null;

const EMOTION_LOOKBACK_DAYS = Math.max(
  1,
  parseInt(process.env.EMOTION_LOOKBACK_DAYS || "3", 10),
);

const MOOD_KEYWORDS = {
  happy: [
    "happy",
    "party",
    "dance",
    "upbeat",
    "fun",
    "celebration",
    "feel good",
  ],
  sad: [
    "sad",
    "emotional",
    "heartbreak",
    "lonely",
    "melancholy",
    "acoustic",
    "slow",
  ],
  angry: ["rock", "metal", "rap", "hard", "power", "rage", "intense"],
  fear: ["calm", "relax", "meditation", "healing", "soft", "ambient"],
  disgust: ["clean", "detox", "fresh", "reset", "focus", "chill"],
  surprise: ["new", "trending", "viral", "remix", "latest", "fresh"],
  neutral: ["chill", "lofi", "focus", "instrumental", "ambient", "calm"],
};

const DEFAULT_SUGGESTION_SEEDS = [
  "latest hindi songs",
  "top english songs",
  "bollywood hits",
  "arijit singh songs",
  "lofi chill beats",
  "romantic songs",
  "trending punjabi songs",
  "party songs mix",
];

const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || "0.24");
const FACE_MATCH_FALLBACK_THRESHOLD = Number(
  process.env.FACE_MATCH_FALLBACK_THRESHOLD || "0.33",
);
const FACE_MATCH_MIN_MARGIN = Number(
  process.env.FACE_MATCH_MIN_MARGIN || "0.015",
);
const PROFILE_PHOTO_MAX_BYTES = Math.max(
  50 * 1024,
  parseInt(process.env.PROFILE_PHOTO_MAX_BYTES || `${2 * 1024 * 1024}`, 10),
);

function normalizeEmotionScores(emotions = []) {
  if (!Array.isArray(emotions)) {
    return {};
  }

  return emotions.reduce((accumulator, emotion) => {
    const label = String(emotion?.label || "")
      .trim()
      .toLowerCase();
    if (!label) {
      return accumulator;
    }

    accumulator[label] = Math.max(
      0,
      Math.min(100, Number(emotion?.score || 0)),
    );
    return accumulator;
  }, {});
}

function normalizeMoodLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return normalized || "neutral";
}

const VALID_MOODS = new Set([
  "happy",
  "sad",
  "angry",
  "fear",
  "disgust",
  "surprise",
  "neutral",
]);

function normalizeValidMood(value) {
  const normalized = normalizeMoodLabel(value);
  return VALID_MOODS.has(normalized) ? normalized : "";
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parseFaceEmbedding(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const numeric = parsed.map((entry) => Number(entry));
    return numeric.every((entry) => Number.isFinite(entry)) ? numeric : null;
  } catch (error) {
    return null;
  }
}

function cosineDistance(vectorA = [], vectorB = []) {
  if (
    !Array.isArray(vectorA) ||
    !Array.isArray(vectorB) ||
    vectorA.length === 0 ||
    vectorA.length !== vectorB.length
  ) {
    return Number.POSITIVE_INFINITY;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < vectorA.length; index += 1) {
    const a = Number(vectorA[index]);
    const b = Number(vectorB[index]);

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return Number.POSITIVE_INFINITY;
    }

    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return 1 - dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function parseBase64Image(image) {
  if (!image || typeof image !== "string") {
    throw new Error("A base64 encoded image is required");
  }

  const matches = image.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image payload");
  }

  const extension = matches[1] === "jpeg" ? "jpg" : matches[1];
  return {
    extension,
    buffer: Buffer.from(matches[2], "base64"),
  };
}

function normalizeProfilePhotoDataUrl(image) {
  const matches = String(image || "").match(
    /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/,
  );

  if (!matches) {
    throw new Error("Invalid profile image payload");
  }

  const subtype = String(matches[1] || "")
    .trim()
    .toLowerCase();
  const normalizedSubtype = subtype === "jpg" ? "jpeg" : subtype;
  const allowedSubtypes = new Set(["jpeg", "png", "webp", "gif"]);

  if (!allowedSubtypes.has(normalizedSubtype)) {
    throw new Error("Profile photo must be JPG, PNG, WEBP, or GIF");
  }

  const buffer = Buffer.from(matches[2], "base64");
  if (!buffer.length) {
    throw new Error("Profile photo is empty");
  }

  if (buffer.length > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error(
      `Profile photo exceeds ${Math.round(PROFILE_PHOTO_MAX_BYTES / (1024 * 1024))}MB limit`,
    );
  }

  return `data:image/${normalizedSubtype};base64,${buffer.toString("base64")}`;
}

function normalizeIncomingImages(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidateImages = [];

  if (Array.isArray(payload.images)) {
    candidateImages.push(...payload.images);
  }

  if (typeof payload.image === "string") {
    candidateImages.push(payload.image);
  }

  if (typeof payload.faceImage === "string") {
    candidateImages.push(payload.faceImage);
  }

  return candidateImages.filter(
    (image) => typeof image === "string" && image.trim().length > 0,
  );
}

async function writeTempImage(image, prefix) {
  const { extension, buffer } = parseBase64Image(image);
  const imagePath = path.join(
    os.tmpdir(),
    `${prefix}-${crypto.randomUUID()}.${extension}`,
  );

  await fs.writeFile(imagePath, buffer);
  return imagePath;
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtpCode(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

function maskEmailAddress(email) {
  const normalizedEmail = normalizeEmail(email);
  const [localPart, domain] = normalizedEmail.split("@");

  if (!localPart || !domain) {
    return normalizedEmail;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || "*"}*@${domain}`;
  }

  return `${localPart[0]}${"*".repeat(localPart.length - 2)}${localPart[localPart.length - 1]}@${domain}`;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function normalizeSmtpValue(value) {
  return String(value || "").trim();
}

function normalizeSmtpPassword(value) {
  const raw = normalizeSmtpValue(value);
  // Gmail app passwords are often copied with spaces; strip them safely.
  return raw.replace(/\s+/g, "");
}

async function getMailTransporter() {
  if (mailTransporterPromise) {
    return mailTransporterPromise;
  }

  mailTransporterPromise = (async () => {
    const smtpService = normalizeSmtpValue(process.env.SMTP_SERVICE);
    const smtpHost = normalizeSmtpValue(process.env.SMTP_HOST);
    const smtpUser = normalizeSmtpValue(process.env.SMTP_USER);
    const smtpPass = normalizeSmtpPassword(process.env.SMTP_PASS);
    const hasService = Boolean(smtpService);
    const hasHost = Boolean(smtpHost);
    const hasAuth = Boolean(smtpUser) && Boolean(smtpPass);

    if ((!hasService && !hasHost) || !hasAuth) {
      throw new Error(
        "Email delivery is not configured. Set SMTP_HOST or SMTP_SERVICE, plus SMTP_USER, SMTP_PASS, and MAIL_FROM.",
      );
    }

    const useHostTransport = hasHost;

    const transporter = nodemailer.createTransport(
      useHostTransport
        ? {
            host: smtpHost,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            family: 4,
            connectionTimeout: SMTP_CONNECT_TIMEOUT_MS,
            greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
            socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          }
        : {
            service: smtpService,
            family: 4,
            connectionTimeout: SMTP_CONNECT_TIMEOUT_MS,
            greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
            socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          },
    );

    if (!SMTP_SKIP_VERIFY) {
      await withTimeout(
        transporter.verify(),
        SMTP_VERIFY_TIMEOUT_MS,
        `SMTP verification timed out after ${SMTP_VERIFY_TIMEOUT_MS}ms`,
      );
    }
    return transporter;
  })().catch((error) => {
    mailTransporterPromise = null;
    throw error;
  });

  return mailTransporterPromise;
}

function isMailConfigured() {
  const hasService = Boolean(process.env.SMTP_SERVICE);
  const hasHost = Boolean(process.env.SMTP_HOST);
  const hasAuth =
    Boolean(process.env.SMTP_USER) && Boolean(process.env.SMTP_PASS);

  return (hasService || hasHost) && hasAuth;
}

async function sendSignupOtpEmail({ email, otp, name }) {
  const displayName = String(name || "").trim() || "there";

  const payload = {
    from: MAIL_FROM,
    to: email,
    subject: "MusicEra email verification code",
    text: [
      `Hi ${displayName},`,
      "",
      `Your MusicEra verification code is ${otp}.`,
      `It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      "",
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; background: #0a0a1a; color: #f8fafc; padding: 32px;">
        <div style="max-width: 520px; margin: 0 auto; background: #13132a; border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 28px;">
          <p style="margin: 0 0 12px;">Hi ${displayName},</p>
          <p style="margin: 0 0 18px;">Use this code to verify your MusicEra account email address.</p>
          <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; text-align: center; padding: 18px 20px; border-radius: 14px; background: linear-gradient(135deg, #6366f1, #ec4899); color: white; margin-bottom: 18px;">
            ${otp}
          </div>
          <p style="margin: 0 0 10px;">This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p style="margin: 0; color: #94a3b8;">If you did not request this code, you can ignore this email.</p>
        </div>
      </div>
    `,
  };

  let lastError = null;
  for (let attempt = 0; attempt <= SMTP_SEND_RETRIES; attempt += 1) {
    try {
      const transporter = await getMailTransporter();
      await withTimeout(
        transporter.sendMail(payload),
        OTP_MAIL_TIMEOUT_MS,
        `SMTP send timed out after ${OTP_MAIL_TIMEOUT_MS}ms`,
      );
      return;
    } catch (error) {
      lastError = error;
      mailTransporterPromise = null;
      if (attempt >= SMTP_SEND_RETRIES) {
        break;
      }
    }
  }

  throw lastError || new Error("Unable to send OTP email");
}

function getDayWeight(targetDate) {
  const now = new Date();
  const diffMs = now.getTime() - new Date(targetDate).getTime();
  const dayDiff = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));

  if (dayDiff === 0) {
    return 1.0;
  }
  if (dayDiff === 1) {
    return 0.72;
  }

  return 0.45;
}

function scoreSongsByMood(results, dominantMood) {
  const keywords = MOOD_KEYWORDS[dominantMood] || MOOD_KEYWORDS.neutral;
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  return results
    .map((song, index) => {
      const haystack =
        `${song?.title || ""} ${song?.artist || ""} ${song?.channelTitle || ""}`.toLowerCase();
      let keywordScore = 0;

      for (let i = 0; i < keywords.length; i += 1) {
        if (haystack.includes(keywords[i])) {
          keywordScore += 1 + (keywords.length - i) * 0.06;
        }
      }

      const relevanceScore = (results.length - index) / results.length;
      const finalScore = keywordScore * 0.7 + relevanceScore * 0.3;

      return {
        ...song,
        moodScore: Number(finalScore.toFixed(4)),
      };
    })
    .sort((a, b) => b.moodScore - a.moodScore);
}

async function resolveUserIdentity(userId, email) {
  let resolvedUserId = Number(userId) || null;
  let resolvedEmail = String(email || "").trim() || null;

  if (!resolvedUserId && resolvedEmail) {
    const userLookup = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [resolvedEmail],
    );
    resolvedUserId = userLookup.rows[0]?.id || null;
  }

  if (!resolvedEmail && resolvedUserId) {
    const userLookup = await pool.query(
      "SELECT email FROM users WHERE id = $1 LIMIT 1",
      [resolvedUserId],
    );
    resolvedEmail = userLookup.rows[0]?.email || null;
  }

  return {
    userId: resolvedUserId,
    email: resolvedEmail,
  };
}

async function getMoodProfileFromHistory(resolvedUserId, lookbackDays) {
  const scoreByMood = new Map();

  const emotionHistoryResult = await pool.query(
    `SELECT dominant_emotion, emotion_scores, detected_at
     FROM emotion_history
     WHERE user_id = $1
       AND detected_at >= (CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 day'))
     ORDER BY detected_at DESC
     LIMIT 300`,
    [resolvedUserId, lookbackDays],
  );

  for (const row of emotionHistoryResult.rows) {
    const rowWeight = getDayWeight(row.detected_at);
    const rawScores = row.emotion_scores || {};
    const hasScores = rawScores && Object.keys(rawScores).length > 0;

    if (hasScores) {
      for (const [label, rawValue] of Object.entries(rawScores)) {
        const mood = normalizeMoodLabel(label);
        const current = scoreByMood.get(mood) || 0;
        scoreByMood.set(mood, current + Number(rawValue || 0) * rowWeight);
      }
    } else if (row.dominant_emotion) {
      const mood = normalizeMoodLabel(row.dominant_emotion);
      const current = scoreByMood.get(mood) || 0;
      scoreByMood.set(mood, current + 100 * rowWeight);
    }
  }

  const viewHistoryResult = await pool.query(
    `SELECT mood_snapshot, played_at
     FROM user_view_history
     WHERE user_id = $1
       AND played_at >= (CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 day'))
     ORDER BY played_at DESC
     LIMIT 500`,
    [resolvedUserId, lookbackDays],
  );

  for (const row of viewHistoryResult.rows) {
    const mood = normalizeMoodLabel(row.mood_snapshot);
    const rowWeight = getDayWeight(row.played_at) * 35;
    const current = scoreByMood.get(mood) || 0;
    scoreByMood.set(mood, current + rowWeight);
  }

  const rankedMoods = Array.from(scoreByMood.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([mood, score]) => ({ mood, score: Number(score.toFixed(2)) }));

  return {
    dominantMood: rankedMoods[0]?.mood || "neutral",
    moods: rankedMoods,
    lookbackDays,
  };
}

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
                profile_photo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS profile_photo TEXT
    `);

    await pool.query(`
            CREATE TABLE IF NOT EXISTS face_data (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                face_descriptor TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    await pool.query(`
            CREATE TABLE IF NOT EXISTS emotion_history (
                id SERIAL PRIMARY KEY,
          user_email VARCHAR(255),
          emotion VARCHAR(50),
          confidence FLOAT,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                dominant_emotion VARCHAR(50) NOT NULL,
                emotion_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
                detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_view_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          song_id VARCHAR(100),
          song_title TEXT,
          song_artist TEXT,
          search_query TEXT,
          mood_snapshot VARCHAR(50),
          played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_view_history_user_played_at
        ON user_view_history (user_id, played_at DESC)
      `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_view_history_search_query
        ON user_view_history (search_query)
      `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_view_history_song_title
        ON user_view_history (song_title)
      `);

    await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_name = 'email_verification_otps'
              AND table_schema = 'public'
          ) AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'email_verification_otps'
              AND table_schema = 'public'
              AND column_name = 'consumed_at'
          ) AND NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'email_verification_otps'
              AND table_schema = 'public'
              AND column_name = 'id'
          ) THEN
            DROP TABLE public.email_verification_otps;
          END IF;
        END $$;
      `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS email_verification_otps (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          otp_hash VARCHAR(255) NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMP NOT NULL,
          consumed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_email_verification_otps_email_created_at
        ON email_verification_otps (email, created_at DESC)
      `);

    await pool.query(`
        ALTER TABLE email_verification_otps
        ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(255)
      `);

    await pool.query(`
        ALTER TABLE email_verification_otps
        ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb
      `);

    await pool.query(`
        ALTER TABLE email_verification_otps
        ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0
      `);

    await pool.query(`
        ALTER TABLE email_verification_otps
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
      `);

    await pool.query(`
        ALTER TABLE email_verification_otps
        ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP
      `);

    await pool.query(`
        ALTER TABLE email_verification_otps
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);

    await pool.query(`
            ALTER TABLE emotion_history
        ADD COLUMN IF NOT EXISTS user_email VARCHAR(255)
      `);

    await pool.query(`
        ALTER TABLE emotion_history
        ADD COLUMN IF NOT EXISTS emotion VARCHAR(50)
      `);

    await pool.query(`
        ALTER TABLE emotion_history
        ADD COLUMN IF NOT EXISTS confidence FLOAT
      `);

    await pool.query(`
        ALTER TABLE emotion_history
            ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
        `);

    await pool.query(`
            ALTER TABLE emotion_history
            ADD COLUMN IF NOT EXISTS dominant_emotion VARCHAR(50)
        `);

    await pool.query(`
            ALTER TABLE emotion_history
            ADD COLUMN IF NOT EXISTS emotion_scores JSONB NOT NULL DEFAULT '{}'::jsonb
        `);

    await pool.query(`
            ALTER TABLE emotion_history
            ADD COLUMN IF NOT EXISTS detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);

    const emotionHistoryColumnsResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'emotion_history'`,
    );
    const emotionHistoryColumns = new Set(
      emotionHistoryColumnsResult.rows.map((row) => row.column_name),
    );

    if (emotionHistoryColumns.has("emotion")) {
      await pool.query(`
              UPDATE emotion_history
              SET dominant_emotion = LOWER(TRIM(emotion))
              WHERE dominant_emotion IS NULL
          `);
    }

    if (
      emotionHistoryColumns.has("emotion") &&
      emotionHistoryColumns.has("confidence")
    ) {
      await pool.query(`
              UPDATE emotion_history
              SET emotion_scores = jsonb_build_object(
                  COALESCE(dominant_emotion, LOWER(TRIM(emotion)), 'unknown'),
                  COALESCE(confidence::numeric, 0)::float
              )
              WHERE emotion_scores = '{}'::jsonb
          `);
    }

    if (emotionHistoryColumns.has("created_at")) {
      await pool.query(`
              UPDATE emotion_history
              SET detected_at = COALESCE(created_at, detected_at, CURRENT_TIMESTAMP)
          `);
    }

    if (emotionHistoryColumns.has("user_email")) {
      await pool.query(`
              UPDATE emotion_history eh
              SET user_id = users.id
              FROM users
              WHERE eh.user_id IS NULL
                AND eh.user_email = users.email
          `);
    }

    // Create user_preferences table for music era and language preferences
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        preferred_eras TEXT[] DEFAULT '{}'::text[],
        preferred_languages TEXT[] DEFAULT '{}'::text[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create emotion mood mapping table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mood_song_mapping (
        id SERIAL PRIMARY KEY,
        mood VARCHAR(50) NOT NULL,
        song_keywords TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default mood-song mappings if table is empty
    const moodMappingCount = await pool.query(
      "SELECT COUNT(*) FROM mood_song_mapping",
    );
    if (moodMappingCount.rows[0]?.count === "0") {
      await pool.query(`
        INSERT INTO mood_song_mapping (mood, song_keywords) VALUES
        ('happy', 'upbeat,dance,party,fun,energetic,feel good,celebrating'),
        ('sad', 'emotional,heartbreak,lonely,melancholy,slow,acoustic,sentimental'),
        ('angry', 'rock,metal,rap,hard,intense,powerful,angry,aggressive'),
        ('fear', 'calm,relax,meditation,healing,soft,ambient,peaceful'),
        ('disgust', 'clean,detox,fresh,reset,focus,chill,motivation'),
        ('surprise', 'trending,viral,remix,latest,fresh,new,hit,chart,popular'),
        ('neutral', 'chill,lofi,focus,instrumental,ambient,calm,lo-fi,study')
      `);
    }

    dbReady = true;
    console.log("🎉 DB ready - full mode");
  } catch (error) {
    console.error("❌ DB error:", error.message);
    if (error?.code) {
      console.error("❌ DB error code:", error.code);
    }
    if (!DATABASE_URL && !process.env.PGHOST) {
      console.error(
        "⚠️ Missing database configuration. Set DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.",
      );
    }
    if (!DATABASE_URL && process.env.PGHOST === "localhost") {
      console.error(
        "⚠️ PGHOST is localhost in production. On Render, use your managed DB host or set DATABASE_URL.",
      );
    }
    console.log(
      "⚠️  Starting in lite mode (frontend + search OK, auth disabled)",
    );
    dbReady = false;
  }
}

app.get("/", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

app.post("/api/register", async (req, res) => {
  res.status(400).json({
    success: false,
    message:
      "Direct registration is disabled. Request an OTP with /api/register/request-otp and complete verification with /api/register/verify-otp.",
  });
});

app.post("/api/register/check-email", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const email = normalizeEmail(req.body?.email);

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        success: false,
        available: false,
        message: "Enter a valid email address",
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email],
    );

    const available = existingUser.rows.length === 0;

    return res.json({
      success: true,
      available,
      message: available ? "Email is available" : "Email already registered",
    });
  } catch (error) {
    console.error("Check email availability error:", error);
    return res.status(500).json({
      success: false,
      available: false,
      message: "Failed to validate email",
    });
  }
});

app.post("/api/register/request-otp", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email],
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const otp = generateOtpCode();
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      `UPDATE email_verification_otps
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE email = $1
         AND consumed_at IS NULL`,
      [email],
    );

    const insertResult = await pool.query(
      `INSERT INTO email_verification_otps (
         email,
         otp_hash,
         payload,
         expires_at
       ) VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id`,
      [
        email,
        hashOtpCode(otp),
        JSON.stringify({
          name,
          email,
          passwordHash,
          faceDescriptor: null,
        }),
        expiresAt,
      ],
    );

    let deliveryMode = "email";
    let deliveryMessage = `Verification code sent to ${maskEmailAddress(email)}`;
    const isProduction = process.env.NODE_ENV === "production";

    try {
      if (isMailConfigured()) {
        await sendSignupOtpEmail({ email, otp, name });
      } else if (
        OTP_DEV_FALLBACK_ENABLED &&
        (!isProduction || OTP_ALLOW_PRODUCTION_DEV_FALLBACK)
      ) {
        deliveryMode = "console";
        deliveryMessage =
          "SMTP is not configured. OTP generated in development mode.";
        console.log(`DEV OTP for ${email}: ${otp}`);
      } else {
        throw new Error(
          "Email delivery is not configured. Set SMTP_HOST or SMTP_SERVICE, plus SMTP_USER, SMTP_PASS, and MAIL_FROM.",
        );
      }
    } catch (mailError) {
      const allowFallback =
        OTP_DEV_FALLBACK_ENABLED &&
        (!isProduction || OTP_ALLOW_PRODUCTION_DEV_FALLBACK);

      if (allowFallback) {
        deliveryMode = "console";
        deliveryMessage =
          "Email delivery is temporarily unavailable. OTP generated in fallback mode.";
        console.warn(
          `OTP fallback enabled for ${email}. Reason: ${mailError.message}`,
        );
        console.log(`DEV OTP for ${email}: ${otp}`);
      } else {
        await pool.query("DELETE FROM email_verification_otps WHERE id = $1", [
          insertResult.rows[0].id,
        ]);
        const rawError = String(mailError?.message || "");
        const authError =
          /invalid login|username and password not accepted|auth|535/i.test(
            rawError,
          );
        const timeoutError = /timed out|timeout|etimedout|esocket/i.test(
          rawError,
        );

        throw new Error(
          authError
            ? "Email authentication failed. Verify SMTP_USER and SMTP_PASS (use Gmail App Password) in Render environment variables."
            : timeoutError
              ? "Email delivery timed out. Please retry in a minute. If it continues, verify SMTP credentials/network on Render."
              : "Email delivery failed. Verify SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS and MAIL_FROM on Render.",
        );
      }
    }

    console.log(`Signup OTP prepared for ${email} via ${deliveryMode}`);

    res.json({
      success: true,
      message: deliveryMessage,
      maskedEmail: maskEmailAddress(email),
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      deliveryMode,
      devOtp: deliveryMode === "console" && !isProduction ? otp : undefined,
    });
  } catch (error) {
    console.error("Signup OTP request error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send verification code",
    });
  }
});

app.post("/api/register/verify-otp", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = String(req.body?.otp || "").trim();

  if (!dbReady) {
    return res.status(503).json({
      success: false,
      message: "Database is not available",
    });
  }

  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      message: "Email and OTP are required",
    });
  }

  try {
    const otpResult = await pool.query(
      `SELECT id, otp_hash, payload, attempt_count, expires_at
       FROM email_verification_otps
       WHERE email = $1
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [email],
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No active verification code found. Request a new OTP.",
      });
    }

    const otpEntry = otpResult.rows[0];

    if (new Date(otpEntry.expires_at).getTime() < Date.now()) {
      await pool.query(
        "UPDATE email_verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1",
        [otpEntry.id],
      );
      return res.status(400).json({
        success: false,
        message: "OTP expired. Request a new code.",
      });
    }

    if (otpEntry.attempt_count >= OTP_MAX_ATTEMPTS) {
      await pool.query(
        "UPDATE email_verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1",
        [otpEntry.id],
      );
      return res.status(429).json({
        success: false,
        message: "Too many invalid attempts. Request a new OTP.",
      });
    }

    if (otpEntry.otp_hash !== hashOtpCode(otp)) {
      const invalidAttemptResult = await pool.query(
        `UPDATE email_verification_otps
         SET attempt_count = attempt_count + 1,
             consumed_at = CASE
               WHEN attempt_count + 1 >= $2 THEN CURRENT_TIMESTAMP
               ELSE consumed_at
             END
         WHERE id = $1
         RETURNING attempt_count`,
        [otpEntry.id, OTP_MAX_ATTEMPTS],
      );
      const attemptsUsed = invalidAttemptResult.rows[0]?.attempt_count || 1;
      const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - attemptsUsed);

      return res.status(attemptsLeft === 0 ? 429 : 400).json({
        success: false,
        message:
          attemptsLeft === 0
            ? "Too many invalid attempts. Request a new OTP."
            : `Invalid OTP. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`,
      });
    }

    const signupPayload = otpEntry.payload || {};
    const signupName = String(signupPayload.name || "").trim();
    const passwordHash = String(signupPayload.passwordHash || "");
    const faceDescriptor = signupPayload.faceDescriptor || null;

    if (!signupName || !passwordHash) {
      return res.status(400).json({
        success: false,
        message: "Verification session is invalid. Request a new OTP.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingUser = await client.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1",
        [email],
      );

      if (existingUser.rows.length > 0) {
        await client.query(
          "UPDATE email_verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1",
          [otpEntry.id],
        );
        await client.query("COMMIT");
        return res.status(400).json({
          success: false,
          message: "Email already registered",
        });
      }

      const createUserResult = await client.query(
        `INSERT INTO users (name, email, password, face_descriptor)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, created_at`,
        [
          signupName,
          email,
          passwordHash,
          faceDescriptor ? JSON.stringify(faceDescriptor) : null,
        ],
      );

      await client.query(
        "UPDATE email_verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE email = $1 AND consumed_at IS NULL",
        [email],
      );

      await client.query("COMMIT");

      const user = createUserResult.rows[0];
      console.log(`New user registered with verified email: ${email}`);

      return res.json({
        success: true,
        message: "Email verified. Account created successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          created_at: user.created_at,
          hasFace: Boolean(faceDescriptor),
        },
      });
    } catch (transactionError) {
      await client.query("ROLLBACK");
      throw transactionError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Signup OTP verification error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify OTP",
    });
  }
});

function rejectPendingFaceAuthRequests(error) {
  for (const { reject, timeout } of pendingFaceAuthRequests.values()) {
    clearTimeout(timeout);
    reject(error);
  }
  pendingFaceAuthRequests.clear();
}

function isFaceValidationError(message) {
  const text = String(message || "").toLowerCase();
  return [
    "no clear face detected",
    "only one face can be visible",
    "move closer to the camera",
    "center your face",
    "keep your face fully visible",
    "unable to isolate the face region",
    "face embedding failed",
    "unable to read image",
    "no valid face samples",
    "invalid image payload",
  ].some((token) => text.includes(token));
}

function isFaceDependencyError(message) {
  const text = String(message || "").toLowerCase();
  return [
    "face_auth_not_configured",
    "no module named",
    "modulenotfounderror",
    "cannot import name",
    "importerror",
    "deepface",
    "tensorflow",
    "tf_keras",
    "keras",
    "opencv",
    "cv2",
    "numpy",
  ].some((token) => text.includes(token));
}

function ensureFaceAuthWorker() {
  if (faceAuthWorkerReady) {
    return faceAuthWorkerReady;
  }

  faceAuthWorkerReady = new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "face_auth.py");
    const worker = spawn(PYTHON_BIN, [scriptPath, "--worker"], {
      cwd: __dirname,
      env: getPythonSpawnEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    faceAuthWorkerProcess = worker;
    let settled = false;
    let stderrBuffer = "";
    const startupTimeout = setTimeout(() => {
      settleReject(
        new Error(
          `Face auth worker startup timed out after ${FACE_AUTH_WORKER_STARTUP_TIMEOUT_MS}ms`,
        ),
      );
      worker.kill();
    }, FACE_AUTH_WORKER_STARTUP_TIMEOUT_MS);

    const stdoutReader = readline.createInterface({
      input: worker.stdout,
      crlfDelay: Infinity,
    });

    const settleReject = (error) => {
      if (!settled) {
        clearTimeout(startupTimeout);
        settled = true;
        faceAuthWorkerReady = null;
        reject(error);
      }
    };

    const settleResolve = () => {
      if (!settled) {
        clearTimeout(startupTimeout);
        settled = true;
        resolve();
      }
    };

    stdoutReader.on("line", (line) => {
      let payload = null;

      try {
        payload = JSON.parse(line);
      } catch (error) {
        return;
      }

      if (payload?.type === "ready") {
        settleResolve();
        return;
      }

      if (!payload || !payload.id) {
        return;
      }

      const request = pendingFaceAuthRequests.get(payload.id);
      if (!request) {
        return;
      }

      clearTimeout(request.timeout);
      pendingFaceAuthRequests.delete(payload.id);

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
      faceAuthWorkerProcess = null;
      rejectPendingFaceAuthRequests(error);
      settleReject(error);
    });

    worker.on("close", (code) => {
      const error = new Error(
        stderrBuffer.trim() || `Face auth worker stopped with code ${code}`,
      );
      faceAuthWorkerProcess = null;
      faceAuthWorkerReady = null;
      rejectPendingFaceAuthRequests(error);
      settleReject(error);
    });
  });

  return faceAuthWorkerReady;
}

async function runPythonFaceEmbedding(imagePaths = []) {
  if (!FACE_AUTH_AVAILABLE) {
    throw new Error(
      "FACE_AUTH_NOT_CONFIGURED: Python face-auth dependency 'deepface' is not installed.",
    );
  }

  await ensureFaceAuthWorker();

  return new Promise((resolve, reject) => {
    if (!faceAuthWorkerProcess || !faceAuthWorkerProcess.stdin.writable) {
      reject(new Error("Face auth worker is not available"));
      return;
    }

    const id = `face-auth-${++faceAuthWorkerRequestId}`;
    const timeout = setTimeout(() => {
      pendingFaceAuthRequests.delete(id);
      reject(
        new Error(
          `Face auth timed out after ${FACE_AUTH_REQUEST_TIMEOUT_MS}ms`,
        ),
      );
    }, FACE_AUTH_REQUEST_TIMEOUT_MS);

    pendingFaceAuthRequests.set(id, { resolve, reject, timeout });
    faceAuthWorkerProcess.stdin.write(
      `${JSON.stringify({ id, imagePaths })}\n`,
      (error) => {
        if (!error) {
          return;
        }

        clearTimeout(timeout);
        pendingFaceAuthRequests.delete(id);
        reject(error);
      },
    );
  });
}

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
      "SELECT id, name, email, password, face_descriptor, profile_photo FROM users WHERE email = $1",
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
        profilePhoto: user.profile_photo || null,
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

app.get("/api/account", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const userId = Number(req.query?.userId) || null;
    const email = normalizeEmail(req.query?.email);

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        message: "userId or email is required",
      });
    }

    const identity = await resolveUserIdentity(userId, email);
    if (!identity.userId) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userResult = await pool.query(
      `SELECT id, name, email, created_at, profile_photo,
              CASE
                WHEN face_descriptor IS NOT NULL
                  AND face_descriptor != 'null'
                  AND LENGTH(TRIM(face_descriptor)) > 10
                THEN TRUE
                ELSE FALSE
              END AS has_face
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [identity.userId],
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const preferencesResult = await pool.query(
      `SELECT preferred_eras, preferred_languages
       FROM user_preferences
       WHERE user_id = $1
       LIMIT 1`,
      [identity.userId],
    );

    const preferences = preferencesResult.rows[0] || {};

    return res.json({
      success: true,
      account: {
        id: user.id,
        name: user.name,
        email: user.email,
        hasFace: Boolean(user.has_face),
        profilePhoto: user.profile_photo || null,
        createdAt: user.created_at,
        preferredEras: preferences.preferred_eras || [],
        preferredLanguages: preferences.preferred_languages || [],
      },
    });
  } catch (error) {
    console.error("Get account error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch account details",
    });
  }
});

app.delete("/api/account", async (req, res) => {
  let client = null;

  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    client = await pool.connect();

    const incomingUserId = Number(req.body?.userId) || null;
    const incomingEmail = normalizeEmail(req.body?.email);

    if (!incomingUserId && !incomingEmail) {
      return res.status(400).json({
        success: false,
        message: "userId or email is required",
      });
    }

    const identity = await resolveUserIdentity(incomingUserId, incomingEmail);
    if (!identity.userId || !identity.email) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await client.query("BEGIN");

    await client.query("DELETE FROM face_data WHERE user_id = $1", [
      identity.userId,
    ]);
    await client.query("DELETE FROM user_preferences WHERE user_id = $1", [
      identity.userId,
    ]);
    await client.query("DELETE FROM emotion_history WHERE user_id = $1", [
      identity.userId,
    ]);
    await client.query("DELETE FROM user_view_history WHERE user_id = $1", [
      identity.userId,
    ]);
    await client.query("DELETE FROM email_verification_otps WHERE email = $1", [
      identity.email,
    ]);

    const deleteUserResult = await client.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [identity.userId],
    );

    if (!deleteUserResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Account deleted permanently",
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error("Delete account error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete account",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.post("/api/account/profile-photo", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const incomingUserId = Number(req.body?.userId) || null;
    const incomingEmail = normalizeEmail(req.body?.email);
    const image = String(req.body?.image || "").trim();

    if (!incomingUserId && !incomingEmail) {
      return res.status(400).json({
        success: false,
        message: "userId or email is required",
      });
    }

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Profile image is required",
      });
    }

    const profilePhoto = normalizeProfilePhotoDataUrl(image);
    const identity = await resolveUserIdentity(incomingUserId, incomingEmail);

    if (!identity.userId) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const updateResult = await pool.query(
      `UPDATE users
       SET profile_photo = $1
       WHERE id = $2
       RETURNING id, email, profile_photo`,
      [profilePhoto, identity.userId],
    );

    if (!updateResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      message: "Profile photo saved",
      profilePhoto: updateResult.rows[0].profile_photo,
    });
  } catch (error) {
    const message =
      error.message || "Failed to save profile photo. Please try again.";
    const clientError =
      message.includes("Invalid profile image") ||
      message.includes("must be JPG") ||
      message.includes("exceeds") ||
      message.includes("empty");

    console.error("Save profile photo error:", error);
    return res.status(clientError ? 400 : 500).json({
      success: false,
      message,
    });
  }
});

app.delete("/api/account/profile-photo", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const incomingUserId = Number(req.body?.userId) || null;
    const incomingEmail = normalizeEmail(req.body?.email);

    if (!incomingUserId && !incomingEmail) {
      return res.status(400).json({
        success: false,
        message: "userId or email is required",
      });
    }

    const identity = await resolveUserIdentity(incomingUserId, incomingEmail);
    if (!identity.userId) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await pool.query(
      `UPDATE users
       SET profile_photo = NULL
       WHERE id = $1`,
      [identity.userId],
    );

    return res.json({
      success: true,
      message: "Profile photo removed",
      profilePhoto: null,
    });
  } catch (error) {
    console.error("Delete profile photo error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove profile photo",
    });
  }
});

app.post("/api/face-login", async (req, res) => {
  const tempImagePaths = [];

  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const images = normalizeIncomingImages(req.body);

    if (!images.length) {
      return res.status(400).json({
        success: false,
        message: "At least one face image is required",
      });
    }

    for (const image of images.slice(0, 4)) {
      tempImagePaths.push(await writeTempImage(image, "musicera-face-login"));
    }

    const scanResult = await runPythonFaceEmbedding(tempImagePaths);
    const probeEmbedding = parseFaceEmbedding(scanResult.embedding);

    if (!probeEmbedding) {
      return res.status(422).json({
        success: false,
        message: "Unable to build a secure face signature from this scan.",
      });
    }

    const result = await pool.query(
      "SELECT id, name, email, face_descriptor, profile_photo FROM users WHERE face_descriptor IS NOT NULL AND face_descriptor != 'null' AND length(face_descriptor) > 10",
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "No users registered with face recognition",
      });
    }

    const rankedMatches = result.rows
      .map((user) => {
        const enrolledEmbedding = parseFaceEmbedding(user.face_descriptor);
        if (!enrolledEmbedding) {
          return null;
        }

        return {
          user,
          distance: cosineDistance(probeEmbedding, enrolledEmbedding),
        };
      })
      .filter((entry) => entry && Number.isFinite(entry.distance))
      .sort((left, right) => left.distance - right.distance);

    const bestMatch = rankedMatches[0] || null;
    const secondMatch = rankedMatches[1] || null;

    if (!bestMatch) {
      return res.status(401).json({
        success: false,
        message:
          "No valid face profile found for verification. Please re-enroll Face ID from your account settings.",
      });
    }

    const hasClearSeparation =
      !secondMatch ||
      secondMatch.distance - bestMatch.distance >= FACE_MATCH_MIN_MARGIN;
    const passesStrictThreshold = bestMatch.distance <= FACE_MATCH_THRESHOLD;
    const passesFallbackThreshold =
      bestMatch.distance <= FACE_MATCH_FALLBACK_THRESHOLD && hasClearSeparation;

    if (!passesStrictThreshold && !passesFallbackThreshold) {
      return res.status(401).json({
        success: false,
        message:
          "Face not recognized with enough confidence. Try again in better light or use email/password.",
      });
    }

    if (!hasClearSeparation) {
      return res.status(401).json({
        success: false,
        message:
          "Face scan is too close to another enrolled profile. Use email/password and scan again.",
      });
    }

    console.log(
      `Face login successful: ${bestMatch.user.email} (distance: ${bestMatch.distance.toFixed(4)})`,
    );

    res.json({
      success: true,
      message: "Face login successful",
      user: {
        id: bestMatch.user.id,
        name: bestMatch.user.name,
        email: bestMatch.user.email,
        hasFace: true,
        profilePhoto: bestMatch.user.profile_photo || null,
      },
      scan: {
        qualityScore: scanResult.qualityScore,
        samplesUsed: scanResult.samplesUsed,
      },
    });
  } catch (error) {
    console.error("Face login error:", error);
    const message = String(error?.message || "");
    const timedOut = /timed out/i.test(message);
    const missingDeepFace = isFaceDependencyError(message);
    const validationError = isFaceValidationError(message);
    const statusCode = missingDeepFace
      ? 503
      : timedOut
        ? 504
        : validationError
          ? 422
          : 500;

    res.status(statusCode).json({
      success: false,
      code: missingDeepFace ? "FACE_AUTH_NOT_CONFIGURED" : undefined,
      message: timedOut
        ? "Face verification is taking longer than expected. Please retry in a few seconds or use email/password login."
        : missingDeepFace
          ? "Face login is not configured on this server. Install Python face-auth dependencies and restart the server."
          : message || "Error with face login",
    });
  } finally {
    await Promise.all(
      tempImagePaths.map((imagePath) => fs.unlink(imagePath).catch(() => {})),
    );
  }
});

app.post("/api/save-face", async (req, res) => {
  const tempImagePaths = [];

  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const email = normalizeEmail(req.body?.email);
    const images = normalizeIncomingImages(req.body);

    if (!email || !images.length) {
      return res.status(400).json({
        success: false,
        message: "Email and face images are required",
      });
    }

    for (const image of images.slice(0, 4)) {
      tempImagePaths.push(await writeTempImage(image, "musicera-face-enroll"));
    }

    const enrollmentResult = await runPythonFaceEmbedding(tempImagePaths);
    const embedding = parseFaceEmbedding(enrollmentResult.embedding);

    if (!embedding) {
      return res.status(422).json({
        success: false,
        message: "The scanner could not capture a reliable face profile.",
      });
    }

    const result = await pool.query(
      "UPDATE users SET face_descriptor = $1 WHERE email = $2 RETURNING id, name, email, profile_photo",
      [JSON.stringify(embedding), email],
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
        profilePhoto: result.rows[0].profile_photo || null,
      },
      faceProfile: {
        qualityScore: enrollmentResult.qualityScore,
        samplesUsed: enrollmentResult.samplesUsed,
      },
    });
  } catch (error) {
    console.error("Save face error:", error);
    const message = String(error?.message || "");
    const timedOut = /timed out/i.test(message);
    const missingDeepFace = isFaceDependencyError(message);
    const validationError = isFaceValidationError(message);
    const statusCode = missingDeepFace
      ? 503
      : timedOut
        ? 504
        : validationError
          ? 422
          : 500;

    res.status(statusCode).json({
      success: false,
      code: missingDeepFace ? "FACE_AUTH_NOT_CONFIGURED" : undefined,
      message: timedOut
        ? "Face enrollment is taking longer than expected. Please retry in a few seconds."
        : missingDeepFace
          ? "Face enrollment is not configured on this server. Install Python face-auth dependencies and restart the server."
          : message || "Error saving face data",
    });
  } finally {
    await Promise.all(
      tempImagePaths.map((imagePath) => fs.unlink(imagePath).catch(() => {})),
    );
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
    const scriptPath = path.join(__dirname, "emotion_detection.py");
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
  if (!ML_FEATURES_ENABLED) {
    throw new Error(
      "EMOTION_DETECTION_DISABLED: Set ML_FEATURES_ENABLED=true and install Python ML dependencies.",
    );
  }

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
  let tempImagePath = null;

  try {
    tempImagePath = await writeTempImage(image, "musicera-emotion");
    const result = await runPythonEmotionDetection(tempImagePath);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const disabled = /EMOTION_DETECTION_DISABLED/i.test(error.message || "");
    const statusCode =
      error.message === "A base64 encoded image is required" ||
      error.message === "Invalid image payload"
        ? 400
        : disabled
          ? 503
          : 500;

    console.error("Emotion detection error:", error.message);
    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : statusCode === 503
            ? "Emotion detection is disabled on this deployment. Set ML_FEATURES_ENABLED=true and install ML Python dependencies."
            : "Emotion detection failed. Install Python dependencies from requirements.txt and try again.",
      error: statusCode === 400 ? undefined : error.message,
    });
  } finally {
    if (tempImagePath) {
      await fs.unlink(tempImagePath).catch(() => {});
    }
  }
});

app.post("/api/emotion-history", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const { userId, email, dominantEmotion, emotions, detectedAt } = req.body;
    const normalizedDominantEmotion = String(dominantEmotion || "")
      .trim()
      .toLowerCase();
    const normalizedScores = normalizeEmotionScores(emotions);

    if (!normalizedDominantEmotion) {
      return res.status(400).json({
        success: false,
        message: "dominantEmotion is required",
      });
    }

    let resolvedUserId = Number(userId) || null;
    let resolvedEmail = String(email || "").trim() || null;
    if (!resolvedUserId && email) {
      const userLookup = await pool.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1",
        [email],
      );
      resolvedUserId = userLookup.rows[0]?.id || null;
    }

    if (!resolvedEmail && resolvedUserId) {
      const userLookup = await pool.query(
        "SELECT email FROM users WHERE id = $1 LIMIT 1",
        [resolvedUserId],
      );
      resolvedEmail = userLookup.rows[0]?.email || null;
    }

    if (!resolvedUserId) {
      return res.status(400).json({
        success: false,
        message: "A valid userId or email is required",
      });
    }

    const dominantConfidence = Number(
      normalizedScores[normalizedDominantEmotion] || 0,
    );

    const result = await pool.query(
      `INSERT INTO emotion_history (
         user_email,
         emotion,
         confidence,
         user_id,
         dominant_emotion,
         emotion_scores,
         detected_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6::jsonb,
         COALESCE($7::timestamp, CURRENT_TIMESTAMP)
       )
       RETURNING id, user_id, dominant_emotion, emotion_scores, detected_at`,
      [
        resolvedEmail,
        normalizedDominantEmotion,
        dominantConfidence,
        resolvedUserId,
        normalizedDominantEmotion,
        JSON.stringify(normalizedScores),
        detectedAt || null,
      ],
    );

    res.json({
      success: true,
      entry: result.rows[0],
    });
  } catch (error) {
    console.error("Emotion history save error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save emotion history",
    });
  }
});

app.get("/api/emotion-history", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const requestedUserId = Number(req.query.userId) || null;
    const requestedEmail = String(req.query.email || "").trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));

    let resolvedUserId = requestedUserId;
    if (!resolvedUserId && requestedEmail) {
      const userLookup = await pool.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1",
        [requestedEmail],
      );
      resolvedUserId = userLookup.rows[0]?.id || null;
    }

    if (!resolvedUserId) {
      return res.status(400).json({
        success: false,
        message: "A valid userId or email is required",
      });
    }

    const historyResult = await pool.query(
      `SELECT id, user_id, dominant_emotion, emotion_scores, detected_at
       FROM (
         SELECT id, user_id, dominant_emotion, emotion_scores, detected_at
         FROM emotion_history
         WHERE user_id = $1
         ORDER BY detected_at DESC
         LIMIT $2
       ) recent_history
       ORDER BY detected_at ASC`,
      [resolvedUserId, limit],
    );

    res.json({
      success: true,
      history: historyResult.rows,
    });
  } catch (error) {
    console.error("Emotion history fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch emotion history",
    });
  }
});

app.post("/api/view-history", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const { userId, email, songId, songTitle, songArtist, searchQuery, mood } =
      req.body;
    const identity = await resolveUserIdentity(userId, email);

    if (!identity.userId) {
      return res.status(400).json({
        success: false,
        message: "A valid userId or email is required",
      });
    }

    let moodSnapshot = normalizeMoodLabel(mood);
    if (!mood && identity.userId) {
      const latestMoodResult = await pool.query(
        `SELECT dominant_emotion
         FROM emotion_history
         WHERE user_id = $1
         ORDER BY detected_at DESC
         LIMIT 1`,
        [identity.userId],
      );
      if (latestMoodResult.rows[0]?.dominant_emotion) {
        moodSnapshot = normalizeMoodLabel(
          latestMoodResult.rows[0].dominant_emotion,
        );
      }
    }

    const saveResult = await pool.query(
      `INSERT INTO user_view_history (
         user_id,
         song_id,
         song_title,
         song_artist,
         search_query,
         mood_snapshot,
         played_at
       ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING id, user_id, mood_snapshot, played_at`,
      [
        identity.userId,
        songId || null,
        songTitle || null,
        songArtist || null,
        searchQuery || null,
        moodSnapshot || "neutral",
      ],
    );

    res.json({
      success: true,
      entry: saveResult.rows[0],
    });
  } catch (error) {
    console.error("View history save error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save view history",
    });
  }
});

app.get("/api/search-suggestions", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const normalizedQuery = query.toLowerCase();
  const requestedUserId = Number(req.query.userId) || null;
  const requestedEmail = normalizeEmail(req.query.email);
  const limit = Math.min(15, Math.max(1, Number(req.query.limit) || 8));

  const suggestions = [];
  const seen = new Set();

  const tryAddSuggestion = (label) => {
    const candidate = String(label || "").trim();
    if (!candidate) {
      return;
    }

    const normalizedCandidate = candidate.toLowerCase();
    if (normalizedQuery && !normalizedCandidate.includes(normalizedQuery)) {
      return;
    }

    if (normalizedCandidate.length < 2 || seen.has(normalizedCandidate)) {
      return;
    }

    seen.add(normalizedCandidate);
    suggestions.push(candidate);
  };

  try {
    if (!dbReady) {
      DEFAULT_SUGGESTION_SEEDS.forEach(tryAddSuggestion);
      return res.json({
        success: true,
        suggestions: suggestions.slice(0, limit),
        source: "fallback",
      });
    }

    const identity = await resolveUserIdentity(requestedUserId, requestedEmail);

    if (identity.userId) {
      const userSearches = await pool.query(
        `SELECT MIN(TRIM(search_query)) AS label,
                MAX(played_at) AS last_seen,
                COUNT(*) AS hits
         FROM user_view_history
         WHERE user_id = $1
           AND search_query IS NOT NULL
           AND LENGTH(TRIM(search_query)) >= 2
         GROUP BY LOWER(TRIM(search_query))
         ORDER BY hits DESC, last_seen DESC
         LIMIT 20`,
        [identity.userId],
      );

      for (const row of userSearches.rows) {
        tryAddSuggestion(row.label);
      }

      const userSongs = await pool.query(
        `SELECT MIN(TRIM(song_title)) AS label,
                MAX(played_at) AS last_seen,
                COUNT(*) AS hits
         FROM user_view_history
         WHERE user_id = $1
           AND song_title IS NOT NULL
           AND LENGTH(TRIM(song_title)) >= 2
         GROUP BY LOWER(TRIM(song_title))
         ORDER BY hits DESC, last_seen DESC
         LIMIT 20`,
        [identity.userId],
      );

      for (const row of userSongs.rows) {
        tryAddSuggestion(row.label);
      }
    }

    const trendingQueries = await pool.query(
      `SELECT MIN(TRIM(search_query)) AS label,
              MAX(played_at) AS last_seen,
              COUNT(*) AS hits
       FROM user_view_history
       WHERE search_query IS NOT NULL
         AND LENGTH(TRIM(search_query)) >= 2
         AND played_at >= (CURRENT_TIMESTAMP - INTERVAL '45 days')
       GROUP BY LOWER(TRIM(search_query))
       ORDER BY hits DESC, last_seen DESC
       LIMIT 40`,
      [],
    );

    for (const row of trendingQueries.rows) {
      tryAddSuggestion(row.label);
    }

    const trendingSongs = await pool.query(
      `SELECT MIN(TRIM(song_title)) AS label,
              MAX(played_at) AS last_seen,
              COUNT(*) AS hits
       FROM user_view_history
       WHERE song_title IS NOT NULL
         AND LENGTH(TRIM(song_title)) >= 2
         AND played_at >= (CURRENT_TIMESTAMP - INTERVAL '45 days')
       GROUP BY LOWER(TRIM(song_title))
       ORDER BY hits DESC, last_seen DESC
       LIMIT 40`,
      [],
    );

    for (const row of trendingSongs.rows) {
      tryAddSuggestion(row.label);
    }

    DEFAULT_SUGGESTION_SEEDS.forEach(tryAddSuggestion);

    res.json({
      success: true,
      suggestions: suggestions.slice(0, limit),
      source: identity.userId ? "personalized" : "trending",
    });
  } catch (error) {
    console.error("Search suggestions error:", error);

    const fallback = [];
    const fallbackSeen = new Set();
    for (const item of DEFAULT_SUGGESTION_SEEDS) {
      const normalized = item.toLowerCase();
      if (normalizedQuery && !normalized.includes(normalizedQuery)) {
        continue;
      }
      if (!fallbackSeen.has(normalized)) {
        fallbackSeen.add(normalized);
        fallback.push(item);
      }
      if (fallback.length >= limit) {
        break;
      }
    }

    res.json({
      success: true,
      suggestions: fallback,
      source: "fallback",
    });
  }
});

// Fallback for 404 images
app.get(/^\/(placeholder-audio|audio)\.(jpg|svg|png)$/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "audio.svg"));
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
  const {
    query,
    format = "mp4",
    pageToken = "",
    userId,
    email,
    moodAware = true,
    preferredMood,
  } = req.body;
  const perPage = 20;
  if (!query)
    return res.status(400).json({ success: false, message: "Query required" });

  try {
    let results = [];
    let nextPageToken = null;
    let moodProfile = null;

    const normalizedPreferredMood = normalizeMoodLabel(preferredMood);

    if (normalizedPreferredMood && normalizedPreferredMood !== "neutral") {
      moodProfile = {
        dominantMood: normalizedPreferredMood,
        moods: [{ mood: normalizedPreferredMood, score: 100 }],
        lookbackDays: 0,
        source: "forced",
      };
    } else if (dbReady && moodAware) {
      const identity = await resolveUserIdentity(userId, email);
      if (identity.userId) {
        moodProfile = await getMoodProfileFromHistory(
          identity.userId,
          EMOTION_LOOKBACK_DAYS,
        );
      }
    }

    if (format === "mp4") {
      const ytKey = process.env.YOUTUBE_API_KEY || "demo";
      const { data } = await axios.get(
        "https://youtube.googleapis.com/youtube/v3/search",
        {
          params: {
            part: "snippet",
            q: query.trim(),
            type: "video",
            order: "relevance",
            safeSearch: "none",
            maxResults: perPage,
            pageToken: pageToken || undefined,
            key: ytKey,
          },
        },
      );

      results = (data.items || [])
        .filter((i) => i?.id?.videoId)
        .map((i) => ({
          id: i.id.videoId,
          title: i.snippet.title,
          artist: i.snippet.channelTitle,
          thumbnail: i.snippet.thumbnails.medium.url,
          url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
          type: "youtube",
          format,
        }));

      nextPageToken = data.nextPageToken || null;
    } /* else {
      // Reliable free MP3 URLs + infinite - MP3 DISABLED
      for (let i = 1; i <= perPage * 2; i++) {
        results.push({
          id: `demo${i}`,
          title: `${query} Track ${i}`,
          artist: `Demo Artist ${i}`,
          thumbnail: "/audio.svg",
          url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 16) + 1}.mp3`,
          type: "freesound",
          format: "mp3",
        });
      }
      nextPageToken = null;
    } */

    if (moodProfile?.dominantMood) {
      results = scoreSongsByMood(results, moodProfile.dominantMood);
    }

    res.json({
      success: true,
      results,
      hasMore: Boolean(nextPageToken),
      nextPageToken,
      moodProfile,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Search failed" });
  }
});

// Calculate average emotion from last 4-5 scans
app.post("/api/emotion/average", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const { userId, email, recentScans = [] } = req.body;
    const identity = await resolveUserIdentity(userId, email);

    if (!identity.userId) {
      return res.status(400).json({
        success: false,
        message: "A valid userId or email is required",
      });
    }

    let sourceScans = [];

    if (Array.isArray(recentScans) && recentScans.length > 0) {
      sourceScans = recentScans
        .map((entry) => normalizeValidMood(entry))
        .filter((entry) => Boolean(entry));
    }

    // Fallback to DB only when explicit session scans are not provided.
    if (sourceScans.length === 0) {
      const recentEmotions = await pool.query(
        `SELECT dominant_emotion
         FROM emotion_history
         WHERE user_id = $1
         ORDER BY detected_at DESC
         LIMIT 5`,
        [identity.userId],
      );

      sourceScans = recentEmotions.rows
        .map((row) => normalizeValidMood(row.dominant_emotion))
        .filter((entry) => Boolean(entry));
    }

    if (sourceScans.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No emotion history found. Please detect emotions first.",
      });
    }

    // Count emotions and choose the mode; break ties by most recent scan.
    const emotionCounts = {};
    sourceScans.forEach((emotion) => {
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(emotionCounts));
    const topMoods = Object.entries(emotionCounts)
      .filter(([, count]) => count === maxCount)
      .map(([mood]) => mood);

    const latestScan = sourceScans[sourceScans.length - 1] || "neutral";
    const averageEmotion = topMoods.includes(latestScan)
      ? latestScan
      : topMoods[0] || latestScan;

    // Get user preferences
    const prefResult = await pool.query(
      `SELECT preferred_eras, preferred_languages FROM user_preferences WHERE user_id = $1`,
      [identity.userId],
    );

    const userPrefs = prefResult.rows[0] || {
      preferred_eras: [],
      preferred_languages: [],
    };

    res.json({
      success: true,
      averageEmotion,
      recentEmotions: sourceScans.length,
      emotionBreakdown: emotionCounts,
      userPreferences: {
        eras: userPrefs.preferred_eras || [],
        languages: userPrefs.preferred_languages || [],
      },
    });
  } catch (error) {
    console.error("Emotion average calculation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate emotion average",
    });
  }
});

// Save user music preferences (era and language)
app.post("/api/user-preferences", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const { userId, email, eras = [], languages = [] } = req.body;
    const identity = await resolveUserIdentity(userId, email);

    if (!identity.userId) {
      return res.status(400).json({
        success: false,
        message: "A valid userId or email is required",
      });
    }

    // Validate and sanitize inputs for text[] columns.
    const validEras = Array.isArray(eras)
      ? eras
          .map((era) => String(era || "").trim())
          .filter((era) => era.length > 0)
      : [];
    const validLanguages = Array.isArray(languages)
      ? languages
          .map((language) => String(language || "").trim())
          .filter((language) => language.length > 0)
      : [];

    // Upsert user preferences
    const result = await pool.query(
      `INSERT INTO user_preferences (user_id, preferred_eras, preferred_languages, updated_at)
       VALUES ($1, $2::text[], $3::text[], CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET
         preferred_eras = $2::text[],
         preferred_languages = $3::text[],
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [identity.userId, validEras, validLanguages],
    );

    res.json({
      success: true,
      preferences: result.rows[0],
    });
  } catch (error) {
    console.error("User preferences save error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save user preferences",
    });
  }
});

// Get user music preferences
app.get("/api/user-preferences", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const { userId, email } = req.query;
    const identity = await resolveUserIdentity(userId, email);

    if (!identity.userId) {
      return res.status(400).json({
        success: false,
        message: "A valid userId or email is required",
      });
    }

    const result = await pool.query(
      `SELECT preferred_eras, preferred_languages FROM user_preferences WHERE user_id = $1`,
      [identity.userId],
    );

    const preferences = result.rows[0] || {
      preferred_eras: [],
      preferred_languages: [],
    };

    res.json({
      success: true,
      preferences: {
        eras: preferences.preferred_eras || [],
        languages: preferences.preferred_languages || [],
      },
    });
  } catch (error) {
    console.error("User preferences fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user preferences",
    });
  }
});

// Get mood-based song recommendations
app.post("/api/recommendations", async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({
        success: false,
        message: "Database is not available",
      });
    }

    const { userId, email, mood } = req.body;
    const identity = await resolveUserIdentity(userId, email);

    if (!identity.userId || !mood) {
      return res.status(400).json({
        success: false,
        message: "Valid userId/email and mood are required",
      });
    }

    // Get user preferences
    const prefResult = await pool.query(
      `SELECT preferred_eras, preferred_languages FROM user_preferences WHERE user_id = $1`,
      [identity.userId],
    );

    const userPrefs = prefResult.rows[0] || {
      preferred_eras: [],
      preferred_languages: [],
    };

    // Get search keywords for the mood
    const moodResult = await pool.query(
      `SELECT song_keywords FROM mood_song_mapping WHERE LOWER(mood) = LOWER($1) LIMIT 1`,
      [mood],
    );

    let searchKeywords = mood; // Default fallback
    if (moodResult.rows[0]) {
      const keywords = moodResult.rows[0].song_keywords.split(",");
      searchKeywords = keywords[Math.floor(Math.random() * keywords.length)];
    }

    // Build search query with user preferences
    let searchQuery = searchKeywords;
    if (
      userPrefs.preferred_languages &&
      userPrefs.preferred_languages.length > 0
    ) {
      searchQuery += ` ${userPrefs.preferred_languages[0]}`;
    }
    if (userPrefs.preferred_eras && userPrefs.preferred_eras.length > 0) {
      searchQuery += ` ${userPrefs.preferred_eras[0]}`;
    }

    res.json({
      success: true,
      recommendation: {
        mood,
        searchQuery: searchQuery.trim(),
        keywords: searchKeywords,
        userPreferences: {
          eras: userPrefs.preferred_eras || [],
          languages: userPrefs.preferred_languages || [],
        },
      },
    });
  } catch (error) {
    console.error("Recommendations fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recommendations",
    });
  }
});

async function startServer() {
  console.log("🚀 Starting MusicEra server...");
  console.log(`🐍 Python binary: ${PYTHON_BIN}`);
  console.log(`🧠 ML features enabled: ${ML_FEATURES_ENABLED ? "yes" : "no"}`);
  console.log(`🧪 Python isolated env: ${PYTHON_ISOLATED_ENV ? "yes" : "no"}`);
  console.log(`🧪 DeepFace available: ${FACE_AUTH_AVAILABLE ? "yes" : "no"}`);
  if (ML_FEATURES_ENABLED && !FACE_AUTH_AVAILABLE) {
    console.warn(
      "⚠️ Face authentication is disabled: missing Python dependency 'deepface'.",
    );
  }
  await initializeDatabase();
  if (ML_FEATURES_ENABLED) {
    try {
      console.log("🧠 Warming emotion detection worker...");
      await ensureEmotionWorker();
    } catch (error) {
      console.error("⚠️ Emotion worker warmup failed:", error.message);
    }
    try {
      console.log("🛡️ Warming face auth worker...");
      await ensureFaceAuthWorker();
    } catch (error) {
      console.error("⚠️ Face auth worker warmup failed:", error.message);
    }
  } else {
    console.log("🧩 ML workers skipped (ML_FEATURES_ENABLED=false)");
  }
  console.log("🌐 Starting HTTP server...");
  app.listen(PORT, HOST, () => {
    const status = dbReady ? "FULL (DB OK)" : "LITE (no DB)";
    console.log(`\n🎵 MusicEra on http://${HOST}:${PORT} [${status}]`);
    console.log("✅ Ready! Open browser.");
  });
}

startServer();
