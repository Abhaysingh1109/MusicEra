// MusicEra - Login & Signup with Face Recognition
// Connected to PostgreSQL Backend API

const API_BASE = String(
  window.MUSICERA_API_BASE ||
    localStorage.getItem("MUSICERA_API_BASE") ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:3001"
      : ""),
)
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");
const API_URL = `${API_BASE}/api`;

function canUseApi() {
  if (API_BASE) {
    return true;
  }

  updateFaceStatus(
    "error",
    "API base is not configured. Add backend URL in api-config.js.",
  );
  return false;
}

function ensureCelebrationPopupStyles() {
  if (document.getElementById("musiceraCelebrationStyles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "musiceraCelebrationStyles";
  style.textContent = `
    .musicera-celebration-overlay {
      position: fixed;
      inset: 0;
      z-index: 5000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: radial-gradient(circle at top, rgba(37, 99, 235, 0.25), rgba(4, 8, 24, 0.86));
      backdrop-filter: blur(5px);
    }

    .musicera-celebration-popup {
      width: min(460px, 100%);
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: linear-gradient(160deg, rgba(30, 58, 138, 0.96), rgba(109, 40, 217, 0.94));
      color: #fff;
      box-shadow: 0 22px 65px rgba(0, 0, 0, 0.45);
      padding: 22px 20px;
      text-align: center;
      position: relative;
      overflow: hidden;
      animation: musiceraCelebrationEnter 320ms ease;
    }

    .musicera-celebration-popup h3 {
      margin: 0 0 8px;
      font-size: 1.35rem;
    }

    .musicera-celebration-popup p {
      margin: 0;
      line-height: 1.45;
      color: rgba(255, 255, 255, 0.92);
    }

    .musicera-celebration-popup .spark {
      position: absolute;
      top: -18px;
      font-size: 1rem;
      opacity: 0;
      animation: musiceraSparkFall 1700ms linear infinite;
      pointer-events: none;
    }

    .musicera-celebration-popup .spark:nth-child(1) { left: 8%; animation-delay: 0ms; }
    .musicera-celebration-popup .spark:nth-child(2) { left: 18%; animation-delay: 220ms; }
    .musicera-celebration-popup .spark:nth-child(3) { left: 30%; animation-delay: 420ms; }
    .musicera-celebration-popup .spark:nth-child(4) { left: 42%; animation-delay: 150ms; }
    .musicera-celebration-popup .spark:nth-child(5) { left: 54%; animation-delay: 520ms; }
    .musicera-celebration-popup .spark:nth-child(6) { left: 66%; animation-delay: 330ms; }
    .musicera-celebration-popup .spark:nth-child(7) { left: 78%; animation-delay: 620ms; }
    .musicera-celebration-popup .spark:nth-child(8) { left: 90%; animation-delay: 260ms; }

    .musicera-celebration-button {
      margin-top: 16px;
      border: 0;
      border-radius: 999px;
      padding: 10px 18px;
      background: rgba(255, 255, 255, 0.92);
      color: #1e40af;
      font-weight: 700;
      cursor: pointer;
    }

    @keyframes musiceraCelebrationEnter {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes musiceraSparkFall {
      0% { transform: translateY(0) rotate(0deg); opacity: 0; }
      15% { opacity: 1; }
      100% { transform: translateY(220px) rotate(340deg); opacity: 0; }
    }
  `;

  document.head.appendChild(style);
}

function showCelebrationPopup(title, message) {
  ensureCelebrationPopupStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "musicera-celebration-overlay";

    const popup = document.createElement("div");
    popup.className = "musicera-celebration-popup";

    for (let i = 0; i < 8; i += 1) {
      const spark = document.createElement("span");
      spark.className = "spark";
      spark.textContent = i % 2 === 0 ? "✨" : "🎉";
      popup.appendChild(spark);
    }

    const heading = document.createElement("h3");
    heading.textContent = title || "Success";

    const description = document.createElement("p");
    description.textContent = message || "Operation completed.";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "musicera-celebration-button";
    closeBtn.textContent = "Awesome";

    const close = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" || event.key === "Enter") {
        close();
      }
    };

    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown);

    popup.appendChild(heading);
    popup.appendChild(description);
    popup.appendChild(closeBtn);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    setTimeout(close, 2600);
  });
}

function showAppPopup(title, message, options = {}) {
  ensureCelebrationPopupStyles();

  const config = {
    tone: "info",
    buttonText: "OK",
    autoCloseMs: 0,
    ...options,
  };

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "musicera-celebration-overlay";

    const popup = document.createElement("div");
    popup.className = "musicera-celebration-popup";

    if (config.tone === "error") {
      popup.style.background =
        "linear-gradient(160deg, rgba(127, 29, 29, 0.97), rgba(190, 24, 93, 0.95))";
    } else if (config.tone === "warning") {
      popup.style.background =
        "linear-gradient(160deg, rgba(120, 53, 15, 0.97), rgba(234, 88, 12, 0.95))";
    } else {
      popup.style.background =
        "linear-gradient(160deg, rgba(30, 58, 138, 0.96), rgba(67, 56, 202, 0.95))";
    }

    const heading = document.createElement("h3");
    heading.textContent = title || "Notice";

    const description = document.createElement("p");
    description.textContent = message || "";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "musicera-celebration-button";
    closeBtn.textContent = config.buttonText;

    const close = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" || event.key === "Enter") {
        close();
      }
    };

    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown);

    popup.appendChild(heading);
    popup.appendChild(description);
    popup.appendChild(closeBtn);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    if (config.autoCloseMs > 0) {
      setTimeout(close, config.autoCloseMs);
    }
  });
}

// DOM Elements
const faceModal = document.getElementById("faceModal");
const faceSetupModal = document.getElementById("faceSetupModal");
const otpModal = document.getElementById("otpModal");
const otpForm = document.getElementById("otpForm");
const otpCodeInput = document.getElementById("otpCode");
const otpStatus = document.getElementById("otpStatus");
const otpEmailDisplay = document.getElementById("otpEmailDisplay");
const resendOtpBtn = document.getElementById("resendOtpBtn");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const signupForm = document.getElementById("signupForm");
const signupEmailInput = document.getElementById("signupEmail");
const signupEmailStatus = document.getElementById("signupEmailStatus");
const signupSubmitBtn = document.getElementById("signupSubmitBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const video = document.getElementById("video");
const faceCanvas = document.getElementById("faceCanvas");
const faceStatus = document.getElementById("faceStatus");
const enableFaceToggle = document.getElementById("enableFaceToggle");
const setupFaceBtn = document.getElementById("setupFaceBtn");

// Face API variables
let faceApiLoaded = false;
let stream = null;
let currentMode = ""; // 'signup-setup', 'login'
let currentUserEmail = null;
let pendingSignupPayload = null;
let pendingMaskedEmail = "";
let isSignupEmailEligible = false;
let isSignupOtpRequestInProgress = false;
let signupEmailCheckDebounceId = null;
let signupEmailCheckRequestId = 0;
let detectionIntervalId = null;
let scanToken = 0;
let stableDetectionCount = 0;
let captureInProgress = false;
const FACE_LOGIN_SAMPLE_COUNT = 1;
const FACE_ENROLL_SAMPLE_COUNT = 3;
const FACE_LOGIN_STABLE_PASSES = 1;
const FACE_ENROLL_STABLE_PASSES = 3;
const FACE_DETECTION_INTERVAL_MS = 95;
const FACE_LOGIN_CAPTURE_QUALITY = 0.78;
const FACE_ENROLL_CAPTURE_QUALITY = 0.9;

function getFaceSampleCount() {
  return currentMode === "login"
    ? FACE_LOGIN_SAMPLE_COUNT
    : FACE_ENROLL_SAMPLE_COUNT;
}

function getRequiredStablePasses() {
  return currentMode === "login"
    ? FACE_LOGIN_STABLE_PASSES
    : FACE_ENROLL_STABLE_PASSES;
}

function getCaptureQuality() {
  return currentMode === "login"
    ? FACE_LOGIN_CAPTURE_QUALITY
    : FACE_ENROLL_CAPTURE_QUALITY;
}

// Initialize when page loads
document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

async function initApp() {
  // Load Face API models
  await loadFaceAPI();

  // Hide loading overlay
  setTimeout(() => {
    loadingOverlay.classList.add("hidden");
  }, 1500);

  // Initialize password strength
  initPasswordStrength();
  initSignupEmailValidation();

  // Ensure manual login is hidden by default
  const manualFields = document.getElementById("manualLoginFields");
  const submitBtn = document.getElementById("loginSubmitBtn");
  if (manualFields) manualFields.style.display = "none";
  if (submitBtn) submitBtn.style.display = "none";
}

function normalizeEmailForValidation(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setSignupEmailStatus(type, message) {
  if (!signupEmailStatus) return;

  signupEmailStatus.className = "form-hint";
  if (type) {
    signupEmailStatus.classList.add(type);
  }
  signupEmailStatus.textContent = message || "";
}

function updateSignupSubmitState() {
  if (!signupSubmitBtn) return;

  signupSubmitBtn.disabled =
    isSignupOtpRequestInProgress || !isSignupEmailEligible;
}

async function checkEmailAvailability(email) {
  const response = await fetch(`${API_URL}/register/check-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    const fallbackMessage =
      response.status === 404
        ? "Signup email-check endpoint not found. Ensure API base points to the MusicEra backend."
        : "Unable to validate email right now";

    return {
      success: false,
      available: false,
      message: data.message || fallbackMessage,
    };
  }

  return {
    success: Boolean(data.success),
    available: Boolean(data.available),
    message: data.message || "",
  };
}

async function validateSignupEmailAvailability() {
  const email = normalizeEmailForValidation(signupEmailInput?.value);
  signupEmailCheckRequestId += 1;
  const requestId = signupEmailCheckRequestId;

  isSignupEmailEligible = false;
  updateSignupSubmitState();

  if (!email) {
    setSignupEmailStatus("", "");
    return;
  }

  if (!isValidEmailFormat(email)) {
    setSignupEmailStatus("error", "Enter a valid email address.");
    return;
  }

  if (!API_BASE) {
    setSignupEmailStatus("error", "Backend API is not configured.");
    return;
  }

  setSignupEmailStatus("info", "Checking email availability...");

  try {
    const result = await checkEmailAvailability(email);
    if (requestId !== signupEmailCheckRequestId) {
      return;
    }

    if (!result.success) {
      setSignupEmailStatus("error", result.message);
      return;
    }

    if (!result.available) {
      setSignupEmailStatus("error", "This email is already registered.");
      return;
    }

    isSignupEmailEligible = true;
    setSignupEmailStatus("success");
  } catch (error) {
    if (requestId !== signupEmailCheckRequestId) {
      return;
    }
    setSignupEmailStatus("error", "Unable to validate email right now.");
  } finally {
    updateSignupSubmitState();
  }
}

function initSignupEmailValidation() {
  updateSignupSubmitState();

  if (!signupEmailInput) return;

  signupEmailInput.addEventListener("input", () => {
    if (signupEmailCheckDebounceId) {
      clearTimeout(signupEmailCheckDebounceId);
    }

    isSignupEmailEligible = false;
    updateSignupSubmitState();

    signupEmailCheckDebounceId = setTimeout(() => {
      validateSignupEmailAvailability();
    }, 350);
  });

  signupEmailInput.addEventListener("blur", () => {
    if (signupEmailCheckDebounceId) {
      clearTimeout(signupEmailCheckDebounceId);
    }
    validateSignupEmailAvailability();
  });
}

function maskEmail(email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const [localPart, domain] = normalizedEmail.split("@");

  if (!localPart || !domain) {
    return normalizedEmail;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || "*"}*@${domain}`;
  }

  return `${localPart[0]}${"*".repeat(localPart.length - 2)}${localPart[localPart.length - 1]}@${domain}`;
}

function setOtpStatus(type, message) {
  if (!otpStatus) return;

  otpStatus.className = `otp-status ${type || "info"}`;
  otpStatus.textContent = message;
}

function openOtpModal() {
  if (!otpModal) return;

  if (otpEmailDisplay) {
    otpEmailDisplay.textContent =
      pendingMaskedEmail || maskEmail(pendingSignupPayload?.email || "");
  }

  if (otpForm) otpForm.reset();
  setOtpStatus(
    "info",
    `We sent a verification code to ${pendingMaskedEmail || "your email address"}.`,
  );
  otpModal.classList.add("active");

  setTimeout(() => {
    otpCodeInput?.focus();
  }, 50);
}

function closeOtpModal(clearPending = false) {
  if (otpModal) otpModal.classList.remove("active");
  if (otpForm) otpForm.reset();

  if (clearPending) {
    pendingSignupPayload = null;
    pendingMaskedEmail = "";
  }
}

async function requestSignupOtp(signupPayload, isResend = false) {
  if (!canUseApi()) {
    return false;
  }

  if (!signupPayload) {
    await showAppPopup(
      "Signup Error",
      "Signup details are missing. Please fill the form again.",
      { tone: "error" },
    );
    return false;
  }

  pendingSignupPayload = { ...signupPayload };
  pendingMaskedEmail = maskEmail(pendingSignupPayload.email);

  if (!otpModal?.classList.contains("active")) {
    openOtpModal();
  }

  setOtpStatus(
    "info",
    isResend
      ? `Sending a new OTP to ${pendingMaskedEmail}...`
      : `Sending OTP to ${pendingMaskedEmail}...`,
  );

  isSignupOtpRequestInProgress = true;
  updateSignupSubmitState();
  if (resendOtpBtn) resendOtpBtn.disabled = true;
  if (verifyOtpBtn) verifyOtpBtn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/register/request-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(signupPayload),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (parseError) {
      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}. API base: ${API_BASE}`,
        );
      }
      throw parseError;
    }

    if (!data.success) {
      const message = data.message || "Failed to send OTP";
      if (otpModal?.classList.contains("active")) {
        setOtpStatus("error", message);
      } else {
        await showAppPopup("OTP Error", message, { tone: "error" });
      }
      return false;
    }

    pendingMaskedEmail =
      data.maskedEmail || maskEmail(pendingSignupPayload.email);

    openOtpModal();
    setOtpStatus(
      "success",
      isResend
        ? `A new OTP was sent to ${pendingMaskedEmail}.`
        : `OTP sent to ${pendingMaskedEmail}.`,
    );

    if (data.devOtp) {
      setOtpStatus(
        "success",
        `Development OTP: ${data.devOtp}. SMTP is not configured yet.`,
      );
      if (otpCodeInput) {
        otpCodeInput.value = String(data.devOtp);
      }
    }

    return true;
  } catch (error) {
    console.error("OTP request error:", error);
    const message = `Connection error. Check API base: ${API_BASE}`;

    if (otpModal?.classList.contains("active")) {
      setOtpStatus("error", message);
    } else {
      await showAppPopup("Connection Error", message, { tone: "error" });
    }

    return false;
  } finally {
    isSignupOtpRequestInProgress = false;
    updateSignupSubmitState();
    if (resendOtpBtn) resendOtpBtn.disabled = false;
    if (verifyOtpBtn) verifyOtpBtn.disabled = false;
  }
}

// Load Face API
async function loadFaceAPI() {
  try {
    const MODEL_URL =
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ]);

    faceApiLoaded = true;
    console.log("Face guidance models loaded successfully");
  } catch (error) {
    console.error("Error loading Face API:", error);
    try {
      const MODEL_URL =
        "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/models";

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);

      faceApiLoaded = true;
      console.log("Face guidance models loaded successfully (fallback)");
    } catch (fallbackError) {
      console.error("Error loading Face API (fallback):", fallbackError);
    }
  }
}

// Switch between Login and Signup tabs
function switchTab(tab) {
  const tabs = document.querySelectorAll(".tab-btn");
  const forms = document.querySelectorAll(".auth-form");

  tabs.forEach((t) => t.classList.remove("active"));
  forms.forEach((f) => f.classList.remove("active"));

  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
  document.getElementById(`${tab}Form`).classList.add("active");

  // Reset UI based on tab
  const faceLoginSectionEl = document.getElementById("faceLoginMain");
  const loginDividerEl = document.querySelector(".divider");

  if (tab === "signup") {
    // Hide face login section when on signup tab
    if (faceLoginSectionEl) faceLoginSectionEl.style.display = "none";
  } else {
    // Show face login section when on login tab
    if (faceLoginSectionEl) faceLoginSectionEl.style.display = "block";
  }

  // Always show divider on login tab
  if (loginDividerEl) loginDividerEl.style.display = "block";

  // Update footer text
  const footerText = document.getElementById("footerText");
  if (tab === "login") {
    footerText.textContent = "Welcome back! Please login to continue.";
  } else {
    footerText.textContent = "Create an account to get started.";
  }
}

// Toggle password visibility
function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  const btn = input.nextElementSibling;
  const icon = btn.querySelector("i");

  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}

// Password strength indicator
function initPasswordStrength() {
  const passwordInput = document.getElementById("signupPassword");
  const strengthFill = document.getElementById("strengthFill");
  const strengthText = document.getElementById("strengthText");

  if (passwordInput && strengthFill) {
    passwordInput.addEventListener("input", (e) => {
      const password = e.target.value;
      let strength = 0;

      if (password.length >= 8) strength++;
      if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
      if (password.match(/\d/)) strength++;
      if (password.match(/[^a-zA-Z\d]/)) strength++;

      // Update strength bar
      strengthFill.className = "strength-fill";
      if (strength >= 1) strengthFill.classList.add("weak");
      if (strength >= 2) strengthFill.classList.add("medium");
      if (strength >= 3) strengthFill.classList.add("strong");

      // Update text
      if (strengthText) {
        if (strength === 0) strengthText.textContent = "";
        else if (strength === 1) strengthText.textContent = "Weak password";
        else if (strength === 2) strengthText.textContent = "Medium password";
        else if (strength >= 3) strengthText.textContent = "Strong password";
      }
    });
  }
}

// Toggle face setup (in the post-signup modal)
function toggleFaceSetup() {
  setupFaceBtn.disabled = !enableFaceToggle.checked;
}

// Skip face setup
function skipFaceSetup() {
  faceSetupModal.classList.remove("active");
  // Switch to login tab
  switchTab("login");
}

// Start face setup (from post-signup modal)
function startFaceSetup() {
  if (!enableFaceToggle.checked) return;
  currentMode = "signup-setup";
  document.getElementById("faceModalTitle").textContent = "Set Up Face ID";
  document.getElementById("faceModalDesc").textContent =
    "Capture a secure facial profile for future logins";
  faceSetupModal.classList.remove("active");
  faceModal.classList.add("active");
  startCamera();
}

// Toggle face login (in login form)
function toggleFaceLogin() {
  const faceLoginToggleEl = document.getElementById("faceLoginToggle");
  const faceLoginSectionEl = document.getElementById("faceLoginMain");
  const loginDividerEl = document.querySelector(".divider");
  const faceLoginStatusEl = document.getElementById("faceLoginStatus");

  if (faceLoginToggleEl && faceLoginToggleEl.checked) {
    if (faceLoginSectionEl) faceLoginSectionEl.style.display = "block";
    if (loginDividerEl) loginDividerEl.style.display = "none";
  } else {
    if (faceLoginSectionEl) faceLoginSectionEl.style.display = "none";
    if (loginDividerEl) loginDividerEl.style.display = "block";
    if (faceLoginStatusEl) faceLoginStatusEl.textContent = "";
  }
}

// Start Face Login
async function startFaceLogin() {
  currentMode = "login";
  document.getElementById("faceModalTitle").textContent = "Face Login";
  document.getElementById("faceModalDesc").textContent =
    "Align your face in the scan area for secure verification";

  faceModal.classList.add("active");
  await startCamera();
}

// Toggle Manual Login (fallback when face doesn't work)
function toggleManualLogin() {
  const manualFields = document.getElementById("manualLoginFields");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const toggleBtn = document.querySelector(".btn-manual-toggle");
  const divider = document.querySelector(".divider");

  if (manualFields.style.display === "none") {
    manualFields.style.display = "block";
    submitBtn.style.display = "block";
    toggleBtn.classList.add("active");
    divider.style.display = "none";
  } else {
    manualFields.style.display = "none";
    submitBtn.style.display = "none";
    toggleBtn.classList.remove("active");
    divider.style.display = "block";
  }
}

// Start Face Setup from Login page (for users who haven't set up face yet)
function startFaceSetupFromLogin() {
  currentMode = "login-setup";
  document.getElementById("faceModalTitle").textContent = "Set Up Face ID";
  document.getElementById("faceModalDesc").textContent =
    "Capture a secure facial profile for future logins";
  faceModal.classList.add("active");
  startCamera();
}

// Close Face Modal
function closeFaceModal() {
  scanToken += 1;
  faceModal.classList.remove("active");
  stopCamera();
  clearFaceOverlay();
  stableDetectionCount = 0;
  captureInProgress = false;

  // Reset status
  faceStatus.className = "face-status";
  faceStatus.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i><span>Initializing camera...</span>';
}

// Start Camera
async function startCamera() {
  try {
    clearFaceOverlay();
    stableDetectionCount = 0;
    captureInProgress = false;

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: currentMode === "login" ? 640 : 960 },
        height: { ideal: currentMode === "login" ? 480 : 720 },
        facingMode: "user",
      },
    });

    video.srcObject = stream;

    // Wait for video to be fully ready
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play().then(() => {
          resolve();
        });
      };
    });

    syncFaceCanvasSize();
    video.onresize = () => syncFaceCanvasSize();

    setTimeout(() => {
      if (!faceApiLoaded) {
        updateFaceStatus(
          "scanning",
          "Scanner is loading. Keep your face centered in the frame.",
        );
      }
      detectFace();
    }, 80);
  } catch (error) {
    console.error("Error accessing camera:", error);
    updateFaceStatus(
      "error",
      "Unable to access camera. Please grant permission.",
    );
  }
}

// Stop Camera
function stopCamera() {
  if (detectionIntervalId) {
    clearInterval(detectionIntervalId);
    detectionIntervalId = null;
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
}

function syncFaceCanvasSize() {
  if (!faceCanvas || !video.videoWidth || !video.videoHeight) return;

  faceCanvas.width = video.videoWidth;
  faceCanvas.height = video.videoHeight;
}

function clearFaceOverlay() {
  if (!faceCanvas) return;

  const context = faceCanvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
}

function getGuideBounds() {
  if (!faceCanvas) {
    return null;
  }

  const width = faceCanvas.width;
  const height = faceCanvas.height;

  return {
    left: width * 0.18,
    top: height * 0.1,
    right: width * 0.82,
    bottom: height * 0.92,
  };
}

function isFaceInsideGuide(box) {
  const guide = getGuideBounds();
  if (!guide || !box) return false;

  return (
    box.x >= guide.left &&
    box.y >= guide.top &&
    box.x + box.width <= guide.right &&
    box.y + box.height <= guide.bottom
  );
}

function drawFaceOverlay(detection) {
  if (!faceCanvas) return;

  const context = faceCanvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

  if (!detection) return;

  const box = detection.detection.box;
  const landmarks = detection.landmarks?.positions || [];
  const overlayOk = isFaceInsideGuide(box);

  context.save();
  context.translate(faceCanvas.width, 0);
  context.scale(-1, 1);

  context.strokeStyle = overlayOk
    ? "rgba(110, 231, 183, 0.95)"
    : "rgba(248, 113, 113, 0.95)";
  context.fillStyle = overlayOk
    ? "rgba(34, 197, 94, 0.18)"
    : "rgba(239, 68, 68, 0.14)";
  context.lineWidth = Math.max(3, faceCanvas.width * 0.006);

  context.beginPath();
  context.ellipse(
    box.x + box.width / 2,
    box.y + box.height / 2,
    box.width * 0.58,
    box.height * 0.7,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();

  if (landmarks.length > 0) {
    context.fillStyle = "rgba(187, 247, 208, 0.95)";
    for (const point of landmarks) {
      context.beginPath();
      context.arc(point.x, point.y, 1.9, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.restore();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureFrame() {
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", getCaptureQuality());
}

async function collectFaceFrames(activeToken) {
  const frames = [];
  const sampleCount = getFaceSampleCount();

  for (let index = 0; index < sampleCount; index += 1) {
    if (activeToken !== scanToken || !stream) {
      return [];
    }

    updateFaceStatus(
      "scanning",
      `Capturing secure face sample ${index + 1} of ${sampleCount}...`,
    );

    const frame = captureFrame();
    if (!frame) {
      return [];
    }

    frames.push(frame);
    if (index < sampleCount - 1) {
      await wait(80);
    }
  }

  return frames;
}

function persistLoggedInUser(user) {
  sessionStorage.setItem(
    "userData",
    JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      hasFace: Boolean(user.hasFace),
    }),
  );
}

async function submitFaceFrames(frames) {
  if (!canUseApi()) {
    captureInProgress = false;
    stableDetectionCount = 0;
    return;
  }

  const normalizedFrames = Array.isArray(frames)
    ? frames.filter((frame) => typeof frame === "string" && frame.trim())
    : [];

  if (!normalizedFrames.length) {
    updateFaceStatus("error", "Could not capture a clear face sample.");
    return;
  }

  const endpoint = currentMode === "login" ? "face-login" : "save-face";
  const payload =
    currentMode === "login"
      ? { images: normalizedFrames, image: normalizedFrames[0] }
      : {
          email: currentUserEmail,
          images: normalizedFrames,
          image: normalizedFrames[0],
        };

  const pendingMessage =
    currentMode === "login"
      ? "Running secure face verification..."
      : "Analyzing face samples and saving your profile...";

  updateFaceStatus("success", pendingMessage);

  try {
    const requestUrl = `${API_URL}/${endpoint}`;
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (parseError) {
      if (!response.ok) {
        updateFaceStatus(
          "error",
          `Server error ${response.status} at ${requestUrl}`,
        );
        captureInProgress = false;
        stableDetectionCount = 0;
        return;
      }
      throw parseError;
    }

    if (!response.ok || !data.success) {
      updateFaceStatus(
        "error",
        data.message || `Face verification failed at ${requestUrl}.`,
      );
      captureInProgress = false;
      stableDetectionCount = 0;
      return;
    }

    if (currentMode === "login") {
      updateFaceStatus("success", "Face verified. Logging you in...");
      persistLoggedInUser({
        ...data.user,
        hasFace: true,
      });

      setTimeout(() => {
        closeFaceModal();
        window.location.href = "emotion.html";
      }, 180);
      return;
    }

    updateFaceStatus("success", "Face ID enabled successfully!");

    setTimeout(() => {
      closeFaceModal();
      showCelebrationPopup(
        "Face ID Enabled",
        "Face ID has been enabled for your account!",
      );

      if (currentMode === "signup-setup") {
        switchTab("login");
      }

      const faceLoginToggleEl = document.getElementById("faceLoginToggle");
      const faceSetupOptionEl = document.getElementById("faceSetupOption");

      if (faceLoginToggleEl) {
        const container = faceLoginToggleEl.closest(
          ".face-login-toggle-container",
        );
        if (container) container.style.display = "block";
      }

      if (faceSetupOptionEl) {
        faceSetupOptionEl.style.display = "none";
      }
    }, 1200);
  } catch (error) {
    console.error("Face verification error:", error);
    updateFaceStatus(
      "error",
      `Connection error. Verify backend URL in api-config.js (${API_BASE}).`,
    );
    captureInProgress = false;
    stableDetectionCount = 0;
  }
}

// Detect and recognize face
async function detectFace() {
  if (!stream || !video.srcObject) return;

  if (!video.videoWidth || !video.videoHeight) {
    setTimeout(() => detectFace(), 300);
    return;
  }

  syncFaceCanvasSize();
  const activeToken = ++scanToken;
  let attempts = 0;
  const maxAttempts = 90;

  if (detectionIntervalId) {
    clearInterval(detectionIntervalId);
  }

  detectionIntervalId = setInterval(async () => {
    if (activeToken !== scanToken || !stream) {
      clearInterval(detectionIntervalId);
      detectionIntervalId = null;
      return;
    }

    if (captureInProgress) {
      return;
    }

    if (attempts >= maxAttempts) {
      clearInterval(detectionIntervalId);
      detectionIntervalId = null;
      updateFaceStatus(
        "error",
        "No stable face scan detected. Move closer and try again.",
      );
      clearFaceOverlay();
      return;
    }

    try {
      if (!faceApiLoaded) {
        attempts += 1;
        updateFaceStatus(
          "scanning",
          "Preparing scanner guidance. Keep your face centered and hold still.",
        );

        if (attempts >= 12) {
          captureInProgress = true;
          clearInterval(detectionIntervalId);
          detectionIntervalId = null;
          const frames = await collectFaceFrames(activeToken);
          await submitFaceFrames(frames);
        }
        return;
      }

      const detections = await faceapi
        .detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.5,
          }),
        )
        .withFaceLandmarks();

      if (!detections.length) {
        attempts += 1;
        stableDetectionCount = 0;
        clearFaceOverlay();
        updateFaceStatus("scanning", "Looking for a face...");
        return;
      }

      if (detections.length > 1) {
        attempts += 1;
        stableDetectionCount = 0;
        clearFaceOverlay();
        updateFaceStatus(
          "error",
          "Only one face can be in the frame during login.",
        );
        return;
      }

      const detection = detections[0];
      const box = detection.detection.box;
      drawFaceOverlay(detection);

      const faceInsideGuide = isFaceInsideGuide(box);
      const faceAreaRatio =
        (box.width * box.height) / (faceCanvas.width * faceCanvas.height);

      if (!faceInsideGuide) {
        attempts += 1;
        stableDetectionCount = 0;
        updateFaceStatus("scanning", "Center your face inside the guide area.");
        return;
      }

      if (faceAreaRatio < 0.12) {
        attempts += 1;
        stableDetectionCount = 0;
        updateFaceStatus(
          "scanning",
          "Move a little closer so the scanner can capture more detail.",
        );
        return;
      }

      stableDetectionCount += 1;
      const requiredStablePasses = getRequiredStablePasses();
      const lockPercent = Math.min(
        100,
        Math.round((stableDetectionCount / requiredStablePasses) * 100),
      );
      updateFaceStatus(
        "scanning",
        `Face lock ${lockPercent}%. Hold still for secure capture.`,
      );

      if (stableDetectionCount < requiredStablePasses) {
        return;
      }

      captureInProgress = true;
      clearInterval(detectionIntervalId);
      detectionIntervalId = null;
      const frames = await collectFaceFrames(activeToken);
      await submitFaceFrames(frames);
    } catch (error) {
      console.error("Face detection error:", error);
      attempts += 1;
      stableDetectionCount = 0;
    }
  }, FACE_DETECTION_INTERVAL_MS);
}

// Update Face Status
function updateFaceStatus(status, message) {
  faceStatus.className = "face-status " + status;

  let icon = '<i class="fas fa-spinner fa-spin"></i>';

  if (status === "success") {
    icon = '<i class="fas fa-check-circle"></i>';
  } else if (status === "error") {
    icon = '<i class="fas fa-times-circle"></i>';
  } else if (status === "scanning") {
    icon = '<i class="fas fa-search"></i>';
  }

  faceStatus.innerHTML = icon + "<span>" + message + "</span>";
}

// Login form submission
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!canUseApi()) {
    await showAppPopup(
      "Backend Not Configured",
      "Backend API is not configured. Update api-config.js with your backend URL.",
      { tone: "error" },
    );
    return;
  }

  // Check if face login is enabled
  const faceLoginToggleEl = document.getElementById("faceLoginToggle");
  if (faceLoginToggleEl && faceLoginToggleEl.checked) {
    await showAppPopup(
      "Face Login Enabled",
      "Please use Face ID to login, or turn off the toggle to use email/password.",
      { tone: "warning" },
    );
    return;
  }

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (data.success) {
      currentUserEmail = email;

      // Store user data in sessionStorage for dashboard
      sessionStorage.setItem(
        "userData",
        JSON.stringify({
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          hasFace: data.user.hasFace,
        }),
      );

      // Check if user has face registered, show toggle
      const faceLoginToggleEl = document.getElementById("faceLoginToggle");
      const faceSetupOptionEl = document.getElementById("faceSetupOption");

      if (data.user.hasFace) {
        if (faceLoginToggleEl) {
          const container = faceLoginToggleEl.closest(
            ".face-login-toggle-container",
          );
          if (container) container.style.display = "block";
        }
        if (faceSetupOptionEl) faceSetupOptionEl.style.display = "none";
      } else {
        // Show option to set up face for users without face data
        if (faceSetupOptionEl) faceSetupOptionEl.style.display = "block";
        if (faceLoginToggleEl) {
          const container = faceLoginToggleEl.closest(
            ".face-login-toggle-container",
          );
          if (container) container.style.display = "none";
        }
      }

      // Redirect to emotion center
      window.location.href = "emotion.html";
    } else {
      await showAppPopup("Login Failed", data.message || "Login failed.", {
        tone: "error",
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    await showAppPopup(
      "Connection Error",
      `Connection error. Check backend API base: ${API_BASE}`,
      { tone: "error" },
    );
  }
});

// Signup form submission
signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("signupName").value;
  const email = normalizeEmailForValidation(
    document.getElementById("signupEmail").value,
  );
  const password = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById(
    "signupConfirmPassword",
  ).value;

  if (!isSignupEmailEligible) {
    await showAppPopup(
      "Email Required",
      "Please enter a new email address that is not already registered.",
      { tone: "warning" },
    );
    return;
  }

  if (password !== confirmPassword) {
    await showAppPopup("Password Mismatch", "Passwords do not match!", {
      tone: "warning",
    });
    return;
  }

  if (password.length < 6) {
    await showAppPopup(
      "Weak Password",
      "Password must be at least 6 characters.",
      { tone: "warning" },
    );
    return;
  }

  await requestSignupOtp({
    name,
    email,
    password,
  });
});

otpForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!canUseApi()) {
    setOtpStatus(
      "error",
      "Backend API is not configured. Update api-config.js.",
    );
    return;
  }

  if (!pendingSignupPayload?.email) {
    setOtpStatus(
      "error",
      "Signup details expired. Fill the signup form again.",
    );
    return;
  }

  const otp = String(otpCodeInput?.value || "")
    .replace(/\s+/g, "")
    .trim();

  if (!/^\d{6}$/.test(otp)) {
    setOtpStatus("error", "Enter a valid 6-digit OTP.");
    return;
  }

  if (verifyOtpBtn) verifyOtpBtn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/register/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: pendingSignupPayload.email,
        otp,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      setOtpStatus("error", data.message || "OTP verification failed.");
      return;
    }

    currentUserEmail = pendingSignupPayload.email;
    setOtpStatus("success", "Email verified. Account created successfully.");
    closeOtpModal(true);

    faceSetupModal.classList.add("active");
    signupForm?.reset();
    isSignupEmailEligible = false;
    setSignupEmailStatus("", "");
    updateSignupSubmitState();
  } catch (error) {
    console.error("OTP verification error:", error);
    setOtpStatus("error", `Connection error. Check API base: ${API_BASE}`);
  } finally {
    if (verifyOtpBtn) verifyOtpBtn.disabled = false;
  }
});

resendOtpBtn?.addEventListener("click", async () => {
  if (!pendingSignupPayload) {
    setOtpStatus(
      "error",
      "Signup details expired. Fill the signup form again.",
    );
    return;
  }

  await requestSignupOtp(pendingSignupPayload, true);
});

otpCodeInput?.addEventListener("input", () => {
  otpCodeInput.value = otpCodeInput.value.replace(/\D/g, "").slice(0, 6);
});

// Close modal on overlay click
faceModal?.addEventListener("click", (e) => {
  if (e.target === faceModal) {
    closeFaceModal();
  }
});

faceSetupModal?.addEventListener("click", (e) => {
  if (e.target === faceSetupModal) {
    skipFaceSetup();
  }
});

otpModal?.addEventListener("click", (e) => {
  if (e.target === otpModal) {
    closeOtpModal();
  }
});

// Close modal on escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeFaceModal();
    closeOtpModal();
  }
});
