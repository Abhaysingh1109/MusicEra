(function configureMusicEraApiBase() {
  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const isGithubPages = window.location.hostname.includes("github.io");

  // Production backend URL (Render).
  const DEFAULT_DEPLOYED_API_BASE = "https://musicera.onrender.com";

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

    // Handle common production typos so clients still connect.
    try {
      const url = new URL(normalized);
      const hostAliases = {
        "musciaera.onrender.com": "musicera.onrender.com",
        "musicaera.onrender.com": "musicera.onrender.com",
      };
      const correctedHost = hostAliases[url.hostname.toLowerCase()];
      if (correctedHost) {
        url.hostname = correctedHost;
        normalized = url.toString().replace(/\/+$/, "");
      }
    } catch (_error) {
      // Keep original value; validation is handled separately.
    }

    return normalized;
  };

  const isInvalidApiBase = (base) => {
    if (!base) {
      return false;
    }

    try {
      const url = new URL(base);
      if (!/^https?:$/.test(url.protocol)) {
        return true;
      }

      // On GitHub Pages, backend must not be another github.io static site.
      if (isGithubPages && url.hostname.includes("github.io")) {
        return true;
      }

      return false;
    } catch (error) {
      return true;
    }
  };

  if (queryApiBase) {
    const normalized = normalizeBase(queryApiBase);
    if (normalized && !isInvalidApiBase(normalized)) {
      localStorage.setItem("MUSICERA_API_BASE", normalized);
      window.MUSICERA_API_BASE = normalized;
      return;
    }

    console.warn("Ignored invalid apiBase query parameter:", queryApiBase);
  }

  const storedBase = normalizeBase(localStorage.getItem("MUSICERA_API_BASE"));
  const defaultBase = normalizeBase(DEFAULT_DEPLOYED_API_BASE);
  const staleLocalFrontendBase =
    isLocalHost &&
    (storedBase === "http://localhost:3000" ||
      storedBase === "http://127.0.0.1:3000");

  const correctedStoredBase = staleLocalFrontendBase ? "" : storedBase;

  if (staleLocalFrontendBase) {
    localStorage.removeItem("MUSICERA_API_BASE");
  }

  const inMemoryBase = normalizeBase(window.MUSICERA_API_BASE);
  const preferredBase =
    [inMemoryBase, correctedStoredBase, !isLocalHost ? defaultBase : ""].filter(
      (candidate) => candidate && !isInvalidApiBase(candidate),
    )[0] || "";

  const resolvedBase =
    preferredBase ||
    (isLocalHost ? "http://localhost:3001" : window.location.origin);

  if (resolvedBase) {
    window.MUSICERA_API_BASE = resolvedBase;
    localStorage.setItem("MUSICERA_API_BASE", resolvedBase);
    window.MUSICERA_API_DEBUG = {
      base: resolvedBase,
      source: preferredBase ? "configured" : "localhost-fallback",
    };
  }

  if (isGithubPages && !storedBase && !defaultBase) {
    console.warn(
      "MusicEra API base is not configured for GitHub Pages. Set localStorage.MUSICERA_API_BASE or edit api-config.js.",
    );
  }
})();
