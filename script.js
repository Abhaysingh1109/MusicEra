// MusicEra - Login & Signup with Face Recognition
// Connected to PostgreSQL Backend API

const API_URL = 'http://localhost:3000/api';

// DOM Elements
const faceModal = document.getElementById('faceModal');
const faceSetupModal = document.getElementById('faceSetupModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const video = document.getElementById('video');
const faceStatus = document.getElementById('faceStatus');
const faceLoginToggle = document.getElementById('faceLoginToggle');
const faceLoginToggleContainer = document.getElementById('faceLoginToggleContainer');
const faceLoginSection = document.getElementById('faceLoginSection');
const loginDivider = document.getElementById('loginDivider');
const enableFaceToggle = document.getElementById('enableFaceToggle');
const setupFaceBtn = document.getElementById('setupFaceBtn');
const faceLoginStatus = document.getElementById('faceLoginStatus');
const faceSetupOption = document.getElementById('faceSetupOption');

// Face API variables
let faceApiLoaded = false;
let stream = null;
let currentMode = ''; // 'signup-setup', 'login'
let currentUserEmail = null;
let currentFaceDescriptor = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Load Face API models
    await loadFaceAPI();
    
    // Hide loading overlay
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
    }, 1500);
    
    // Initialize password strength
    initPasswordStrength();
    
    // Ensure manual login is hidden by default
    const manualFields = document.getElementById('manualLoginFields');
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (manualFields) manualFields.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'none';
}

// Load Face API
async function loadFaceAPI() {
    try {
        // Use jsdelivr CDN for models - this is the reliable source
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
        
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        faceApiLoaded = true;
        console.log('Face API loaded successfully');
    } catch (error) {
        console.error('Error loading Face API:', error);
        // Try fallback to original face-api.js models
        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/models';
            
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            
            faceApiLoaded = true;
            console.log('Face API loaded successfully (fallback)');
        } catch (fallbackError) {
            console.error('Error loading Face API (fallback):', fallbackError);
        }
    }
}

// Switch between Login and Signup tabs
function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    const forms = document.querySelectorAll('.auth-form');
    
    tabs.forEach(t => t.classList.remove('active'));
    forms.forEach(f => f.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}Form`).classList.add('active');
    
    // Reset face login UI
    faceLoginToggleContainer.style.display = 'none';
    faceLoginSection.style.display = 'none';
    loginDivider.style.display = 'block';
    
    // Update footer text
    const footerText = document.getElementById('footerText');
    if (tab === 'login') {
        footerText.textContent = 'Welcome back! Please login to continue.';
    } else {
        footerText.textContent = 'Create an account to get started.';
    }
}

// Toggle password visibility
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const btn = input.nextElementSibling;
    const icon = btn.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Password strength indicator
function initPasswordStrength() {
    const passwordInput = document.getElementById('signupPassword');
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');
    
    if (passwordInput && strengthFill) {
        passwordInput.addEventListener('input', (e) => {
            const password = e.target.value;
            let strength = 0;
            
            if (password.length >= 8) strength++;
            if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
            if (password.match(/\d/)) strength++;
            if (password.match(/[^a-zA-Z\d]/)) strength++;
            
            // Update strength bar
            strengthFill.className = 'strength-fill';
            if (strength >= 1) strengthFill.classList.add('weak');
            if (strength >= 2) strengthFill.classList.add('medium');
            if (strength >= 3) strengthFill.classList.add('strong');
            
            // Update text
            if (strengthText) {
                if (strength === 0) strengthText.textContent = '';
                else if (strength === 1) strengthText.textContent = 'Weak password';
                else if (strength === 2) strengthText.textContent = 'Medium password';
                else if (strength >= 3) strengthText.textContent = 'Strong password';
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
    faceSetupModal.classList.remove('active');
    // Switch to login tab
    switchTab('login');
}

// Start face setup (from post-signup modal)
function startFaceSetup() {
    if (!enableFaceToggle.checked) return;
    currentMode = 'signup-setup';
    document.getElementById('faceModalTitle').textContent = 'Set Up Face ID';
    document.getElementById('faceModalDesc').textContent = 'Position your face in the frame to register';
    faceSetupModal.classList.remove('active');
    faceModal.classList.add('active');
    startCamera();
}

// Toggle face login (in login form)
function toggleFaceLogin() {
    if (faceLoginToggle.checked) {
        faceLoginSection.style.display = 'block';
        loginDivider.style.display = 'none';
    } else {
        faceLoginSection.style.display = 'none';
        loginDivider.style.display = 'block';
        faceLoginStatus.textContent = '';
    }
}

// Start Face Login
async function startFaceLogin() {
    if (!faceApiLoaded) {
        alert('Face recognition is still loading. Please wait a moment.');
        return;
    }
    
    currentMode = 'login';
    document.getElementById('faceModalTitle').textContent = 'Face Login';
    document.getElementById('faceModalDesc').textContent = 'Position your face in the frame to login';
    
    faceModal.classList.add('active');
    await startCamera();
}

// Toggle Manual Login (fallback when face doesn't work)
function toggleManualLogin() {
    const manualFields = document.getElementById('manualLoginFields');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const toggleBtn = document.querySelector('.btn-manual-toggle');
    const divider = document.querySelector('.divider');
    
    if (manualFields.style.display === 'none') {
        manualFields.style.display = 'block';
        submitBtn.style.display = 'block';
        toggleBtn.classList.add('active');
        divider.style.display = 'none';
    } else {
        manualFields.style.display = 'none';
        submitBtn.style.display = 'none';
        toggleBtn.classList.remove('active');
        divider.style.display = 'block';
    }
}

// Start Face Setup from Login page (for users who haven't set up face yet)
function startFaceSetupFromLogin() {
    currentMode = 'login-setup';
    document.getElementById('faceModalTitle').textContent = 'Set Up Face ID';
    document.getElementById('faceModalDesc').textContent = 'Position your face in the frame to register';
    faceModal.classList.add('active');
    startCamera();
}

// Close Face Modal
function closeFaceModal() {
    faceModal.classList.remove('active');
    stopCamera();
    
    // Reset status
    faceStatus.className = 'face-status';
    faceStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Initializing camera...</span>';
}

// Start Camera
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            } 
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
        
        // Give camera extra time to stabilize
        setTimeout(() => {
            detectFace();
        }, 500);
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        updateFaceStatus('error', 'Unable to access camera. Please grant permission.');
    }
}

// Stop Camera
function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

// Detect and recognize face
async function detectFace() {
    if (!stream || !video.srcObject) return;
    
    // Ensure video has proper dimensions
    if (!video.videoWidth || !video.videoHeight) {
        console.log('Video not ready, waiting...');
        setTimeout(() => detectFace(), 500);
        return;
    }
    
    let attempts = 0;
    const maxAttempts = 60; // Increased attempts (30 seconds)
    const detectionInterval = setInterval(async () => {
        if (!stream || attempts >= maxAttempts) {
            clearInterval(detectionInterval);
            
            if (attempts >= maxAttempts) {
                updateFaceStatus('error', 'Face not detected. Please try again.');
            }
            return;
        }
        
        try {
            // Use TinyFaceDetector with input size for better detection
            const detections = await faceapi.detectAllFaces(
                video, 
                new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
            );
            
            console.log('Detections:', detections.length);
            
            if (detections && detections.length > 0) {
                clearInterval(detectionInterval);
                console.log('Face found, getting descriptor...');
                
                const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
                    .withFaceLandmarks()
                    .withFaceDescriptor();
                
                if (detection) {
                    currentFaceDescriptor = Array.from(detection.descriptor);
                    console.log('Face descriptor obtained');
                    
                    if (currentMode === 'signup-setup') {
                        // Save face to user's account in database
                        updateFaceStatus('success', 'Face registered! Saving...');
                        
                        try {
                            const response = await fetch(`${API_URL}/save-face`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    email: currentUserEmail,
                                    faceDescriptor: currentFaceDescriptor
                                })
                            });
                            
                            const data = await response.json();
                            
                            if (data.success) {
                                updateFaceStatus('success', 'Face ID enabled successfully!');
                                setTimeout(() => {
                                    closeFaceModal();
                                    alert('Face ID has been enabled for your account!');
                                    // Switch to login
                                    switchTab('login');
                                    // Show face login option
                                    faceLoginToggleContainer.style.display = 'block';
                                }, 1500);
                            } else {
                                updateFaceStatus('error', data.message || 'Failed to save face data');
                            }
                        } catch (error) {
                            console.error('Save face error:', error);
                            updateFaceStatus('error', 'Connection error');
                        }
                    } else if (currentMode === 'login-setup') {
                        // Save face from login page (user is already logged in)
                        updateFaceStatus('success', 'Face registered! Saving...');
                        
                        try {
                            const response = await fetch(`${API_URL}/save-face`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    email: currentUserEmail,
                                    faceDescriptor: currentFaceDescriptor
                                })
                            });
                            
                            const data = await response.json();
                            
                            if (data.success) {
                                updateFaceStatus('success', 'Face ID enabled successfully!');
                                setTimeout(() => {
                                    closeFaceModal();
                                    alert('Face ID has been enabled for your account!');
                                    // Show face login toggle
                                    faceLoginToggleContainer.style.display = 'block';
                                    if (faceSetupOption) faceSetupOption.style.display = 'none';
                                }, 1500);
                            } else {
                                updateFaceStatus('error', data.message || 'Failed to save face data');
                            }
                        } catch (error) {
                            console.error('Save face error:', error);
                            updateFaceStatus('error', 'Connection error');
                        }
                    } else if (currentMode === 'login') {
                        // Login with face - send to backend for verification
                        updateFaceStatus('success', 'Face recognized! Verifying...');
                        
                        try {
                            console.log('Sending face login request...');
                            const response = await fetch(`${API_URL}/face-login`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    faceDescriptor: currentFaceDescriptor
                                })
                            });
                            
                            console.log('Response status:', response.status);
                            const data = await response.json();
                            console.log('Response data:', data);
                            
                            if (data.success) {
                                updateFaceStatus('success', 'Login successful!');
                                
                                // Store user data and redirect
                                sessionStorage.setItem('userData', JSON.stringify({
                                    name: data.user.name,
                                    email: data.user.email,
                                    hasFace: true
                                }));
                                
                                setTimeout(() => {
                                    closeFaceModal();
                                    window.location.href = 'dashboard.html';
                                }, 1000);
                            } else {
                                updateFaceStatus('error', data.message || 'Face not recognized');
                            }
                        } catch (error) {
                            console.error('Face login API error:', error);
                            updateFaceStatus('error', 'Connection error. Please try again.');
                        }
                    }
                }
            } else {
                attempts++;
                updateFaceStatus('scanning', 'Looking for face...');
            }
        } catch (error) {
            console.error('Face detection error:', error);
            attempts++;
        }
    }, 500);
}

// Update Face Status
function updateFaceStatus(status, message) {
    faceStatus.className = 'face-status ' + status;
    
    let icon = '<i class="fas fa-spinner fa-spin"></i>';
    
    if (status === 'success') {
        icon = '<i class="fas fa-check-circle"></i>';
    } else if (status === 'error') {
        icon = '<i class="fas fa-times-circle"></i>';
    } else if (status === 'scanning') {
        icon = '<i class="fas fa-search"></i>';
    }
    
    faceStatus.innerHTML = icon + '<span>' + message + '</span>';
}

// Login form submission
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Check if face login is enabled
    if (faceLoginToggle && faceLoginToggle.checked) {
        alert('Please use Face ID to login, or turn off the toggle to use email/password');
        return;
    }
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUserEmail = email;
            
            // Store user data in sessionStorage for dashboard
            sessionStorage.setItem('userData', JSON.stringify({
                name: data.user.name,
                email: data.user.email,
                hasFace: data.user.hasFace
            }));
            
            // Check if user has face registered, show toggle
            if (data.user.hasFace) {
                faceLoginToggleContainer.style.display = 'block';
                if (faceSetupOption) faceSetupOption.style.display = 'none';
            } else {
                // Show option to set up face for users without face data
                if (faceSetupOption) faceSetupOption.style.display = 'block';
                faceLoginToggleContainer.style.display = 'none';
            }
            
            // Redirect to dashboard
            window.location.href = 'dashboard.html';
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Connection error. Make sure the server is running on port 3000.');
    }
});

// Signup form submission
document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    
    if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }
    
    if (password.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                email,
                password,
                faceDescriptor: null // Not required during signup
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUserEmail = email;
            
            // Show face setup modal
            faceSetupModal.classList.add('active');
            
            // Reset form
            document.getElementById('signupForm').reset();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Signup error:', error);
        alert('Connection error. Make sure the server is running on port 3000.');
    }
});

// Close modal on overlay click
faceModal?.addEventListener('click', (e) => {
    if (e.target === faceModal) {
        closeFaceModal();
    }
});

faceSetupModal?.addEventListener('click', (e) => {
    if (e.target === faceSetupModal) {
        skipFaceSetup();
    }
});

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeFaceModal();
    }
});

