(function configureMusicEraApiBase() {
  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const isGithubPages = window.location.hostname.includes("github.io");

  // Set this once for production deployment, e.g. "https://musicera-api.onrender.com"
  const DEFAULT_DEPLOYED_API_BASE = "";

  const searchParams = new URLSearchParams(window.location.search);
  const queryApiBase =
    searchParams.get("apiBase") ||
    searchParams.get("api_base") ||
    searchParams.get("api");

  const normalizeBase = (value) => {
    let normalized = String(value || "")
      .trim()
      .replace(/\/+$/, "");

    if (/\/api$/i.test(normalized)) {
      normalized = normalized.replace(/\/api$/i, "");
    }

    return normalized;
  };

  if (queryApiBase) {
    const normalized = normalizeBase(queryApiBase);
    if (normalized) {
      localStorage.setItem("MUSICERA_API_BASE", normalized);
      window.MUSICERA_API_BASE = normalized;
      return;
    }
  }

  const storedBase = normalizeBase(localStorage.getItem("MUSICERA_API_BASE"));
  const defaultBase = normalizeBase(DEFAULT_DEPLOYED_API_BASE);

  const preferredBase =
    normalizeBase(window.MUSICERA_API_BASE) ||
    storedBase ||
    (!isLocalHost && defaultBase ? defaultBase : "");

  const resolvedBase =
    preferredBase || (isLocalHost ? "http://localhost:3000" : "");

  if (resolvedBase) {
    window.MUSICERA_API_BASE = resolvedBase;
  }

  if (isGithubPages && !storedBase && !defaultBase) {
    console.warn(
      "MusicEra API base is not configured for GitHub Pages. Set localStorage.MUSICERA_API_BASE or edit api-config.js.",
    );
  }
})();
