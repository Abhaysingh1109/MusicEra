const FACE_AUTH_API_URL = "http://localhost:3000/api";
const FACE_AUTH_MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model",
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/models",
];
const FACE_AUTH_SAMPLE_COUNT = 3;
const FACE_AUTH_STABLE_PASSES = 3;

let faceAuthMenuApiLoaded = false;
let faceAuthMenuStream = null;
let faceAuthMenuDetectionInterval = null;
let faceAuthMenuScanToken = 0;
let faceAuthMenuStableDetectionCount = 0;
let faceAuthMenuCaptureInProgress = false;
let faceAuthMenuSaving = false;

function getStoredUserData() {
  try {
    return JSON.parse(sessionStorage.getItem("userData") || "{}");
  } catch (error) {
    return {};
  }
}

function saveStoredUserData(userData) {
  sessionStorage.setItem("userData", JSON.stringify(userData));
}

function waitForFaceAuth(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function ensureFaceAuthApiLoaded() {
  if (faceAuthMenuApiLoaded) {
    return;
  }

  if (!window.faceapi) {
    throw new Error("Face scanner library is not available.");
  }

  let lastError = null;

  for (const modelUrl of FACE_AUTH_MODEL_URLS) {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
      ]);

      faceAuthMenuApiLoaded = true;
      return;
    } catch (error) {
      lastError = error;
      console.error(`Face auth model load failed for ${modelUrl}:`, error);
    }
  }

  throw lastError || new Error("Could not load face scanner models.");
}

function updateFaceAuthStatus(status, message) {
  const statusEl = document.getElementById("faceAuthStatus");
  if (!statusEl) return;

  statusEl.className = `face-status${status ? ` ${status}` : ""}`;

  let icon = '<i class="fas fa-spinner fa-spin"></i>';
  if (status === "success") {
    icon = '<i class="fas fa-check-circle"></i>';
  } else if (status === "error") {
    icon = '<i class="fas fa-times-circle"></i>';
  } else if (status === "scanning") {
    icon = '<i class="fas fa-search"></i>';
  }

  statusEl.innerHTML = `${icon}<span>${message}</span>`;
}

function ensureFaceAuthModal() {
  let modal = document.getElementById("faceAuthMenuModal");
  if (modal) {
    return modal;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="modal-overlay" id="faceAuthMenuModal">
      <div class="face-modal-container">
        <button class="modal-close" type="button" id="faceAuthCloseBtn">
          <i class="fas fa-times"></i>
        </button>

        <div class="face-modal-content">
          <div class="face-icon">
            <i class="fas fa-face-smile"></i>
          </div>
          <h3 id="faceAuthModalTitle">Set Up Face ID</h3>
          <p id="faceAuthModalDesc">Capture a secure facial profile for future logins</p>

          <div class="camera-container">
            <video id="faceAuthVideo" autoplay playsinline></video>
            <canvas id="faceAuthCanvas" class="face-canvas"></canvas>
            <div class="face-overlay">
              <div class="face-frame">
                <div class="face-frame-core"></div>
              </div>
              <div class="scan-corners">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
            <div class="scan-grid"></div>
            <div class="scan-line"></div>
          </div>

          <div class="face-status" id="faceAuthStatus">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Initializing camera...</span>
          </div>

          <button type="button" class="btn-cancel" id="faceAuthCancelBtn">Cancel</button>
        </div>
      </div>
    </div>
  `;

  modal = wrapper.firstElementChild;
  document.body.appendChild(modal);
  return modal;
}

function ensureFaceAuthSuccessModal() {
  let modal = document.getElementById("faceAuthSuccessModal");
  if (modal) {
    return modal;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="face-auth-success-modal" id="faceAuthSuccessModal">
      <div class="face-auth-success-card">
        <div class="face-auth-success-icon">
          <i class="fas fa-check"></i>
        </div>
        <h3>Face ID Enabled</h3>
        <p>You have successfully enabled Face ID for your account.</p>
        <button type="button" class="face-auth-success-btn" id="faceAuthSuccessBtn">
          OK
        </button>
      </div>
    </div>
  `;

  modal = wrapper.firstElementChild;
  document.body.appendChild(modal);
  return modal;
}

function getFaceAuthElements() {
  const modal = document.getElementById("faceAuthMenuModal");

  return {
    modal,
    video: document.getElementById("faceAuthVideo"),
    canvas: document.getElementById("faceAuthCanvas"),
    closeBtn: document.getElementById("faceAuthCloseBtn"),
    cancelBtn: document.getElementById("faceAuthCancelBtn"),
  };
}

function openFaceAuthSuccessModal() {
  const modal = ensureFaceAuthSuccessModal();
  const button = document.getElementById("faceAuthSuccessBtn");

  modal.classList.add("active");

  const closeModal = () => {
    modal.classList.remove("active");
  };

  button.onclick = closeModal;
  modal.onclick = (event) => {
    if (event.target === modal) {
      closeModal();
    }
  };
}

function syncFaceAuthCanvasSize() {
  const { video, canvas } = getFaceAuthElements();
  if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function clearFaceAuthOverlay() {
  const { canvas } = getFaceAuthElements();
  if (!canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function getFaceAuthGuideBounds() {
  const { canvas } = getFaceAuthElements();
  if (!canvas) return null;

  return {
    left: canvas.width * 0.18,
    top: canvas.height * 0.1,
    right: canvas.width * 0.82,
    bottom: canvas.height * 0.92,
  };
}

function isFaceAuthInsideGuide(box) {
  const guide = getFaceAuthGuideBounds();
  if (!guide || !box) return false;

  return (
    box.x >= guide.left &&
    box.y >= guide.top &&
    box.x + box.width <= guide.right &&
    box.y + box.height <= guide.bottom
  );
}

function drawFaceAuthOverlay(detection) {
  const { canvas } = getFaceAuthElements();
  if (!canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!detection) return;

  const box = detection.detection.box;
  const landmarks = detection.landmarks?.positions || [];
  const overlayOk = isFaceAuthInsideGuide(box);

  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);

  context.strokeStyle = overlayOk
    ? "rgba(110, 231, 183, 0.95)"
    : "rgba(248, 113, 113, 0.95)";
  context.fillStyle = overlayOk
    ? "rgba(34, 197, 94, 0.18)"
    : "rgba(239, 68, 68, 0.14)";
  context.lineWidth = Math.max(3, canvas.width * 0.006);

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

  for (const point of landmarks) {
    context.beginPath();
    context.arc(point.x, point.y, 1.9, 0, Math.PI * 2);
    context.fillStyle = "rgba(187, 247, 208, 0.95)";
    context.fill();
  }

  context.restore();
}

function captureFaceAuthFrame() {
  const { video } = getFaceAuthElements();
  if (!video?.videoWidth || !video?.videoHeight) {
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

async function stopFaceAuthCamera() {
  if (faceAuthMenuDetectionInterval) {
    clearInterval(faceAuthMenuDetectionInterval);
    faceAuthMenuDetectionInterval = null;
  }

  if (faceAuthMenuStream) {
    faceAuthMenuStream.getTracks().forEach((track) => track.stop());
    faceAuthMenuStream = null;
  }

  const { video } = getFaceAuthElements();
  if (video) {
    video.srcObject = null;
  }
}

function closeFaceAuthModal(force = false) {
  if (faceAuthMenuSaving && !force) {
    return;
  }

  faceAuthMenuScanToken += 1;
  faceAuthMenuStableDetectionCount = 0;
  faceAuthMenuCaptureInProgress = false;

  const { modal } = getFaceAuthElements();
  if (modal) {
    modal.classList.remove("active");
  }

  stopFaceAuthCamera();
  clearFaceAuthOverlay();
  updateFaceAuthStatus("", "Initializing camera...");
}

async function collectFaceAuthFrames(activeToken) {
  const frames = [];

  for (let index = 0; index < FACE_AUTH_SAMPLE_COUNT; index += 1) {
    if (activeToken !== faceAuthMenuScanToken || !faceAuthMenuStream) {
      return [];
    }

    updateFaceAuthStatus(
      "scanning",
      `Capturing secure face sample ${index + 1} of ${FACE_AUTH_SAMPLE_COUNT}...`,
    );

    const frame = captureFaceAuthFrame();
    if (!frame) {
      return [];
    }

    frames.push(frame);
    if (index < FACE_AUTH_SAMPLE_COUNT - 1) {
      await waitForFaceAuth(180);
    }
  }

  return frames;
}

async function submitFaceAuthFrames(frames, setupButton) {
  const userData = getStoredUserData();
  if (!userData?.email) {
    updateFaceAuthStatus("error", "User session is missing. Please log in again.");
    faceAuthMenuCaptureInProgress = false;
    faceAuthMenuStableDetectionCount = 0;
    return;
  }

  updateFaceAuthStatus(
    "success",
    "Analyzing face samples and saving your profile...",
  );
  faceAuthMenuSaving = true;

  try {
    const response = await fetch(`${FACE_AUTH_API_URL}/save-face`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userData.email,
        images: frames,
        image: frames[0],
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || "Could not save Face ID.");
    }

    saveStoredUserData({
      ...userData,
      hasFace: true,
    });

    const faceBadge = document.getElementById("navbarFaceBadge");
    if (faceBadge) {
      faceBadge.style.display = "inline-flex";
    }
    if (setupButton) {
      setupButton.remove();
    }

    updateFaceAuthStatus("success", "Face ID enabled successfully!");
    await waitForFaceAuth(1200);
    closeFaceAuthModal(true);
    openFaceAuthSuccessModal();
  } catch (error) {
    console.error("Face auth save error:", error);
    updateFaceAuthStatus(
      "error",
      error.message || "Could not save Face ID. Please try again.",
    );
    faceAuthMenuCaptureInProgress = false;
    faceAuthMenuStableDetectionCount = 0;
  } finally {
    faceAuthMenuSaving = false;
  }
}

async function detectFaceAuthFace(setupButton) {
  const { video } = getFaceAuthElements();
  if (!faceAuthMenuStream || !video?.srcObject) return;

  if (!video.videoWidth || !video.videoHeight) {
    setTimeout(() => detectFaceAuthFace(setupButton), 300);
    return;
  }

  syncFaceAuthCanvasSize();
  const activeToken = ++faceAuthMenuScanToken;
  let attempts = 0;
  const maxAttempts = 90;

  if (faceAuthMenuDetectionInterval) {
    clearInterval(faceAuthMenuDetectionInterval);
  }

  faceAuthMenuDetectionInterval = setInterval(async () => {
    if (activeToken !== faceAuthMenuScanToken || !faceAuthMenuStream) {
      clearInterval(faceAuthMenuDetectionInterval);
      faceAuthMenuDetectionInterval = null;
      return;
    }

    if (faceAuthMenuCaptureInProgress || faceAuthMenuSaving) {
      return;
    }

    if (attempts >= maxAttempts) {
      clearInterval(faceAuthMenuDetectionInterval);
      faceAuthMenuDetectionInterval = null;
      updateFaceAuthStatus(
        "error",
        "Face scan timed out. Keep your face centered and try again.",
      );
      return;
    }

    attempts += 1;

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      drawFaceAuthOverlay(detection);

      if (!detection) {
        faceAuthMenuStableDetectionCount = 0;
        updateFaceAuthStatus(
          "scanning",
          "No face detected. Move into the frame and look at the camera.",
        );
        return;
      }

      const box = detection.detection?.box;
      if (!isFaceAuthInsideGuide(box)) {
        faceAuthMenuStableDetectionCount = 0;
        updateFaceAuthStatus(
          "scanning",
          "Center your face inside the guide for a secure scan.",
        );
        return;
      }

      faceAuthMenuStableDetectionCount += 1;

      if (faceAuthMenuStableDetectionCount < FACE_AUTH_STABLE_PASSES) {
        updateFaceAuthStatus(
          "scanning",
          "Face detected. Hold still while we confirm alignment.",
        );
        return;
      }

      faceAuthMenuCaptureInProgress = true;
      faceAuthMenuStableDetectionCount = 0;
      clearInterval(faceAuthMenuDetectionInterval);
      faceAuthMenuDetectionInterval = null;

      const frames = await collectFaceAuthFrames(activeToken);
      if (!frames.length) {
        updateFaceAuthStatus("error", "Could not capture a clear face sample.");
        faceAuthMenuCaptureInProgress = false;
        return;
      }

      await submitFaceAuthFrames(frames, setupButton);
    } catch (error) {
      console.error("Face auth detection error:", error);
      faceAuthMenuStableDetectionCount = 0;
      updateFaceAuthStatus(
        "error",
        "Face scan failed. Please try again in better lighting.",
      );
    }
  }, 180);
}

async function openFaceAuthModal(setupButton) {
  const { modal, video } = getFaceAuthElements();
  if (!modal || !video) return;

  modal.classList.add("active");
  clearFaceAuthOverlay();
  faceAuthMenuStableDetectionCount = 0;
  faceAuthMenuCaptureInProgress = false;
  updateFaceAuthStatus("scanning", "Initializing secure face scanner...");

  try {
    await ensureFaceAuthApiLoaded();

    faceAuthMenuStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        facingMode: "user",
      },
      audio: false,
    });

    video.srcObject = faceAuthMenuStream;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve);
      };
    });

    syncFaceAuthCanvasSize();
    video.onresize = () => syncFaceAuthCanvasSize();

    updateFaceAuthStatus(
      "scanning",
      "Keep your face centered in the guide while the scanner locks in.",
    );

    setTimeout(() => {
      detectFaceAuthFace(setupButton);
    }, 400);
  } catch (error) {
    console.error("Face auth modal open error:", error);
    updateFaceAuthStatus(
      "error",
      error.message || "Unable to access camera. Please grant permission.",
    );
  }
}

function initFaceAuthMenu() {
  const userData = getStoredUserData();
  if (!userData?.name || userData?.hasFace) {
    return;
  }

  const dropdown = document.getElementById("navbarDropdown");
  const logoutButton = dropdown?.querySelector(".navbar-logout");

  if (!dropdown || !logoutButton || document.getElementById("navbarFaceSetupBtn")) {
    return;
  }

  const setupButton = document.createElement("button");
  setupButton.type = "button";
  setupButton.id = "navbarFaceSetupBtn";
  setupButton.className = "navbar-face-setup";
  setupButton.innerHTML =
    '<i class="fas fa-face-smile"></i><span>Enable Face ID</span>';
  dropdown.insertBefore(setupButton, logoutButton);

  ensureFaceAuthModal();
  ensureFaceAuthSuccessModal();

  const { modal, closeBtn, cancelBtn } = getFaceAuthElements();

  setupButton.addEventListener("click", () => {
    openFaceAuthModal(setupButton);
  });

  closeBtn?.addEventListener("click", closeFaceAuthModal);
  cancelBtn?.addEventListener("click", closeFaceAuthModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeFaceAuthModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", initFaceAuthMenu);
