// MusicEra Dashboard - YouTube Music Search
// Handles search, results, and player

const API_URL = 'http://localhost:3000/api';
let currentResults = [];
let currentPlayerVideoId = null;

// DOM Elements
const searchInput = document.getElementById('musicSearchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const playerContainer = document.getElementById('youtubePlayer');
const loadingSpinner = document.getElementById('loadingSpinner');
const noResultsMsg = document.getElementById('noResultsMsg');
const resultsCount = document.getElementById('resultsCount');
const clearBtn = document.getElementById('clearSearch');

// Initialize dashboard functionality
document.addEventListener('DOMContentLoaded', () => {
    if (searchInput) searchInput.focus();
    initEventListeners();
});

function initEventListeners() {
    if (searchBtn) searchBtn.addEventListener('click', handleSearch);
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
        searchInput.addEventListener('input', debounce(onSearchInput, 300));
    }
    if (clearBtn) clearBtn.addEventListener('click', clearSearch);
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

let currentFormat = 'mp4'; // Default
let currentPage = 1;
let hasMore = true;
let loadingMore = false;
let infiniteObserver = null;
let currentQuery = '';

// Add format toggle elements
const formatToggle = document.getElementById('formatToggle');
const mp4Btn = document.getElementById('mp4Btn');
const mp3Btn = document.getElementById('mp3Btn');

if (mp4Btn) mp4Btn.addEventListener('click', () => setFormat('mp4'));
if (mp3Btn) mp3Btn.addEventListener('click', () => setFormat('mp3'));

function setFormat(format) {
    currentFormat = format;
    if (mp4Btn) mp4Btn.classList.toggle('active', format === 'mp4');
    if (mp3Btn) mp3Btn.classList.toggle('active', format === 'mp3');
    resultsCount.textContent = `0 ${format.toUpperCase()} results`;
}

async function handleSearch(isLoadMore = false) {
    const query = searchInput.value.trim();
    if (!query) {
        showNotification('Please enter a search term', 'warning');
        return;
    }

    if (isLoadMore) {
        showLoadMoreSpinner(true);
    } else {
        showLoading(true);
    }

    try {
        const body = { query, format: currentFormat, page: isLoadMore ? currentPage : 1 };
        const response = await fetch(`${API_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        
        if (data.success) {
            if (isLoadMore) {
                currentResults = [...currentResults, ...data.results];
                hasMore = data.hasMore || data.results.length === 20;
                showLoadMoreSpinner(false);
            } else {
                currentResults = data.results;
                currentPage = 1;
                hasMore = data.hasMore || data.results.length === 20;
                currentQuery = query;
            }
            renderResults();
            clearPlayer();
            initInfiniteScroll();
        } else {
            showNotification(data.message || 'Search failed', 'error');
        }
    } catch (error) {
        console.error('Search error:', error);
        showNotification('Server connection error', 'error');
    } finally {
        if (!isLoadMore) {
            showLoading(false);
        }
        loadingMore = false;
    }
}

function renderResults() {
    if (currentResults.length === 0) {
        searchResults.innerHTML = '';
        noResultsMsg.style.display = 'block';
        if (resultsCount) resultsCount.textContent = `0 ${currentFormat.toUpperCase()} results`;
        return;
    }

    noResultsMsg.style.display = 'none';
    if (resultsCount) resultsCount.textContent = `${currentResults.length} ${currentFormat.toUpperCase()} results`;

    const html = currentResults.map((video, index) => `
        <div class="music-card" onclick="playVideo('${video.id || video.videoId}', '${video.title}')">
            <div class="card-thumbnail">
                <img src="${video.thumbnail}" alt="${video.title}" loading="lazy">
                <div class="play-overlay">
                    <i class="fas fa-${currentFormat === 'mp4' ? 'play' : 'music'}"></i>
                </div>
            </div>
            <div class="card-info">
                <h4 class="card-title">${truncateText(video.title, 50)}</h4>
                <p class="card-channel">${video.channelTitle || video.channel || video.artist}</p>
            </div>
        </div>
    `).join('');

    searchResults.innerHTML = html;

    // Animate new results
    const cards = document.querySelectorAll('.music-card');
    cards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.05}s`;
        card.classList.add('fade-in');
    });
}

function playTrack(id, title, url, type) {
    currentPlayerVideoId = id;
    
    if (type === 'youtube' || type === 'mp4') {
        updatePlayerIframe(id, title);
    } else {
        // FreeSound MP3 - native audio player (no overlay, bottom position)
        updateAudioPlayer(url, title);
    }
    
    if (type === 'mp4' || type === 'youtube') {
        showOverlay();
    }
    showNotification(`Now playing: ${truncateText(title, 30)}`, 'success');
}

function showOverlay() {
    playerContainer.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeOverlay() {
    playerContainer.classList.remove('active');
    document.body.style.overflow = '';
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
                <img src="${currentResults.find(r => r.id === currentPlayerVideoId)?.thumbnail || '/audio.svg'}" alt="${title}" id="audioArtwork" onerror="this.src='/audio.svg'">\n            </div>
            <div class="player-info">
                <h3 id="audioTitle">${truncateText(title, 40)}</h3>
                <p id="audioArtist">${currentResults.find(r => r.id === currentPlayerVideoId)?.artist || 'Unknown Artist'}</p>
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
    const audio = document.getElementById('audioPlayer');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');
    
    // Load metadata
    audio.addEventListener('loadedmetadata', () => {
        totalTimeEl.textContent = formatTime(audio.duration);
    });
    
    // Play/Pause
    playPauseBtn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            audio.pause();
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    });
    
    // Progress
    audio.addEventListener('timeupdate', () => {
        const percent = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = percent + '%';
        currentTimeEl.textContent = formatTime(audio.currentTime);
    });
    
    // Progress click
    progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        audio.currentTime = percent * audio.duration;
    });
    
    // Volume
    volumeSlider.addEventListener('input', () => {
        audio.volume = volumeSlider.value / 100;
        volumeIcon.className = audio.volume === 0 ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    });
    
    // Auto-update icon
    audio.addEventListener('volumechange', () => {
        volumeIcon.className = audio.volume === 0 ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    });
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}



function clearSearch() {
    searchInput.value = '';
    currentResults = [];
    searchResults.innerHTML = '';
    playerContainer.innerHTML = '';
    noResultsMsg.style.display = 'none';
    if (resultsCount) resultsCount.textContent = `0 ${currentFormat.toUpperCase()} results`;
    currentPlayerVideoId = null;
}

function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function clearPlayer() {
    if (playerContainer) {
        playerContainer.innerHTML = '';
    }
    currentPlayerVideoId = null;
}

// Global playVideo for onclick handlers
window.playVideo = function(id, title) {
    const video = currentResults.find(r => r.videoId === id || r.id === id);
    if (!video) {
        showNotification('Video not found', 'error');
        return;
    }
    playTrack(id, title, video.url || '', video.type || 'youtube');
};

function showLoading(show) {
    if (loadingSpinner) {
        loadingSpinner.style.display = show ? 'flex' : 'none';
    }
    if (searchBtn) {
        searchBtn.disabled = show;
    }
}

function showNotification(message, type = 'info') {
    // Simple toast notification using existing glassmorphism
    const toast = document.createElement('div');
    toast.className = `notification notification-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function onSearchInput() {
    const query = searchInput.value.trim();
    
    // Show/hide clear button
    if (query) {
        if (clearBtn) {
            clearBtn.style.opacity = '1';
            clearBtn.style.pointerEvents = 'auto';
        }
        // Trigger live search if query is long enough (min 2 chars to reduce API calls)
        if (query.length >= 2) {
            handleSearch();
        }
    } else {
        // Clear results when input is empty
        if (clearBtn) {
            clearBtn.style.opacity = '0.5';
            clearBtn.style.pointerEvents = 'none';
        }
        currentResults = [];
        currentPage = 1;
        hasMore = true;
        renderResults();
        clearPlayer();
        if (infiniteObserver) {
            infiniteObserver.disconnect();
            infiniteObserver = null;
        }
    }
}

function initInfiniteScroll() {
    if (infiniteObserver) {
        infiniteObserver.disconnect();
    }

    const sentinel = document.createElement('div');
    sentinel.id = 'load-more-sentinel';
    sentinel.className = 'load-more-sentinel';
    sentinel.innerHTML = '<div class="load-more-spinner" style="display: none;"><i class="fas fa-spinner fa-spin"></i> Loading more...</div>';
    searchResults.appendChild(sentinel);

    infiniteObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && hasMore && !loadingMore && currentQuery === searchInput.value.trim()) {
                loadMore();
            }
        });
    }, { threshold: 0.1 });

    infiniteObserver.observe(sentinel);
}

async function loadMore() {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    currentPage++;
    await handleSearch(true); // isLoadMore = true
}

function showLoadMoreSpinner(show) {
    const spinner = document.querySelector('.load-more-spinner');
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
    }
}

// Global playVideo already defined earlier

