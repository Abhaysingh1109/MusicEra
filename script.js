// MusicEra - Login & Signup with Face Recognition
// Connected to PostgreSQL Backend API

const API_BASE =
  window.MUSICERA_API_BASE ||
  localStorage.getItem("MUSICERA_API_BASE") ||
  (window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : `${window.location.origin}`);
const API_URL = `${API_BASE}/api`;

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
let detectionIntervalId = null;
let scanToken = 0;
let stableDetectionCount = 0;
let captureInProgress = false;
const FACE_LOGIN_SAMPLE_COUNT = 2;
const FACE_ENROLL_SAMPLE_COUNT = 3;
const FACE_LOGIN_STABLE_PASSES = 2;
const FACE_ENROLL_STABLE_PASSES = 3;

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

  // Ensure manual login is hidden by default
  const manualFields = document.getElementById("manualLoginFields");
  const submitBtn = document.getElementById("loginSubmitBtn");
  if (manualFields) manualFields.style.display = "none";
  if (submitBtn) submitBtn.style.display = "none";
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
  const signupSubmitBtn = document.querySelector("#signupForm .btn-submit");

  if (!signupPayload) {
    alert("Signup details are missing. Please fill the form again.");
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

  if (signupSubmitBtn) signupSubmitBtn.disabled = true;
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

    const data = await response.json();

    if (!data.success) {
      const message = data.message || "Failed to send OTP";
      if (otpModal?.classList.contains("active")) {
        setOtpStatus("error", message);
      } else {
        alert(message);
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
    const message =
      "Connection error. Make sure the server is running on port 3000.";

    if (otpModal?.classList.contains("active")) {
      setOtpStatus("error", message);
    } else {
      alert(message);
    }

    return false;
  } finally {
    if (signupSubmitBtn) signupSubmitBtn.disabled = false;
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
        width: { ideal: 960 },
        height: { ideal: 720 },
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
    }, 400);
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
  return canvas.toDataURL("image/jpeg", 0.92);
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
      await wait(180);
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
    const response = await fetch(`${API_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!data.success) {
      updateFaceStatus("error", data.message || "Face verification failed.");
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
      }, 1000);
      return;
    }

    updateFaceStatus("success", "Face ID enabled successfully!");

    setTimeout(() => {
      closeFaceModal();
      alert("Face ID has been enabled for your account!");

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
    updateFaceStatus("error", "Connection error. Please try again.");
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
            inputSize: 320,
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
  }, 180);
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

  // Check if face login is enabled
  const faceLoginToggleEl = document.getElementById("faceLoginToggle");
  if (faceLoginToggleEl && faceLoginToggleEl.checked) {
    alert(
      "Please use Face ID to login, or turn off the toggle to use email/password",
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
      alert(data.message);
    }
  } catch (error) {
    console.error("Login error:", error);
    alert("Connection error. Make sure the server is running on port 3000.");
  }
});

// Signup form submission
document.getElementById("signupForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("signupName").value;
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById(
    "signupConfirmPassword",
  ).value;

  if (password !== confirmPassword) {
    alert("Passwords do not match!");
    return;
  }

  if (password.length < 6) {
    alert("Password must be at least 6 characters.");
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
    document.getElementById("signupForm")?.reset();
  } catch (error) {
    console.error("OTP verification error:", error);
    setOtpStatus(
      "error",
      "Connection error. Make sure the server is running on port 3000.",
    );
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
