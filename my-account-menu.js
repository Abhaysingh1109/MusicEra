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

  function formatDate(isoValue) {
    if (!isoValue) {
      return "Not available";
    }

    const dt = new Date(isoValue);
    if (Number.isNaN(dt.getTime())) {
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

    sessionUser = {
      ...sessionUser,
      id: account.id || sessionUser.id,
      name: account.name || sessionUser.name,
      email: account.email || sessionUser.email,
      hasFace: Boolean(account.hasFace),
    };

    sessionStorage.setItem("userData", JSON.stringify(sessionUser));

    detailsEl.innerHTML = `
      <div class="my-account-row"><span>Name</span><strong>${escapeHtml(account.name || "-")}</strong></div>
      <div class="my-account-row"><span>Email</span><strong>${escapeHtml(account.email || "-")}</strong></div>
      <div class="my-account-row"><span>User ID</span><strong>${escapeHtml(account.id || "-")}</strong></div>
      <div class="my-account-row"><span>Face ID</span><strong>${account.hasFace ? "Enabled" : "Not enabled"}</strong></div>
      <div class="my-account-row"><span>Created At</span><strong>${escapeHtml(formatDate(account.createdAt))}</strong></div>
    `;

    setStatus("success", "Account details loaded.");
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
