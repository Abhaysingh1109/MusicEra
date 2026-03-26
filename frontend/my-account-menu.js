(function initMyAccountMenu() {
  const userDataRaw = sessionStorage.getItem("userData");
  if (!userDataRaw) {
    return;
  }

  let sessionUser = {};
  try {
    sessionUser = JSON.parse(userDataRaw) || {};
  } catch (error) {
    sessionUser = {};
  }

  const modal = document.getElementById("myAccountModal");
  const closeBtn = document.getElementById("myAccountCloseBtn");
  const statusEl = document.getElementById("myAccountStatus");
  const detailsEl = document.getElementById("myAccountDetails");
  const deleteBtn = document.getElementById("deleteAccountBtn");
  const navbarAvatarEl = document.querySelector("#navbarDropdown .user-avatar");
  const navbarRootEl = document.getElementById("musicera-navbar");
  const profilePhotoInput = document.createElement("input");
  profilePhotoInput.type = "file";
  profilePhotoInput.accept = "image/png,image/jpeg,image/webp,image/gif";
  profilePhotoInput.style.display = "none";
  profilePhotoInput.id = "myAccountProfilePhotoInput";
  (navbarRootEl || document.body).appendChild(profilePhotoInput);

  // Prevent outside-click handlers from treating file-input click as an external click.
  profilePhotoInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  profilePhotoInput.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  if (!modal || !statusEl || !detailsEl || !deleteBtn) {
    return;
  }

  const localHostClient =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const fallbackBase = localHostClient ? "http://localhost:3001" : "";
  const apiBase = String(
    window.MUSICERA_API_BASE ||
      localStorage.getItem("MUSICERA_API_BASE") ||
      fallbackBase,
  )
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  const apiUrl = `${apiBase}/api`;
  const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
  const MAX_RAW_PROFILE_PHOTO_BYTES = 15 * 1024 * 1024;

  function getUserIdentityPayload() {
    return {
      userId: sessionUser.id || null,
      email: String(sessionUser.email || "").trim() || null,
    };
  }

  function formatBytes(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "0 B";
    }

    if (numeric < 1024) {
      return `${numeric} B`;
    }

    const kb = numeric / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    return `${(kb / 1024).toFixed(1)} MB`;
  }

  function isLikelyDataImage(value) {
    return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(
      String(value || ""),
    );
  }

  function normalizeProfilePhotoDataUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    return raw.replace(/^data:image\/jpg;/i, "data:image/jpeg;");
  }

  function getDataImageMime(value) {
    const matches = String(value || "")
      .trim()
      .match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/i);
    return matches ? String(matches[1]).toLowerCase() : "";
  }

  function updateSessionUserPhoto(photoDataUrl) {
    const normalizedPhoto = normalizeProfilePhotoDataUrl(photoDataUrl);
    sessionUser = {
      ...sessionUser,
      profilePhoto: isLikelyDataImage(normalizedPhoto) ? normalizedPhoto : null,
    };

    try {
      sessionStorage.setItem("userData", JSON.stringify(sessionUser));
    } catch (error) {
      console.warn(
        "Could not persist profile photo to session storage:",
        error,
      );
    }
  }

  function renderNavbarAvatar(photoDataUrl) {
    if (!navbarAvatarEl) {
      return;
    }

    const existingImage = navbarAvatarEl.querySelector("img.user-avatar-image");
    if (existingImage) {
      existingImage.remove();
    }

    const existingIcon = navbarAvatarEl.querySelector("i");
    if (existingIcon) {
      existingIcon.remove();
    }

    const normalizedPhoto = normalizeProfilePhotoDataUrl(photoDataUrl);
    const hasPhoto = isLikelyDataImage(normalizedPhoto);
    navbarAvatarEl.classList.toggle("has-photo", hasPhoto);

    if (hasPhoto) {
      const img = document.createElement("img");
      img.className = "user-avatar-image";
      img.alt = "Profile photo";
      img.src = normalizedPhoto;
      navbarAvatarEl.appendChild(img);
      return;
    }

    const icon = document.createElement("i");
    icon.className = "fas fa-user";
    navbarAvatarEl.appendChild(icon);
  }

  function closeNavbarMenu() {
    const dropdown = document.getElementById("navbarDropdown");
    const hamburger = document.getElementById("navbarToggle");

    if (dropdown) {
      dropdown.classList.remove("active");
    }
    if (hamburger) {
      hamburger.classList.remove("active");
    }

    document.body.classList.remove("navbar-menu-open");
  }

  function setStatus(type, message) {
    statusEl.className = `my-account-status ${type}`;
    statusEl.textContent = message;
  }

  async function showInlineOrPopupStatus(type, message) {
    setStatus(type, message);

    if (modal.classList.contains("active") || type === "loading") {
      return;
    }

    await showCustomPopup({
      title: type === "success" ? "Success" : "Notice",
      message,
      showCancel: false,
      confirmText: "OK",
    });
  }

  function readImageAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read selected image"));
      reader.readAsDataURL(file);
    });
  }

  function ensureProfileCropStyles() {
    if (document.getElementById("musiceraCropStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "musiceraCropStyles";
    style.textContent = `
      .musicera-crop-overlay {
        position: fixed;
        inset: 0;
        z-index: 6000;
        background: rgba(3, 8, 20, 0.86);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }

      .musicera-crop-panel {
        width: min(520px, 100%);
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: linear-gradient(180deg, rgba(14, 20, 44, 0.98), rgba(8, 12, 30, 0.98));
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
        padding: 16px;
        color: #fff;
      }

      .musicera-crop-title {
        margin: 0;
        font-size: 1.05rem;
      }

      .musicera-crop-note {
        margin: 8px 0 12px;
        color: rgba(255, 255, 255, 0.76);
        font-size: 0.92rem;
      }

      .musicera-crop-canvas {
        width: 100%;
        max-width: 360px;
        aspect-ratio: 1 / 1;
        display: block;
        margin: 0 auto;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.04);
        cursor: grab;
        touch-action: none;
      }

      .musicera-crop-canvas.dragging {
        cursor: grabbing;
      }

      .musicera-crop-zoom {
        margin-top: 12px;
      }

      .musicera-crop-zoom input {
        width: 100%;
      }

      .musicera-crop-actions {
        margin-top: 14px;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
    `;

    document.head.appendChild(style);
  }

  function loadImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to load selected image"));
      image.src = dataUrl;
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function estimateDataUrlBytes(dataUrl) {
    const base64 = String(dataUrl || "").split(",")[1] || "";
    return Math.floor((base64.length * 3) / 4);
  }

  async function showProfileCropper(sourceDataUrl) {
    ensureProfileCropStyles();
    const image = await loadImageElement(sourceDataUrl);

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "musicera-crop-overlay";

      const panel = document.createElement("div");
      panel.className = "musicera-crop-panel";

      const title = document.createElement("h4");
      title.className = "musicera-crop-title";
      title.textContent = "Crop Profile Photo";

      const note = document.createElement("p");
      note.className = "musicera-crop-note";
      note.textContent =
        "Drag image to position your face. Use zoom for better framing.";

      const canvas = document.createElement("canvas");
      canvas.className = "musicera-crop-canvas";
      canvas.width = 512;
      canvas.height = 512;

      const zoomWrap = document.createElement("div");
      zoomWrap.className = "musicera-crop-zoom";
      zoomWrap.innerHTML = `<input type="range" min="100" max="300" step="1" value="100" aria-label="Zoom photo" />`;
      const zoomInput = zoomWrap.querySelector("input");

      const actions = document.createElement("div");
      actions.className = "musicera-crop-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "musicera-popup-btn cancel";
      cancelBtn.textContent = "Cancel";

      const useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.className = "musicera-popup-btn confirm";
      useBtn.textContent = "Use Photo";

      actions.appendChild(cancelBtn);
      actions.appendChild(useBtn);

      panel.appendChild(title);
      panel.appendChild(note);
      panel.appendChild(canvas);
      panel.appendChild(zoomWrap);
      panel.appendChild(actions);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      const context = canvas.getContext("2d");
      const baseScale = Math.max(
        canvas.width / image.width,
        canvas.height / image.height,
      );
      let zoom = 1;
      let offsetX = (canvas.width - image.width * baseScale) / 2;
      let offsetY = (canvas.height - image.height * baseScale) / 2;
      let dragging = false;
      let dragStartX = 0;
      let dragStartY = 0;

      const draw = () => {
        const drawScale = baseScale * zoom;
        const drawWidth = image.width * drawScale;
        const drawHeight = image.height * drawScale;
        const minX = canvas.width - drawWidth;
        const minY = canvas.height - drawHeight;

        offsetX = clamp(offsetX, minX, 0);
        offsetY = clamp(offsetY, minY, 0);

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
      };

      const onPointerMove = (event) => {
        if (!dragging) {
          return;
        }

        const nextX = event.clientX;
        const nextY = event.clientY;
        offsetX += nextX - dragStartX;
        offsetY += nextY - dragStartY;
        dragStartX = nextX;
        dragStartY = nextY;
        draw();
      };

      const cleanup = (value) => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
        resolve(value);
      };

      const onPointerUp = () => {
        dragging = false;
        canvas.classList.remove("dragging");
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          cleanup("");
        }
      };

      canvas.addEventListener("pointerdown", (event) => {
        dragging = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        canvas.classList.add("dragging");
      });

      zoomInput.addEventListener("input", () => {
        zoom = Number(zoomInput.value || 100) / 100;
        draw();
      });

      cancelBtn.addEventListener("click", () => cleanup(""));

      useBtn.addEventListener("click", () => {
        const jpegData = canvas.toDataURL("image/jpeg", 0.9);
        cleanup(jpegData);
      });

      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          cleanup("");
        }
      });

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("keydown", onKeyDown);
      draw();
      useBtn.focus();
    });
  }

  function parseServerTimestamp(value) {
    if (!value) {
      return null;
    }

    const raw = String(value).trim();
    if (!raw) {
      return null;
    }

    // If backend value has no timezone marker, treat it as UTC.
    const hasTimezone = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(raw);
    const normalized = hasTimezone ? raw : `${raw.replace(/\s+/g, "T")}Z`;
    const dt = new Date(normalized);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function formatDate(isoValue) {
    const dt = parseServerTimestamp(isoValue);
    if (!dt) {
      return "Not available";
    }

    return dt.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toListLabel(values) {
    if (!Array.isArray(values) || !values.length) {
      return "Not set";
    }

    return values
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  function ensureCustomPopupStyles() {
    if (document.getElementById("musiceraCustomPopupStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "musiceraCustomPopupStyles";
    style.textContent = `
      .musicera-popup-overlay {
        position: fixed;
        inset: 0;
        z-index: 5000;
        background: rgba(4, 8, 20, 0.78);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .musicera-popup {
        width: min(460px, 100%);
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: linear-gradient(180deg, rgba(14, 20, 44, 0.98), rgba(8, 12, 30, 0.98));
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
        padding: 18px;
      }

      .musicera-popup h4 {
        margin: 0 0 10px;
        color: #fff;
        font-size: 1.1rem;
      }

      .musicera-popup p {
        margin: 0;
        color: rgba(255, 255, 255, 0.8);
        line-height: 1.45;
      }

      .musicera-popup input {
        width: 100%;
        margin-top: 14px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.05);
        color: #fff;
        outline: none;
      }

      .musicera-popup input:focus {
        border-color: rgba(59, 130, 246, 0.8);
      }

      .musicera-popup-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }

      .musicera-popup-btn {
        border: 0;
        border-radius: 10px;
        padding: 9px 14px;
        font-weight: 600;
        cursor: pointer;
      }

      .musicera-popup-btn.cancel {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }

      .musicera-popup-btn.confirm {
        background: rgba(59, 130, 246, 0.9);
        color: #fff;
      }

      .musicera-popup-btn.danger {
        background: rgba(239, 68, 68, 0.9);
        color: #fff;
      }
    `;

    document.head.appendChild(style);
  }

  function showCustomPopup(options) {
    ensureCustomPopupStyles();

    const config = {
      title: "Confirm",
      message: "",
      showCancel: true,
      confirmText: "Confirm",
      cancelText: "Cancel",
      destructive: false,
      requireInput: false,
      inputPlaceholder: "",
      ...options,
    };

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "musicera-popup-overlay";

      const popup = document.createElement("div");
      popup.className = "musicera-popup";

      const title = document.createElement("h4");
      title.textContent = config.title;

      const message = document.createElement("p");
      message.textContent = config.message;

      popup.appendChild(title);
      popup.appendChild(message);

      let input = null;
      if (config.requireInput) {
        input = document.createElement("input");
        input.type = "text";
        input.placeholder = config.inputPlaceholder || "Type here";
        input.autocomplete = "off";
        popup.appendChild(input);
      }

      const actions = document.createElement("div");
      actions.className = "musicera-popup-actions";

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = `musicera-popup-btn confirm${
        config.destructive ? " danger" : ""
      }`;
      confirmBtn.textContent = config.confirmText;

      const close = (confirmed) => {
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
        resolve({
          confirmed,
          value: input ? String(input.value || "") : "",
        });
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          close(false);
        }

        if (event.key === "Enter") {
          event.preventDefault();
          close(true);
        }
      };

      confirmBtn.addEventListener("click", () => close(true));

      if (config.showCancel) {
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "musicera-popup-btn cancel";
        cancelBtn.textContent = config.cancelText;
        cancelBtn.addEventListener("click", () => close(false));
        actions.appendChild(cancelBtn);
      }

      actions.appendChild(confirmBtn);
      popup.appendChild(actions);
      overlay.appendChild(popup);
      document.body.appendChild(overlay);
      document.addEventListener("keydown", onKeyDown);

      if (input) {
        input.focus();
      } else {
        confirmBtn.focus();
      }
    });
  }

  async function parseApiResponse(response) {
    const contentType = String(response.headers.get("content-type") || "");

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const bodyText = await response.text();
    return {
      success: false,
      message: `Unexpected response from server (HTTP ${response.status}). ${bodyText
        .replace(/\s+/g, " ")
        .slice(0, 120)}`,
    };
  }

  async function syncProfilePhotoFromServer() {
    const params = new URLSearchParams();
    if (sessionUser.id) {
      params.set("userId", String(sessionUser.id));
    }
    if (sessionUser.email) {
      params.set("email", String(sessionUser.email));
    }

    if (!params.has("userId") && !params.has("email")) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/account?${params.toString()}`);
      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        return;
      }

      const serverPhoto = normalizeProfilePhotoDataUrl(
        result?.account?.profilePhoto,
      );
      updateSessionUserPhoto(serverPhoto || null);
      renderNavbarAvatar(serverPhoto || null);
    } catch (error) {
      console.warn("Profile photo sync skipped:", error);
    }
  }

  async function loadAccountDetails() {
    const params = new URLSearchParams();
    if (sessionUser.id) {
      params.set("userId", String(sessionUser.id));
    }
    if (sessionUser.email) {
      params.set("email", String(sessionUser.email));
    }

    if (!params.has("userId") && !params.has("email")) {
      setStatus("error", "Session expired. Please login again.");
      return;
    }

    setStatus("loading", "Loading your account details...");
    detailsEl.innerHTML = "";

    const response = await fetch(`${apiUrl}/account?${params.toString()}`);
    const result = await parseApiResponse(response);

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load account details");
    }

    const account = result.account || {};
    const normalizedAccountPhoto = normalizeProfilePhotoDataUrl(
      account.profilePhoto,
    );

    sessionUser = {
      ...sessionUser,
      id: account.id || sessionUser.id,
      name: account.name || sessionUser.name,
      email: account.email || sessionUser.email,
      hasFace: Boolean(account.hasFace),
      profilePhoto: normalizedAccountPhoto || null,
    };

    try {
      sessionStorage.setItem("userData", JSON.stringify(sessionUser));
    } catch (error) {
      console.warn(
        "Could not persist account details to session storage:",
        error,
      );
    }
    renderNavbarAvatar(sessionUser.profilePhoto);

    detailsEl.innerHTML = `
      <div class="my-account-row my-account-row-photo">
        <span>Profile Photo</span>
        <strong>
          <div class="my-account-photo-actions">
            ${
              normalizedAccountPhoto
                ? `<img src="${escapeHtml(normalizedAccountPhoto)}" alt="Profile photo" class="my-account-photo-preview" />`
                : `<div class="my-account-photo-placeholder"><i class="fas fa-user"></i></div>`
            }
            <button type="button" class="navbar-account-btn" id="myAccountUploadPhotoBtn">
              <i class="fas fa-camera"></i>
              ${normalizedAccountPhoto ? "Change Photo" : "Upload Photo"}
            </button>
            ${
              normalizedAccountPhoto
                ? `<button type="button" class="navbar-logout" id="myAccountDeletePhotoBtn"><i class="fas fa-trash"></i> Remove Photo</button>`
                : ""
            }
          </div>
        </strong>
      </div>
      <div class="my-account-row"><span>Name</span><strong>${escapeHtml(account.name || "-")}</strong></div>
      <div class="my-account-row"><span>Email</span><strong>${escapeHtml(account.email || "-")}</strong></div>
      <div class="my-account-row"><span>User ID</span><strong>${escapeHtml(account.id || "-")}</strong></div>
      <div class="my-account-row"><span>Face ID</span><strong>${account.hasFace ? "Enabled" : "Not enabled"}</strong></div>
      <div class="my-account-row"><span>Created At</span><strong>${escapeHtml(formatDate(account.createdAt))}</strong></div>
    `;

    const uploadBtn = document.getElementById("myAccountUploadPhotoBtn");
    const deletePhotoBtn = document.getElementById("myAccountDeletePhotoBtn");

    if (uploadBtn) {
      uploadBtn.addEventListener("click", () => profilePhotoInput.click());
    }

    if (deletePhotoBtn) {
      deletePhotoBtn.addEventListener("click", handleProfilePhotoDelete);
    }

    setStatus("success", "Account details loaded.");
  }

  async function handleProfilePhotoUpload(file) {
    if (!file) {
      return;
    }

    if (file.size > MAX_RAW_PROFILE_PHOTO_BYTES) {
      await showInlineOrPopupStatus(
        "error",
        `Selected image is too large (${formatBytes(file.size)}). Please use an image up to ${formatBytes(MAX_RAW_PROFILE_PHOTO_BYTES)}.`,
      );
      return;
    }

    setStatus("loading", "Preparing photo crop...");

    try {
      const imageRaw = await readImageAsDataUrl(file);
      const image = normalizeProfilePhotoDataUrl(imageRaw);
      const mime = getDataImageMime(image);
      const supportedMimes = new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ]);

      if (!supportedMimes.has(mime)) {
        await showInlineOrPopupStatus(
          "error",
          "Please use JPG, PNG, WEBP, or GIF image. Some camera formats are not supported.",
        );
        return;
      }

      const croppedImage = await showProfileCropper(image);

      if (!croppedImage) {
        setStatus("success", "Photo upload canceled.");
        return;
      }

      if (estimateDataUrlBytes(croppedImage) > MAX_PROFILE_PHOTO_BYTES) {
        await showInlineOrPopupStatus(
          "error",
          `Cropped image is too large. Please pick another image. Max allowed size is ${formatBytes(MAX_PROFILE_PHOTO_BYTES)}.`,
        );
        return;
      }

      setStatus("loading", "Uploading profile photo...");
      const identity = getUserIdentityPayload();
      const response = await fetch(`${apiUrl}/account/profile-photo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...identity,
          image: croppedImage,
        }),
      });

      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to upload profile photo");
      }

      updateSessionUserPhoto(result.profilePhoto || croppedImage);
      renderNavbarAvatar(sessionUser.profilePhoto);
      await showInlineOrPopupStatus(
        "success",
        "Profile photo saved successfully.",
      );
      await loadAccountDetails();
    } catch (error) {
      console.error("Profile photo upload error:", error);
      await showInlineOrPopupStatus(
        "error",
        error.message || "Failed to upload profile photo.",
      );
    }
  }

  async function handleProfilePhotoDelete() {
    const confirmation = await showCustomPopup({
      title: "Remove Profile Photo",
      message:
        "Your profile photo will be removed and replaced by default icon.",
      confirmText: "Remove",
      cancelText: "Cancel",
      destructive: true,
    });

    if (!confirmation.confirmed) {
      return;
    }

    setStatus("loading", "Removing profile photo...");

    try {
      const identity = getUserIdentityPayload();
      const response = await fetch(`${apiUrl}/account/profile-photo`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(identity),
      });

      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to remove profile photo");
      }

      updateSessionUserPhoto(null);
      renderNavbarAvatar(null);
      setStatus("success", "Profile photo removed.");
      await loadAccountDetails();
    } catch (error) {
      console.error("Profile photo remove error:", error);
      setStatus("error", error.message || "Failed to remove profile photo.");
    }
  }

  function openModal() {
    closeNavbarMenu();
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("my-account-open");
    loadAccountDetails().catch((error) => {
      console.error("My account load error:", error);
      setStatus("error", error.message || "Failed to load account details.");
    });
  }

  function closeModal() {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("my-account-open");
  }

  async function handlePermanentDelete() {
    const email = String(sessionUser.email || "").trim();
    if (!email) {
      await showCustomPopup({
        title: "Session Error",
        message: "Unable to verify account email. Please login again.",
        showCancel: false,
        confirmText: "OK",
      });
      return;
    }

    const emailCheck = await showCustomPopup({
      title: "Verify Account Deletion",
      message:
        "To permanently delete your account, type your full email address.",
      requireInput: true,
      inputPlaceholder: "Enter your email",
      confirmText: "Verify",
      cancelText: "Cancel",
    });

    if (!emailCheck.confirmed) {
      return;
    }

    if (emailCheck.value.trim().toLowerCase() !== email.toLowerCase()) {
      await showCustomPopup({
        title: "Email Mismatch",
        message: "Email does not match. Account deletion cancelled.",
        showCancel: false,
        confirmText: "OK",
      });
      return;
    }

    const finalCheck = await showCustomPopup({
      title: "Final Confirmation",
      message:
        "This will permanently delete your account and all saved data. This cannot be undone.",
      confirmText: "Delete Permanently",
      cancelText: "Keep Account",
      destructive: true,
    });

    if (!finalCheck.confirmed) {
      return;
    }

    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";
    setStatus("loading", "Deleting your account permanently...");

    try {
      const response = await fetch(`${apiUrl}/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: sessionUser.id || null,
          email,
        }),
      });

      const result = await parseApiResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to delete account");
      }

      sessionStorage.removeItem("userData");
      sessionStorage.removeItem("fromPage");
      sessionStorage.removeItem("moodForRecommendation");
      sessionStorage.removeItem("selectedEras");
      sessionStorage.removeItem("selectedLanguages");
      sessionStorage.removeItem("latestDetectedMoodSnapshot");

      await showCustomPopup({
        title: "Account Deleted",
        message: "Your account has been deleted permanently.",
        showCancel: false,
        confirmText: "OK",
      });

      window.location.href = "index.html";
    } catch (error) {
      console.error("Delete account error:", error);
      setStatus("error", error.message || "Could not delete account.");
      deleteBtn.disabled = false;
      deleteBtn.innerHTML =
        '<i class="fas fa-trash"></i> Delete Account Permanently';
    }
  }

  window.openMyAccount = openModal;
  window.closeMyAccount = closeModal;

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  if (navbarAvatarEl) {
    navbarAvatarEl.classList.add("avatar-upload-hint");
    navbarAvatarEl.setAttribute("aria-label", "Upload profile photo");
    navbarAvatarEl.setAttribute("data-upload-hint", "Upload photo");
    navbarAvatarEl.style.cursor = "pointer";
    navbarAvatarEl.title = "Click to upload profile photo";
    navbarAvatarEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      profilePhotoInput.click();
    });
  }

  profilePhotoInput.addEventListener("change", (event) => {
    const [selectedFile] = Array.from(event.target.files || []);
    event.target.value = "";
    handleProfilePhotoUpload(selectedFile);
  });

  renderNavbarAvatar(sessionUser.profilePhoto || null);
  syncProfilePhotoFromServer();

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });

  deleteBtn.addEventListener("click", handlePermanentDelete);
})();
