// MusicEra Dashboard - YouTube Music Search
// Handles search, results, and player

const API_BASE = String(
  window.MUSICERA_API_BASE ||
    localStorage.getItem("MUSICERA_API_BASE") ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : ""),
)
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");
const API_URL = `${API_BASE}/api`;
let currentResults = [];
let currentPlayerVideoId = null;
let playlistState = null;
let draggedPlaylistSongId = "";
const DISCOVERY_QUERIES = [
  "latest hindi songs",
  "bollywood hits",
  "lofi chill music",
  "punjabi songs",
  "indie pop songs",
  "top english songs",
  "romantic songs",
  "party songs mix",
  "trending music videos",
  "arijit singh songs",
];

const FALLBACK_VIDEOS = [
  {
    id: "JGwWNGJdvx8",
    title: "Shape of You",
    artist: "Ed Sheeran",
    thumbnail: "https://i.ytimg.com/vi/JGwWNGJdvx8/mqdefault.jpg",
    url: "https://www.youtube.com/watch?v=JGwWNGJdvx8",
    type: "youtube",
    format: "mp4",
  },
  {
    id: "kJQP7kiw5Fk",
    title: "Despacito",
    artist: "Luis Fonsi",
    thumbnail: "https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg",
    url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
    type: "youtube",
    format: "mp4",
  },
  {
    id: "RgKAFK5djSk",
    title: "See You Again",
    artist: "Wiz Khalifa",
    thumbnail: "https://i.ytimg.com/vi/RgKAFK5djSk/mqdefault.jpg",
    url: "https://www.youtube.com/watch?v=RgKAFK5djSk",
    type: "youtube",
    format: "mp4",
  },
  {
    id: "YQHsXMglC9A",
    title: "Hello",
    artist: "Adele",
    thumbnail: "https://i.ytimg.com/vi/YQHsXMglC9A/mqdefault.jpg",
    url: "https://www.youtube.com/watch?v=YQHsXMglC9A",
    type: "youtube",
    format: "mp4",
  },
  {
    id: "fLexgOxsZu0",
    title: "Uptown Funk",
    artist: "Mark Ronson ft. Bruno Mars",
    thumbnail: "https://i.ytimg.com/vi/fLexgOxsZu0/mqdefault.jpg",
    url: "https://www.youtube.com/watch?v=fLexgOxsZu0",
    type: "youtube",
    format: "mp4",
  },
  {
    id: "hT_nvWreIhg",
    title: "Counting Stars",
    artist: "OneRepublic",
    thumbnail: "https://i.ytimg.com/vi/hT_nvWreIhg/mqdefault.jpg",
    url: "https://www.youtube.com/watch?v=hT_nvWreIhg",
    type: "youtube",
    format: "mp4",
  },
];

// DOM Elements
const searchInput = document.getElementById("musicSearchInput");
const searchBtn = document.getElementById("searchBtn");
const searchResults = document.getElementById("searchResults");
const playerContainer = document.getElementById("youtubePlayer");
const loadingSpinner = document.getElementById("loadingSpinner");
const noResultsMsg = document.getElementById("noResultsMsg");
const resultsCount = document.getElementById("resultsCount");
const clearBtn = document.getElementById("clearSearch");
const shuffleFeedBtn = document.getElementById("shuffleFeedBtn");
const recommendationTitle = document.getElementById("recommendationTitle");
const genreChips = document.querySelectorAll(".genre-chip");
const searchSuggestions = document.getElementById("searchSuggestions");
const playlistItems = document.getElementById("playlistItems");
const playlistCount = document.getElementById("playlistCount");
const clearPlaylistBtn = document.getElementById("clearPlaylistBtn");
const playlistSelect = document.getElementById("playlistSelect");
const createPlaylistBtn = document.getElementById("createPlaylistBtn");
const deletePlaylistBtn = document.getElementById("deletePlaylistBtn");
const exportPlaylistBtn = document.getElementById("exportPlaylistBtn");
const importPlaylistBtn = document.getElementById("importPlaylistBtn");
const importPlaylistInput = document.getElementById("importPlaylistInput");
const createPlaylistModal = document.getElementById("createPlaylistModal");
const createPlaylistForm = document.getElementById("createPlaylistForm");
const createPlaylistNameInput = document.getElementById(
  "createPlaylistNameInput",
);
const cancelCreatePlaylistBtn = document.getElementById(
  "cancelCreatePlaylistBtn",
);

let currentUser = null;
let activeMoodFromHistory = "";
let forcedMood = "";
const PLAYLIST_STORAGE_PREFIX = "musicera_user_playlist";
const PLAYLIST_SCHEMA_VERSION = 2;

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
  const mood = String(value || "")
    .trim()
    .toLowerCase();
  return VALID_MOODS.has(mood) ? mood : "";
}

const LATEST_MOOD_SESSION_KEY = "latestDetectedMoodSnapshot";
const LATEST_MOOD_MAX_AGE_MS = 30 * 60 * 1000;

function getLatestDetectedMoodFromSession() {
  const rawValue = sessionStorage.getItem(LATEST_MOOD_SESSION_KEY);
  if (!rawValue) {
    return "";
  }

  try {
    const parsed = JSON.parse(rawValue);
    const detectedMood = normalizeValidMood(parsed?.mood);
    const detectedAt = Number(parsed?.detectedAt || 0);

    if (!detectedMood || !Number.isFinite(detectedAt)) {
      sessionStorage.removeItem(LATEST_MOOD_SESSION_KEY);
      return "";
    }

    if (Date.now() - detectedAt > LATEST_MOOD_MAX_AGE_MS) {
      sessionStorage.removeItem(LATEST_MOOD_SESSION_KEY);
      return "";
    }

    return detectedMood;
  } catch (error) {
    sessionStorage.removeItem(LATEST_MOOD_SESSION_KEY);
    return "";
  }
}

let feedMode = "recommended";
let activeGenreLabel = "For You";
let activeGenreQuery = "";
const SKELETON_BATCH_SIZE = 4;
let nextPageToken = "";
let activeSuggestionIndex = -1;
let latestSuggestionRequestId = 0;
const suggestionCache = new Map();

// Initialize dashboard functionality
document.addEventListener("DOMContentLoaded", () => {
  // Auth guard - redirect if not logged in
  const userData = sessionStorage.getItem("userData");
  if (!userData) {
    window.location.href = "index.html";
    return;
  }

  currentUser = JSON.parse(userData);
  playlistState = loadPlaylistFromStorage();
  renderPlaylist();

  // Initialize event listeners first
  if (searchInput) searchInput.focus();
  initEventListeners();

  // Check for emotion-based mood recommendation
  const urlParams = new URLSearchParams(window.location.search);
  const moodParam = urlParams.get("mood");
  const sessionMood = sessionStorage.getItem("moodForRecommendation");
  const latestDetectedMood = getLatestDetectedMoodFromSession();
  const selectedErasStr = sessionStorage.getItem("selectedEras");
  const selectedLanguagesStr = sessionStorage.getItem("selectedLanguages");

  const requestedMood = normalizeValidMood(
    moodParam || sessionMood || latestDetectedMood,
  );

  if (requestedMood) {
    const mood = requestedMood;
    forcedMood = mood;
    activeMoodFromHistory = forcedMood;
    const searchQuery = buildMoodSearchQuery(
      mood,
      selectedErasStr,
      selectedLanguagesStr,
    );
    loadInitialFeed(
      searchQuery,
      mood.charAt(0).toUpperCase() + mood.slice(1) + " Music",
    );

    // Clean up session storage
    sessionStorage.removeItem("moodForRecommendation");
    sessionStorage.removeItem("selectedEras");
    sessionStorage.removeItem("selectedLanguages");
  } else {
    // Load default feed
    loadInitialFeed();
  }
});

function buildMoodSearchQuery(mood, erasStr, languagesStr) {
  const normalizedMood = normalizeValidMood(mood);
  const moodSeedQuery = {
    happy: "upbeat party dance feel good hits",
    sad: "emotional soothing acoustic heartfelt songs",
    angry: "high energy rock rap motivational power songs",
    neutral: "chill lofi relaxing focus music",
    surprise: "trending viral latest chartbusters",
    fear: "calm healing relaxing ambient songs",
    disgust: "refreshing positive motivational songs",
  };

  let query = moodSeedQuery[normalizedMood] || "top hits";

  try {
    if (erasStr) {
      const eras = JSON.parse(erasStr);
      if (eras.length > 0) {
        query += " " + eras[0];
      }
    }
    if (languagesStr) {
      const languages = JSON.parse(languagesStr);
      if (languages.length > 0) {
        query += " " + languages[0];
      }
    }
  } catch (e) {
    console.error("Error parsing preferences:", e);
  }

  return query;
}

function setRecommendationHeader(titleText) {
  if (recommendationTitle) {
    recommendationTitle.textContent = titleText;
  }
}

function getUserDisplayName() {
  const fullName = String(currentUser?.name || "").trim();
  if (!fullName) {
    return "User";
  }
  return fullName.split(" ")[0];
}

function updateHeaderWithMood(profile, isSearchMode) {
  const userName = getUserDisplayName();

  if (forcedMood) {
    const moodText = forcedMood.charAt(0).toUpperCase() + forcedMood.slice(1);
    activeMoodFromHistory = forcedMood;
    if (isSearchMode) {
      setRecommendationHeader(
        `${userName}, your mood is ${moodText} - showing matching songs`,
      );
      return;
    }
    setRecommendationHeader(`${userName}, your mood is ${moodText}`);
    return;
  }

  if (!profile?.dominantMood) {
    activeMoodFromHistory = "";
    if (isSearchMode) {
      setRecommendationHeader(`${userName}, searching songs for your vibe`);
      return;
    }
    setRecommendationHeader(`${userName}, checking your mood from history`);
    return;
  }

  const normalizedProfileMood = normalizeValidMood(profile.dominantMood);
  if (!normalizedProfileMood) {
    activeMoodFromHistory = "";
    if (isSearchMode) {
      setRecommendationHeader(`${userName}, searching songs for your vibe`);
      return;
    }
    setRecommendationHeader(`${userName}, checking your mood from history`);
    return;
  }

  activeMoodFromHistory = normalizedProfileMood;
  const moodText =
    normalizedProfileMood.charAt(0).toUpperCase() +
    normalizedProfileMood.slice(1);

  if (isSearchMode) {
    setRecommendationHeader(
      `${userName}, your mood is ${moodText} - showing matching songs`,
    );
    return;
  }

  setRecommendationHeader(`${userName}, your mood is ${moodText}`);
}

function setActiveGenreChip(label) {
  genreChips.forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.label === label);
  });
}

function pickRandomQuery() {
  const index = Math.floor(Math.random() * DISCOVERY_QUERIES.length);
  return DISCOVERY_QUERIES[index];
}

async function requestSearch(query, pageToken = "") {
  const body = {
    query,
    format: currentFormat,
    pageToken,
    userId: currentUser?.id || null,
    email: currentUser?.email || null,
    moodAware: true,
    preferredMood: forcedMood || null,
  };

  const response = await fetch(`${API_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

async function fetchAndApplyResults(
  query,
  isLoadMore = false,
  shuffle = false,
) {
  if (!query) {
    return false;
  }

  try {
    const data = await requestSearch(query, isLoadMore ? nextPageToken : "");

    if (!data.success) {
      if (isLoadMore) {
        showLoadMoreSpinner(false);
      }
      showNotification(data.message || "Search failed", "error");
      return false;
    }

    const nextResults = Array.isArray(data.results) ? data.results : [];
    updateHeaderWithMood(data.moodProfile, feedMode === "search");

    if (isLoadMore) {
      const startIndex = currentResults.length;
      currentResults = [...currentResults, ...nextResults];
      appendResults(nextResults, startIndex);
      showLoadMoreSpinner(false);
    } else {
      currentResults = shuffle
        ? [...nextResults].sort(() => Math.random() - 0.5)
        : nextResults;
      clearPlayer();
      renderResults();
    }

    nextPageToken = data.nextPageToken || "";
    hasMore = Boolean(nextPageToken);
    currentQuery = query;
    noResultsMsg.style.display = "none";
    updateResultsCount();
    initInfiniteScroll();
    return true;
  } catch (error) {
    console.error("Feed fetch error:", error);
    if (isLoadMore) {
      showLoadMoreSpinner(false);
    }
    showNotification("Server connection error", "error");
    return false;
  } finally {
    if (isLoadMore) {
      removeSkeletonLoaders();
    }
    loadingMore = false;
  }
}

function loadFallbackFeed() {
  feedMode = "recommended";
  currentResults = [...FALLBACK_VIDEOS].sort(() => Math.random() - 0.5);
  nextPageToken = "";
  hasMore = false;
  currentQuery = "";
  if (infiniteObserver) {
    infiniteObserver.disconnect();
    infiniteObserver = null;
  }
  noResultsMsg.style.display = "none";
  renderResults();
  if (resultsCount) {
    resultsCount.textContent = `${currentResults.length} recommended songs`;
  }
}

async function loadInitialFeed(customQuery = "", customLabel = "For You") {
  const query = customQuery || pickRandomQuery();
  const userName = getUserDisplayName();
  feedMode = "recommended";
  activeGenreQuery = customQuery;
  activeGenreLabel = customLabel;
  if (forcedMood) {
    const moodText = forcedMood.charAt(0).toUpperCase() + forcedMood.slice(1);
    setRecommendationHeader(
      `${userName}, your mood is ${moodText} - showing matching songs`,
    );
  } else {
    setRecommendationHeader(`${userName}, checking your mood from history`);
  }
  setActiveGenreChip(customLabel);

  showLoading(true);

  if (resultsCount) {
    resultsCount.textContent = "Loading recommendations...";
  }

  try {
    const loaded = await fetchAndApplyResults(query, false, true);
    if (!loaded || currentResults.length === 0) {
      loadFallbackFeed();
    }
  } catch (error) {
    console.error("Initial feed error:", error);
    loadFallbackFeed();
  } finally {
    showLoading(false);
  }
}

function initEventListeners() {
  if (searchBtn) searchBtn.addEventListener("click", handleSearch);
  if (shuffleFeedBtn) {
    shuffleFeedBtn.addEventListener("click", () => {
      loadInitialFeed(activeGenreQuery, activeGenreLabel);
    });
  }

  genreChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const chipLabel = chip.dataset.label || "For You";
      const chipQuery = chip.dataset.query || "";
      if (searchInput) {
        searchInput.value = "";
      }
      loadInitialFeed(chipQuery, chipLabel);
    });
  });

  if (searchInput) {
    searchInput.addEventListener("keydown", handleSearchInputKeydown);
    searchInput.addEventListener("input", debounce(onSearchInput, 300));
    searchInput.addEventListener("focus", () => {
      updateSearchSuggestions(searchInput.value.trim());
    });
    searchInput.addEventListener("blur", () => {
      setTimeout(hideSearchSuggestions, 120);
    });
  }
  if (clearBtn) clearBtn.addEventListener("click", clearSearch);
  if (clearPlaylistBtn) {
    clearPlaylistBtn.addEventListener("click", clearPlaylist);
  }
  if (playlistSelect) {
    playlistSelect.addEventListener("change", (event) => {
      changeActivePlaylist(event.target.value);
    });
  }
  if (createPlaylistBtn) {
    createPlaylistBtn.addEventListener("click", createPlaylist);
  }
  if (createPlaylistForm) {
    createPlaylistForm.addEventListener("submit", submitCreatePlaylist);
  }
  if (cancelCreatePlaylistBtn) {
    cancelCreatePlaylistBtn.addEventListener("click", closeCreatePlaylistModal);
  }
  if (createPlaylistModal) {
    createPlaylistModal.addEventListener("click", (event) => {
      if (event.target === createPlaylistModal) {
        closeCreatePlaylistModal();
      }
    });
  }
  if (deletePlaylistBtn) {
    deletePlaylistBtn.addEventListener("click", deleteActivePlaylist);
  }
  if (exportPlaylistBtn) {
    exportPlaylistBtn.addEventListener("click", exportActivePlaylistAsJson);
  }
  if (importPlaylistBtn && importPlaylistInput) {
    importPlaylistBtn.addEventListener("click", () =>
      importPlaylistInput.click(),
    );
    importPlaylistInput.addEventListener("change", handlePlaylistImport);
  }

  document.addEventListener("click", (event) => {
    if (!searchSuggestions || !searchInput) {
      return;
    }

    const clickedInsideSearchArea =
      searchSuggestions.contains(event.target) ||
      searchInput.contains(event.target) ||
      (searchBtn && searchBtn.contains(event.target));

    if (!clickedInsideSearchArea) {
      hideSearchSuggestions();
    }
  });
}

function getPlaylistStorageKey() {
  const userKey = String(
    currentUser?.id || currentUser?.email || currentUser?.name || "guest",
  )
    .trim()
    .toLowerCase();
  return `${PLAYLIST_STORAGE_PREFIX}:${userKey}`;
}

function generatePlaylistId() {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizePlaylistName(name, fallback = "Playlist") {
  const normalized = String(name || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function normalizeSongData(song) {
  return {
    id: String(song?.id || "").trim(),
    title: String(song?.title || "").trim(),
    artist: String(song?.artist || "Unknown Artist").trim(),
    thumbnail: String(song?.thumbnail || "").trim(),
    url: String(song?.url || "").trim(),
    type: String(song?.type || "youtube").trim(),
  };
}

function createDefaultPlaylistState(initialSongs = []) {
  const defaultPlaylistId = generatePlaylistId();
  return {
    version: PLAYLIST_SCHEMA_VERSION,
    activePlaylistId: defaultPlaylistId,
    playlists: [
      {
        id: defaultPlaylistId,
        name: "Favorites",
        songs: initialSongs,
      },
    ],
  };
}

function loadPlaylistFromStorage() {
  const key = getPlaylistStorageKey();
  const rawValue = localStorage.getItem(key);

  if (!rawValue) {
    return createDefaultPlaylistState();
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (Array.isArray(parsed)) {
      const migratedSongs = parsed
        .map((song) => normalizeSongData(song))
        .filter((song) => song.id && song.title);
      return createDefaultPlaylistState(migratedSongs);
    }

    const rawPlaylists = Array.isArray(parsed?.playlists)
      ? parsed.playlists
      : [];
    const playlists = rawPlaylists
      .map((playlist) => {
        const playlistId =
          String(playlist?.id || "").trim() || generatePlaylistId();
        const playlistName = sanitizePlaylistName(playlist?.name, "Playlist");
        const songs = Array.isArray(playlist?.songs)
          ? playlist.songs
              .map((song) => normalizeSongData(song))
              .filter((song) => song.id && song.title)
          : [];

        return {
          id: playlistId,
          name: playlistName,
          songs,
        };
      })
      .filter((playlist) => playlist.id);

    if (playlists.length === 0) {
      return createDefaultPlaylistState();
    }

    const parsedActiveId = String(parsed?.activePlaylistId || "").trim();
    const hasActivePlaylist = playlists.some(
      (playlist) => playlist.id === parsedActiveId,
    );

    return {
      version: PLAYLIST_SCHEMA_VERSION,
      activePlaylistId: hasActivePlaylist ? parsedActiveId : playlists[0].id,
      playlists,
    };
  } catch (error) {
    console.warn("Unable to parse playlist storage:", error);
    return createDefaultPlaylistState();
  }
}

function persistPlaylist() {
  if (!playlistState) {
    return;
  }
  localStorage.setItem(getPlaylistStorageKey(), JSON.stringify(playlistState));
}

function getActivePlaylist() {
  if (!playlistState || !Array.isArray(playlistState.playlists)) {
    return null;
  }

  return (
    playlistState.playlists.find(
      (playlist) => playlist.id === playlistState.activePlaylistId,
    ) ||
    playlistState.playlists[0] ||
    null
  );
}

function getActivePlaylistSongs() {
  return getActivePlaylist()?.songs || [];
}

function isSongInPlaylist(songId) {
  return getActivePlaylistSongs().some((song) => song.id === songId);
}

function getSongPayload(video) {
  const songId = String(video?.id || video?.videoId || "").trim();
  return {
    id: songId,
    title: String(video?.title || "Untitled Song").trim(),
    artist: String(
      video?.channelTitle ||
        video?.channel ||
        video?.artist ||
        "Unknown Artist",
    ).trim(),
    thumbnail: String(video?.thumbnail || "").trim(),
    url: String(video?.url || "").trim(),
    type: String(video?.type || "youtube").trim(),
  };
}

function addSongToPlaylistById(songId) {
  const targetSongId = String(songId || "").trim();
  if (!targetSongId) {
    return;
  }

  const matchedVideo = currentResults.find(
    (item) => String(item?.id || item?.videoId || "").trim() === targetSongId,
  );

  if (!matchedVideo) {
    showNotification("Song not found in current results", "warning");
    return;
  }

  if (isSongInPlaylist(targetSongId)) {
    showNotification("Song already in your playlist", "info");
    return;
  }

  const activePlaylist = getActivePlaylist();
  if (!activePlaylist) {
    return;
  }

  activePlaylist.songs.unshift(getSongPayload(matchedVideo));
  persistPlaylist();
  renderPlaylist();
  updateResultCardPlaylistStates();
  showNotification(`Added to ${activePlaylist.name}`, "success");
}

function removeSongFromPlaylist(songId) {
  const targetSongId = String(songId || "").trim();
  const activePlaylist = getActivePlaylist();
  if (!activePlaylist) {
    return;
  }

  activePlaylist.songs = activePlaylist.songs.filter(
    (song) => song.id !== targetSongId,
  );

  persistPlaylist();
  renderPlaylist();
  updateResultCardPlaylistStates();
  showNotification("Removed from playlist", "info");
}

function clearPlaylist() {
  const activePlaylist = getActivePlaylist();
  if (!activePlaylist || activePlaylist.songs.length === 0) {
    return;
  }

  activePlaylist.songs = [];
  persistPlaylist();
  renderPlaylist();
  updateResultCardPlaylistStates();
  showNotification("Playlist cleared", "info");
}

function makeUniquePlaylistName(baseName) {
  const normalizedBase = sanitizePlaylistName(baseName, "Playlist");
  const takenNames = new Set(
    (playlistState?.playlists || []).map((playlist) =>
      String(playlist.name || "").toLowerCase(),
    ),
  );

  if (!takenNames.has(normalizedBase.toLowerCase())) {
    return normalizedBase;
  }

  let index = 2;
  while (takenNames.has(`${normalizedBase} ${index}`.toLowerCase())) {
    index += 1;
  }

  return `${normalizedBase} ${index}`;
}

function createPlaylist() {
  openCreatePlaylistModal();
}

function openCreatePlaylistModal() {
  if (!createPlaylistModal) {
    return;
  }

  createPlaylistModal.classList.add("active");
  createPlaylistModal.setAttribute("aria-hidden", "false");

  if (createPlaylistNameInput) {
    createPlaylistNameInput.value = "";
    setTimeout(() => createPlaylistNameInput.focus(), 30);
  }
}

function closeCreatePlaylistModal() {
  if (!createPlaylistModal) {
    return;
  }

  createPlaylistModal.classList.remove("active");
  createPlaylistModal.setAttribute("aria-hidden", "true");
}

function submitCreatePlaylist(event) {
  if (event?.preventDefault) {
    event.preventDefault();
  }

  const inputName = String(createPlaylistNameInput?.value || "").trim();
  if (!inputName) {
    showNotification("Please enter playlist name", "warning");
    if (createPlaylistNameInput) {
      createPlaylistNameInput.focus();
    }
    return;
  }

  const uniqueName = makeUniquePlaylistName(inputName);
  const newPlaylist = {
    id: generatePlaylistId(),
    name: uniqueName,
    songs: [],
  };

  playlistState.playlists.push(newPlaylist);
  playlistState.activePlaylistId = newPlaylist.id;
  persistPlaylist();
  renderPlaylist();
  updateResultCardPlaylistStates();
  closeCreatePlaylistModal();
  showNotification(`Created playlist: ${uniqueName}`, "success");
}

function deleteActivePlaylist() {
  if (!playlistState || playlistState.playlists.length <= 1) {
    showNotification("At least one playlist is required", "warning");
    return;
  }

  const activePlaylist = getActivePlaylist();
  if (!activePlaylist) {
    return;
  }

  const shouldDelete = window.confirm(
    `Delete playlist \"${activePlaylist.name}\"?`,
  );
  if (!shouldDelete) {
    return;
  }

  playlistState.playlists = playlistState.playlists.filter(
    (playlist) => playlist.id !== activePlaylist.id,
  );
  playlistState.activePlaylistId = playlistState.playlists[0].id;
  persistPlaylist();
  renderPlaylist();
  updateResultCardPlaylistStates();
  showNotification("Playlist deleted", "info");
}

function changeActivePlaylist(playlistId) {
  const targetId = String(playlistId || "").trim();
  if (!targetId || !playlistState) {
    return;
  }

  const exists = playlistState.playlists.some(
    (playlist) => playlist.id === targetId,
  );
  if (!exists) {
    return;
  }

  playlistState.activePlaylistId = targetId;
  persistPlaylist();
  renderPlaylist();
  updateResultCardPlaylistStates();
}

function renderPlaylistSelector() {
  if (!playlistSelect) {
    return;
  }

  const activePlaylist = getActivePlaylist();
  const options = (playlistState?.playlists || [])
    .map((playlist) => {
      const isSelected = playlist.id === activePlaylist?.id;
      const safeName = escapeHtml(playlist.name);
      return `<option value="${playlist.id}" ${isSelected ? "selected" : ""}>${safeName}</option>`;
    })
    .join("");

  playlistSelect.innerHTML = options;
}

function exportActivePlaylistAsJson() {
  if (!playlistState || !Array.isArray(playlistState.playlists)) {
    return;
  }

  const exportPayload = {
    type: "musicera-playlists",
    version: PLAYLIST_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    activePlaylistId: playlistState.activePlaylistId,
    playlists: playlistState.playlists,
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const fileName = "musicera_playlists.json";

  const downloadAnchor = document.createElement("a");
  downloadAnchor.href = objectUrl;
  downloadAnchor.download = fileName;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(objectUrl);

  showNotification("Playlists exported", "success");
}

function importPlaylistsFromJsonObject(parsedJson) {
  if (!playlistState) {
    return 0;
  }

  const importedPlaylists = [];
  const activeIdFromFile = String(parsedJson?.activePlaylistId || "").trim();
  const sourceToImportedId = new Map();
  const existingIds = new Set((playlistState.playlists || []).map((p) => p.id));
  const sourcePlaylists = Array.isArray(parsedJson?.playlists)
    ? parsedJson.playlists
    : parsedJson?.playlist
      ? [parsedJson.playlist]
      : Array.isArray(parsedJson)
        ? [{ name: "Imported Playlist", songs: parsedJson }]
        : [];

  sourcePlaylists.forEach((playlist, index) => {
    const songs = Array.isArray(playlist?.songs)
      ? playlist.songs
          .map((song) => normalizeSongData(song))
          .filter((song) => song.id && song.title)
      : [];

    const sourceId = String(playlist?.id || "").trim();
    let candidateId =
      sourceId || `imported_${Date.now().toString(36)}_${index}`;
    while (existingIds.has(candidateId)) {
      candidateId = generatePlaylistId();
    }
    existingIds.add(candidateId);

    const name = makeUniquePlaylistName(playlist?.name || "Imported Playlist");
    sourceToImportedId.set(sourceId, candidateId);
    importedPlaylists.push({
      id: candidateId,
      name,
      songs,
    });
  });

  if (importedPlaylists.length === 0) {
    return 0;
  }

  playlistState.playlists.push(...importedPlaylists);
  playlistState.activePlaylistId =
    (activeIdFromFile && sourceToImportedId.get(activeIdFromFile)) ||
    importedPlaylists[0].id;
  persistPlaylist();
  renderPlaylist();
  updateResultCardPlaylistStates();
  return importedPlaylists.length;
}

async function handlePlaylistImport(event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const textContent = await file.text();
    const parsedJson = JSON.parse(textContent);
    const importedCount = importPlaylistsFromJsonObject(parsedJson);
    if (importedCount === 0) {
      showNotification("No valid playlists found in file", "warning");
      return;
    }
    showNotification(
      `${importedCount} playlist${importedCount === 1 ? "" : "s"} imported`,
      "success",
    );
  } catch (error) {
    console.error("Playlist import failed:", error);
    showNotification("Invalid JSON file", "error");
  } finally {
    if (importPlaylistInput) {
      importPlaylistInput.value = "";
    }
  }
}

function moveSongInActivePlaylist(fromSongId, toSongId) {
  const activePlaylist = getActivePlaylist();
  if (!activePlaylist || !fromSongId || !toSongId || fromSongId === toSongId) {
    return;
  }

  const songs = activePlaylist.songs;
  const fromIndex = songs.findIndex((song) => song.id === fromSongId);
  const toIndex = songs.findIndex((song) => song.id === toSongId);

  if (fromIndex < 0 || toIndex < 0) {
    return;
  }

  const [movedSong] = songs.splice(fromIndex, 1);
  songs.splice(toIndex, 0, movedSong);

  persistPlaylist();
  renderPlaylist();
}

function updatePlaylistCount() {
  if (!playlistCount) {
    return;
  }
  const activeSongs = getActivePlaylistSongs();
  playlistCount.textContent = `${activeSongs.length} ${activeSongs.length === 1 ? "song" : "songs"}`;
}

function renderPlaylist() {
  if (!playlistItems) {
    return;
  }

  renderPlaylistSelector();
  updatePlaylistCount();
  const activePlaylist = getActivePlaylist();
  const activeSongs = activePlaylist?.songs || [];

  if (activeSongs.length === 0) {
    playlistItems.innerHTML = `
      <div class="playlist-empty">
        <i class="fas fa-music"></i>
        <p>Add songs from search results to build this playlist.</p>
      </div>
    `;
    return;
  }

  playlistItems.innerHTML = activeSongs
    .map((song) => {
      const safeTitle = escapeHtml(song.title);
      const safeArtist = escapeHtml(song.artist);
      const safeThumbnail = escapeHtmlAttr(song.thumbnail);

      return `
        <article class="playlist-item" draggable="true" data-song-id="${song.id}">
          <span class="playlist-drag-handle" title="Drag to reorder">
            <i class="fas fa-grip-lines"></i>
          </span>
          <img src="${safeThumbnail}" alt="${safeTitle}" loading="lazy" />
          <div class="playlist-item-info">
            <h4>${truncateText(safeTitle, 45)}</h4>
            <p>${safeArtist}</p>
          </div>
          <div class="playlist-item-actions">
            <button
              type="button"
              class="playlist-item-btn"
              data-song-id="${escapeHtmlAttr(song.id)}"
              onclick="playPlaylistSong(this.dataset.songId)"
              aria-label="Play ${escapeHtmlAttr(song.title)}"
            >
              <i class="fas fa-play"></i>
            </button>
            <button
              type="button"
              class="playlist-item-btn remove"
              data-song-id="${escapeHtmlAttr(song.id)}"
              onclick="removeFromPlaylist(this.dataset.songId)"
              aria-label="Remove ${escapeHtmlAttr(song.title)}"
            >
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  attachPlaylistDragHandlers();
}

function attachPlaylistDragHandlers() {
  if (!playlistItems) {
    return;
  }

  playlistItems
    .querySelectorAll(".playlist-item[draggable='true']")
    .forEach((item) => {
      item.addEventListener("dragstart", () => {
        draggedPlaylistSongId = String(item.dataset.songId || "");
        item.classList.add("dragging");
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        playlistItems
          .querySelectorAll(".playlist-item.drag-over")
          .forEach((el) => el.classList.remove("drag-over"));
        draggedPlaylistSongId = "";
      });

      item.addEventListener("dragover", (event) => {
        event.preventDefault();
        item.classList.add("drag-over");
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });

      item.addEventListener("drop", (event) => {
        event.preventDefault();
        item.classList.remove("drag-over");
        const targetSongId = String(item.dataset.songId || "");
        moveSongInActivePlaylist(draggedPlaylistSongId, targetSongId);
      });
    });
}

function updateResultCardPlaylistStates() {
  document
    .querySelectorAll(".playlist-toggle-btn[data-video-id]")
    .forEach((button) => {
      const targetSongId = String(button.dataset.videoId || "").trim();
      const isSaved = isSongInPlaylist(targetSongId);
      button.classList.toggle("saved", isSaved);
      button.innerHTML = isSaved
        ? '<i class="fas fa-heart"></i> Saved'
        : '<i class="far fa-heart"></i> Add';
    });
}

function buildLocalSearchSuggestions(query) {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();

  const dynamicSuggestions = currentResults
    .map((song) => (song?.title ? String(song.title).trim() : ""))
    .filter(Boolean)
    .slice(0, 12);

  const uniquePool = [];
  const seen = new Set();

  [...DISCOVERY_QUERIES, ...dynamicSuggestions].forEach((item) => {
    const value = String(item || "").trim();
    const key = value.toLowerCase();

    if (!value || seen.has(key)) {
      return;
    }

    seen.add(key);
    uniquePool.push(value);
  });

  if (!normalizedQuery) {
    return uniquePool.slice(0, 7);
  }

  const startsWithMatches = [];
  const includesMatches = [];

  uniquePool.forEach((item) => {
    const lowerItem = item.toLowerCase();
    if (lowerItem.startsWith(normalizedQuery)) {
      startsWithMatches.push(item);
    } else if (lowerItem.includes(normalizedQuery)) {
      includesMatches.push(item);
    }
  });

  return [...startsWithMatches, ...includesMatches].slice(0, 8);
}

async function fetchBackendSearchSuggestions(query) {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();
  const userId = currentUser?.id || "";
  const email = String(currentUser?.email || "")
    .trim()
    .toLowerCase();
  const cacheKey = `${userId}|${email}|${normalizedQuery}`;

  if (suggestionCache.has(cacheKey)) {
    return suggestionCache.get(cacheKey);
  }

  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (userId) {
    params.set("userId", String(userId));
  }
  if (email) {
    params.set("email", email);
  }
  params.set("limit", "8");

  const response = await fetch(`${API_URL}/search-suggestions?${params}`);
  if (!response.ok) {
    throw new Error("Suggestions request failed");
  }

  const data = await response.json();
  const suggestions = Array.isArray(data?.suggestions)
    ? data.suggestions.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  suggestionCache.set(cacheKey, suggestions);
  return suggestions;
}

function mergeSuggestionLists(primary = [], secondary = []) {
  const merged = [];
  const seen = new Set();

  [...primary, ...secondary].forEach((item) => {
    const label = String(item || "").trim();
    if (!label) {
      return;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(label);
  });

  return merged.slice(0, 8);
}

function updateSearchSuggestions(query) {
  const requestId = ++latestSuggestionRequestId;
  const localSuggestions = buildLocalSearchSuggestions(query);
  renderSearchSuggestions(localSuggestions);

  fetchBackendSearchSuggestions(query)
    .then((remoteSuggestions) => {
      if (requestId !== latestSuggestionRequestId) {
        return;
      }

      const merged = mergeSuggestionLists(remoteSuggestions, localSuggestions);
      renderSearchSuggestions(merged);
    })
    .catch(() => {
      // Keep local suggestions when backend suggestions are unavailable.
    });
}

function renderSearchSuggestions(suggestions) {
  if (!searchSuggestions || !searchInput) {
    return;
  }

  searchSuggestions.innerHTML = "";
  activeSuggestionIndex = -1;

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    hideSearchSuggestions();
    return;
  }

  const fragment = document.createDocumentFragment();

  suggestions.forEach((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-suggestion-item";
    button.dataset.query = suggestion;
    button.setAttribute("role", "option");
    button.innerHTML = `<i class="fas fa-magnifying-glass"></i><span></span>`;
    button.querySelector("span").textContent = suggestion;

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applySuggestion(suggestion, true);
    });

    fragment.appendChild(button);
  });

  searchSuggestions.appendChild(fragment);
  searchSuggestions.classList.add("show");
  searchInput.setAttribute("aria-expanded", "true");
}

function hideSearchSuggestions() {
  if (!searchSuggestions || !searchInput) {
    return;
  }

  searchSuggestions.classList.remove("show");
  searchInput.setAttribute("aria-expanded", "false");
  activeSuggestionIndex = -1;
}

function applySuggestion(suggestion, shouldSearch = false) {
  if (!searchInput) {
    return;
  }

  searchInput.value = suggestion;
  hideSearchSuggestions();

  if (shouldSearch) {
    handleSearch();
  }
}

function setActiveSuggestion(nextIndex) {
  if (!searchSuggestions) {
    return;
  }

  const suggestionButtons = Array.from(
    searchSuggestions.querySelectorAll(".search-suggestion-item"),
  );

  if (suggestionButtons.length === 0) {
    activeSuggestionIndex = -1;
    return;
  }

  suggestionButtons.forEach((btn) => btn.classList.remove("active"));

  if (nextIndex < 0 || nextIndex >= suggestionButtons.length) {
    activeSuggestionIndex = -1;
    return;
  }

  activeSuggestionIndex = nextIndex;
  const activeButton = suggestionButtons[activeSuggestionIndex];
  activeButton.classList.add("active");
  activeButton.scrollIntoView({ block: "nearest" });
}

function handleSearchInputKeydown(event) {
  if (!searchSuggestions || !searchInput) {
    return;
  }

  const suggestionButtons = Array.from(
    searchSuggestions.querySelectorAll(".search-suggestion-item"),
  );
  const suggestionsVisible = searchSuggestions.classList.contains("show");

  if (event.key === "ArrowDown") {
    if (!suggestionsVisible) {
      updateSearchSuggestions(searchInput.value.trim());
      return;
    }

    if (suggestionButtons.length > 0) {
      event.preventDefault();
      const nextIndex =
        activeSuggestionIndex < suggestionButtons.length - 1
          ? activeSuggestionIndex + 1
          : 0;
      setActiveSuggestion(nextIndex);
    }
    return;
  }

  if (event.key === "ArrowUp") {
    if (suggestionsVisible && suggestionButtons.length > 0) {
      event.preventDefault();
      const nextIndex =
        activeSuggestionIndex > 0
          ? activeSuggestionIndex - 1
          : suggestionButtons.length - 1;
      setActiveSuggestion(nextIndex);
    }
    return;
  }

  if (event.key === "Escape") {
    hideSearchSuggestions();
    return;
  }

  if (event.key === "Enter") {
    if (
      suggestionsVisible &&
      activeSuggestionIndex >= 0 &&
      suggestionButtons[activeSuggestionIndex]
    ) {
      event.preventDefault();
      const selectedQuery =
        suggestionButtons[activeSuggestionIndex].dataset.query || "";
      applySuggestion(selectedQuery, true);
      return;
    }

    handleSearch();
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

let currentFormat = "mp4"; // MP3 DISABLED - locked to MP4
let hasMore = true;
let loadingMore = false;
let infiniteObserver = null;
let currentQuery = "";

function triggerInvalidSearchFeedback() {
  if (searchInput) {
    searchInput.classList.remove("input-error-shake");
    // Reflow ensures the shake animation restarts on repeated invalid attempts.
    void searchInput.offsetWidth;
    searchInput.classList.add("input-error-shake");
  }

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  ) {
    navigator.vibrate([120, 50, 120]);
  }
}

/* MP3 FEATURE DISABLED
// Add format toggle elements
const formatToggle = document.getElementById("formatToggle");
const mp4Btn = document.getElementById("mp4Btn");
const mp3Btn = document.getElementById("mp3Btn");

if (mp4Btn) mp4Btn.addEventListener("click", () => setFormat("mp4"));
if (mp3Btn) mp3Btn.addEventListener("click", () => setFormat("mp3"));

function setFormat(format) {
  currentFormat = format;
  if (mp4Btn) mp4Btn.classList.toggle("active", format === "mp4");
  if (mp3Btn) mp3Btn.classList.toggle("active", format === "mp3");
  resultsCount.textContent = `0 ${format.toUpperCase()} results`;
}
*/

async function handleSearch(isLoadMore = false) {
  const query = searchInput.value.trim();
  const userName = getUserDisplayName();
  if (!query) {
    triggerInvalidSearchFeedback();
    // showNotification("Please enter a search term", "warning");
    return;
  }

  feedMode = "search";
  setRecommendationHeader(`${userName}, searching songs for your vibe`);

  if (isLoadMore) {
    showLoadMoreSpinner(true);
  } else {
    showLoading(true);
  }

  try {
    await fetchAndApplyResults(query, isLoadMore, false);
  } catch (error) {
    console.error("Search error:", error);
    showNotification("Server connection error", "error");
  } finally {
    if (!isLoadMore) {
      showLoading(false);
    }
    loadingMore = false;
  }
}

function renderResults() {
  if (currentResults.length === 0) {
    searchResults.innerHTML = "";
    noResultsMsg.style.display = "block";
    updateResultsCount();
    return;
  }

  noResultsMsg.style.display = "none";
  updateResultsCount();

  const html = currentResults
    .map((video) => createMusicCardMarkup(video))
    .join("");

  searchResults.innerHTML = html;

  // Animate new results
  const cards = document.querySelectorAll(".music-card");
  cards.forEach((card, index) => {
    card.style.animationDelay = `${index * 0.05}s`;
    card.classList.add("fade-in");
  });
}

function createMusicCardMarkup(video) {
  const videoId = video.id || video.videoId;
  const isSaved = isSongInPlaylist(String(videoId || ""));
  const rawTitle = String(video.title || "Untitled Song");
  const rawArtist = String(
    video.channelTitle || video.channel || video.artist || "Unknown Artist",
  );
  const safeTitle = escapeHtml(rawTitle);
  const safeArtist = escapeHtml(rawArtist);
  const safeThumbnail = escapeHtmlAttr(String(video.thumbnail || ""));

  return `
        <div class="music-card" data-video-id="${videoId}" onclick="toggleInlinePlay('${videoId}')">
            <div class="card-thumbnail">
                <img src="${safeThumbnail}" alt="${safeTitle}" loading="lazy">
                <div class="play-overlay">
                <i class="fas fa-play"></i> <!-- MP3 DISABLED -->
                </div>
                <div class="mini-player" style="display: none;">
                    <button class="mini-play-btn"><i class="fas fa-pause"></i></button>
                    <div class="mini-progress">
                        <div class="mini-progress-fill"></div>
                    </div>
                    <span class="mini-time">0:00</span>
                </div>
            </div>
            <div class="card-info">
                <h4 class="card-title">${truncateText(safeTitle, 50)}</h4>
                <p class="card-channel">${safeArtist}</p>
                <button
                  type="button"
                  class="playlist-toggle-btn ${isSaved ? "saved" : ""}"
                  data-video-id="${videoId}"
                  onclick="togglePlaylistSong(event, '${videoId}')"
                >
                  <i class="${isSaved ? "fas" : "far"} fa-heart"></i>
                  ${isSaved ? "Saved" : "Add"}
                </button>
            </div>
        </div>
    `;
}

function appendResults(nextResults, startIndex) {
  if (!Array.isArray(nextResults) || nextResults.length === 0) {
    return;
  }

  removeSkeletonLoaders();

  const existingSentinel = document.getElementById("load-more-sentinel");
  if (existingSentinel) {
    existingSentinel.remove();
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = nextResults
    .map((video) => createMusicCardMarkup(video))
    .join("");
  const newCards = Array.from(wrapper.children);

  newCards.forEach((card, offset) => {
    card.style.animationDelay = `${(startIndex + offset) * 0.05}s`;
    card.classList.add("fade-in");
    searchResults.appendChild(card);
  });
}

function updateResultsCount() {
  if (!resultsCount) {
    return;
  }

  if (currentResults.length === 0) {
    resultsCount.textContent =
      feedMode === "recommended" ? "0 recommended songs" : "0 MP4 results";
    return;
  }

  resultsCount.textContent =
    feedMode === "recommended"
      ? `${currentResults.length} recommended songs`
      : `${currentResults.length} MP4 results`;
}

function createSkeletonCardMarkup() {
  return `
        <div class="music-card skeleton-card" aria-hidden="true">
            <div class="card-thumbnail skeleton-thumb"></div>
            <div class="card-info skeleton-info">
                <div class="skeleton-line skeleton-line-title"></div>
                <div class="skeleton-line skeleton-line-subtitle"></div>
            </div>
        </div>
    `;
}

function showSkeletonLoaders(count = SKELETON_BATCH_SIZE) {
  removeSkeletonLoaders();

  const sentinel = document.getElementById("load-more-sentinel");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = new Array(count)
    .fill(createSkeletonCardMarkup())
    .join("");
  const skeletonCards = Array.from(wrapper.children);

  skeletonCards.forEach((card) => {
    if (sentinel) {
      searchResults.insertBefore(card, sentinel);
    } else {
      searchResults.appendChild(card);
    }
  });
}

function removeSkeletonLoaders() {
  document.querySelectorAll(".skeleton-card").forEach((el) => el.remove());
}

function playTrack(id, title, url, type) {
  currentPlayerVideoId = id;

  /* MP3 DISABLED */
  updatePlayerIframe(id, title);
  /* end MP3 DISABLED */

  // Always show overlay for all media types
  showOverlay();

  const activeSong = currentResults.find(
    (item) => item.id === id || item.videoId === id,
  );
  saveViewHistory({
    songId: id,
    songTitle: title,
    songArtist: activeSong?.artist || activeSong?.channelTitle || "",
    searchQuery: currentQuery || searchInput?.value?.trim() || "",
    mood: activeMoodFromHistory,
  });

  showNotification(`Now playing: ${truncateText(title, 30)}`, "success");
}

async function saveViewHistory({
  songId,
  songTitle,
  songArtist,
  searchQuery,
  mood,
}) {
  if (!currentUser?.id && !currentUser?.email) {
    return;
  }

  try {
    await fetch(`${API_URL}/view-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser?.id || null,
        email: currentUser?.email || null,
        songId,
        songTitle,
        songArtist,
        searchQuery,
        mood,
      }),
    });
  } catch (error) {
    console.warn("Unable to save play history:", error);
  }
}

function showOverlay() {
  playerContainer.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeOverlay() {
  playerContainer.classList.remove("active");
  document.body.style.overflow = "";
  clearPlayer();
}

window.closeOverlay = closeOverlay; // Global for onclick

function updatePlayerIframe(videoId, title) {
  playerContainer.innerHTML = `
        <button class="player-overlay-close" onclick="closeOverlay()">
            <i class="fas fa-times"></i>
        </button>
        <iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1" 
                title="${title}" frameborder="0" allowfullscreen 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen">
        </iframe>
    `;
}

function updateAudioPlayer(url, title) {
  playerContainer.innerHTML = `
        <div class="spotify-player">
            <div class="player-artwork">
                <img src="${currentResults.find((r) => r.id === currentPlayerVideoId)?.thumbnail || "/audio.svg"}" alt="${title}" id="audioArtwork" onerror="this.src='/audio.svg'">\n            </div>
            <div class="player-info">
                <h3 id="audioTitle">${truncateText(title, 40)}</h3>
                <p id="audioArtist">${currentResults.find((r) => r.id === currentPlayerVideoId)?.artist || "Unknown Artist"}</p>
            </div>
            <audio id="audioPlayer" src="${url}" preload="metadata"></audio>
            <div class="player-controls">
                <button class="control-btn prev-btn"><i class="fas fa-step-backward"></i></button>
                <button class="control-btn play-pause-btn" id="playPauseBtn"><i class="fas fa-play"></i></button>
                <button class="control-btn next-btn"><i class="fas fa-step-forward"></i></button>
            </div>
            <div class="player-progress">
                <span class="current-time" id="currentTime">0:00</span>
                <div class="progress-bar" id="progressBar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <span class="total-time" id="totalTime">0:00</span>
            </div>
            <div class="player-volume">
                <i class="fas fa-volume-up" id="volumeIcon"></i>
                <input type="range" class="volume-slider" id="volumeSlider" min="0" max="100" value="70">
            </div>
        </div>
    `;

  // Real audio player controls
  const audio = document.getElementById("audioPlayer");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const progressBar = document.getElementById("progressBar");
  const progressFill = document.getElementById("progressFill");
  const currentTimeEl = document.getElementById("currentTime");
  const totalTimeEl = document.getElementById("totalTime");
  const volumeSlider = document.getElementById("volumeSlider");
  const volumeIcon = document.getElementById("volumeIcon");

  // Load metadata
  audio.addEventListener("loadedmetadata", () => {
    totalTimeEl.textContent = formatTime(audio.duration);
  });

  // Play/Pause
  playPauseBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play();
      playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
      audio.pause();
      playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
  });

  // Progress
  audio.addEventListener("timeupdate", () => {
    const percent = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = percent + "%";
    currentTimeEl.textContent = formatTime(audio.currentTime);
  });

  // Progress click
  progressBar.addEventListener("click", (e) => {
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
  });

  // Volume
  volumeSlider.addEventListener("input", () => {
    audio.volume = volumeSlider.value / 100;
    volumeIcon.className =
      audio.volume === 0 ? "fas fa-volume-mute" : "fas fa-volume-up";
  });

  // Auto-update icon
  audio.addEventListener("volumechange", () => {
    volumeIcon.className =
      audio.volume === 0 ? "fas fa-volume-mute" : "fas fa-volume-up";
  });

  // Auto-play + handle modern browser autoplay policy
  audio
    .play()
    .then(() => {
      playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    })
    .catch((e) => {
      console.log("Click to play (browser policy):", e);
      // Player visible, user clicks play button
    });
}

function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function clearSearch() {
  searchInput.value = "";
  hideSearchSuggestions();
  searchResults.innerHTML = "";
  playerContainer.innerHTML = "";
  noResultsMsg.style.display = "none";
  if (resultsCount) resultsCount.textContent = "Loading recommendations...";
  currentPlayerVideoId = null;
  loadInitialFeed(activeGenreQuery, activeGenreLabel);
}

function truncateText(text, maxLength) {
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function clearPlayer() {
  if (playerContainer) {
    playerContainer.innerHTML = "";
  }
  currentPlayerVideoId = null;
}

/* MP3 DISABLED
let currentInlineAudio = null;
let currentInlineCard = null; */

// Inline MP3 player only - video uses full overlay
window.toggleInlinePlay = function (id) {
  const video = currentResults.find((r) => r.videoId === id || r.id === id);
  if (!video) return;

  /* MP3 DISABLED - force video overlay */
  const playUrl = video.url;
  playTrack(id, video.title, playUrl, video.type);
  /* end MP3 DISABLED */
};

window.togglePlaylistSong = function (event, songId) {
  if (event?.stopPropagation) {
    event.stopPropagation();
  }

  const targetSongId = String(songId || "").trim();
  if (!targetSongId) {
    return;
  }

  if (isSongInPlaylist(targetSongId)) {
    removeSongFromPlaylist(targetSongId);
    return;
  }

  addSongToPlaylistById(targetSongId);
};

window.removeFromPlaylist = function (songId) {
  removeSongFromPlaylist(songId);
};

window.playPlaylistSong = function (songId) {
  const matchedSong = getActivePlaylistSongs().find(
    (song) => song.id === songId,
  );
  if (!matchedSong) {
    showNotification("Song is not available in playlist", "warning");
    return;
  }

  playTrack(
    matchedSong.id,
    matchedSong.title,
    matchedSong.url,
    matchedSong.type,
  );
};

function showLoading(show) {
  if (loadingSpinner) {
    loadingSpinner.style.display = show ? "flex" : "none";
  }
  if (searchBtn) {
    searchBtn.disabled = show;
  }
}

function showNotification(message, type = "info") {
  // Simple toast notification using existing glassmorphism
  const toast = document.createElement("div");
  toast.className = `notification notification-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function onSearchInput() {
  const query = searchInput.value.trim();
  updateSearchSuggestions(query);

  // Show/hide clear button
  if (query) {
    if (clearBtn) {
      clearBtn.style.opacity = "1";
      clearBtn.style.pointerEvents = "auto";
    }
    // Trigger live search if query is long enough (min 2 chars to reduce API calls)
    if (query.length >= 2) {
      handleSearch();
    }
  } else {
    // Clear results when input is empty
    if (clearBtn) {
      clearBtn.style.opacity = "0.5";
      clearBtn.style.pointerEvents = "none";
    }
    currentResults = [];
    clearPlayer();
    if (infiniteObserver) {
      infiniteObserver.disconnect();
      infiniteObserver = null;
    }
    loadInitialFeed(activeGenreQuery, activeGenreLabel);
  }
}

function initInfiniteScroll() {
  if (infiniteObserver) {
    infiniteObserver.disconnect();
  }

  const sentinel = document.createElement("div");
  sentinel.id = "load-more-sentinel";
  sentinel.className = "load-more-sentinel";
  sentinel.innerHTML =
    '<div class="load-more-spinner" style="display: none;"><i class="fas fa-spinner fa-spin"></i> Loading more...</div>';
  searchResults.appendChild(sentinel);

  infiniteObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (
          entry.isIntersecting &&
          hasMore &&
          !loadingMore &&
          ((feedMode === "search" &&
            currentQuery === searchInput.value.trim()) ||
            (feedMode === "recommended" && !!currentQuery))
        ) {
          loadMore();
        }
      });
    },
    { threshold: 0.1 },
  );

  infiniteObserver.observe(sentinel);
}

async function loadMore() {
  if (loadingMore || !hasMore) return;

  const queryForMore =
    feedMode === "search" ? searchInput.value.trim() : currentQuery;
  if (!queryForMore) return;

  loadingMore = true;
  showLoadMoreSpinner(true);
  showSkeletonLoaders();
  await fetchAndApplyResults(queryForMore, true, false);
}

function showLoadMoreSpinner(show) {
  const spinner = document.querySelector(".load-more-spinner");
  if (spinner) {
    spinner.style.display = show ? "block" : "none";
  }
}

// function showUserBar(user) {
//   // Insert user bar before main content
//   const header =
//     document.querySelector("header") || document.body.firstElementChild;
//   const userBar = document.createElement("div");
//   userBar.id = "userBar";
//   userBar.className = "user-bar";
//   userBar.innerHTML = `
//         <div class="user-avatar">
//             <i class="fas fa-user-circle"></i>
//         </div>
//         <div class="user-info">
//             <span class="user-name">Hi, ${user.name || user.email.split("@")[0]}</span>
//             <span class="user-email">${user.email}</span>
//         </div>
//         <button class="back-btn" onclick="goToEmotions()">
//             <i class="fas fa-arrow-left"></i> Back to Emotions
//         </button>
//         <button class="logout-btn" onclick="logout()">
//             <i class="fas fa-sign-out-alt"></i> Logout
//         </button>
//     `;
//   header.parentNode.insertBefore(userBar, header.nextSibling);

// Add CSS if needed (inline)
//   if (!document.getElementById("userBarStyles")) {
//     const style = document.createElement("style");
//     style.id = "userBarStyles";
//     style.textContent = `
// #userBar {
//                 display: flex !important;
//                 align-items: center !important;
//                 gap: 20px !important;
//                 padding: 16px 32px !important;
//                 background: rgba(255,255,255,0.15) !important;
//                 backdrop-filter: blur(25px) !important;
//                 border-radius: 20px !important;
//                 margin: 20px auto !important;
//                 max-width: 800px !important;
//                 border: 1px solid rgba(255,255,255,0.25) !important;
//                 box-shadow: 0 12px 40px rgba(0,0,0,0.15) !important;
//                 flex-wrap: wrap !important;
//             }

//             .user-avatar i { font-size: 32px; color: #3b82f6; }
//             .user-info { flex: 1; }
//             .user-name { display: block; font-weight: 600; color: white; }
//             .user-email { display: block; font-size: 0.85em; color: rgba(255,255,255,0.8); }
//             .logout-btn {
//                 background: rgba(239,68,68,0.2);
//                 border: 1px solid rgba(239,68,68,0.4);
//                 color: #f87171;
//                 padding: 8px 16px;
//                 border-radius: 8px;
//                 cursor: pointer;
//                 font-size: 0.9em;
//                 transition: all 0.2s;
//             }
//             .logout-btn:hover { background: rgba(239,68,68,0.3); }
//             .back-btn {
//                 background: rgba(99,102,241,0.2);
//                 border: 1px solid rgba(99,102,241,0.4);
//                 color: #6366f1;
//                 padding: 8px 16px;
//                 border-radius: 8px;
//                 cursor: pointer;
//                 font-size: 0.9em;
//                 transition: all 0.2s;
//             }
//             .back-btn:hover {
//                 background: rgba(99,102,241,0.3);
//                 transform: translateX(-2px);
//             }
//         `;
//     document.head.appendChild(style);
//   }
// }

// window.goToEmotions = function () {
//   window.location.href = "emotion.html";
// };

// window.logout = function () {
//   sessionStorage.removeItem("userData");
//   window.location.href = "index.html";
// };
