// MusicEra Backend Server
// Express + PostgreSQL API

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// PostgreSQL Connection Pool
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'musicera',
    user: 'postgres',
    password: '11092002'
});

// Test database connection
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('PostgreSQL error:', err);
});

// Initialize Database Tables
async function initializeDatabase() {
    try {
        // Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                face_descriptor TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Users table created/verified');
        
        // Create face_data table for storing face descriptors
        await pool.query(`
            CREATE TABLE IF NOT EXISTS face_data (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                face_descriptor TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Face data table created/verified');
        
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// ==================== ROUTES ====================

// Home route - serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== AUTH ROUTES ====================

// Register new user
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, faceDescriptor } = req.body;
        
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name, email, and password are required' 
            });
        }
        
        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert user into database
        const result = await pool.query(
            `INSERT INTO users (name, email, password, face_descriptor) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, name, email, created_at`,
            [name, email, hashedPassword, faceDescriptor ? JSON.stringify(faceDescriptor) : null]
        );
        
        const user = result.rows[0];
        
        // If face descriptor provided, store in face_data table
        if (faceDescriptor) {
            await pool.query(
                `INSERT INTO face_data (user_id, face_descriptor) VALUES ($1, $2)`,
                [user.id, JSON.stringify(faceDescriptor)]
            );
        }
        
        console.log(`New user registered: ${email}`);
        
        res.json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                created_at: user.created_at
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error registering user' 
        });
    }
});

// Login with email/password
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }
        
        // Find user by email
        const result = await pool.query(
            'SELECT id, name, email, password, face_descriptor FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        const user = result.rows[0];
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Check if user has face registered
        // Handle both null, empty string, and "null" string cases
        const hasFace = user.face_descriptor && 
                       user.face_descriptor !== 'null' && 
                       user.face_descriptor.trim() !== '' && 
                       user.face_descriptor.length > 10;
        
        console.log(`User logged in: ${email}, hasFace: ${hasFace}`);
        
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                hasFace: hasFace
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error logging in' 
        });
    }
});

// Login with face recognition
app.post('/api/face-login', async (req, res) => {
    try {
        const { faceDescriptor } = req.body;
        
        if (!faceDescriptor) {
            return res.status(400).json({ 
                success: false, 
                message: 'Face descriptor is required' 
            });
        }
        
        // Get all users with face data
        const result = await pool.query(
            "SELECT id, name, email, face_descriptor FROM users WHERE face_descriptor IS NOT NULL AND face_descriptor != 'null' AND length(face_descriptor) > 10"
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'No users registered with face recognition' 
            });
        }
        
        // Convert input descriptor to array
        let inputDescriptor;
        if (typeof faceDescriptor === 'string') {
            inputDescriptor = JSON.parse(faceDescriptor);
        } else {
            inputDescriptor = faceDescriptor;
        }
        
        // Find matching face (simple Euclidean distance comparison)
        let matchedUser = null;
        let lowestDistance = Infinity;
        
        for (const user of result.rows) {
            if (user.face_descriptor) {
                let storedDescriptor;
                if (typeof user.face_descriptor === 'string') {
                    storedDescriptor = JSON.parse(user.face_descriptor);
                } else {
                    storedDescriptor = user.face_descriptor;
                }
                
                // Calculate Euclidean distance
                let distance = 0;
                for (let i = 0; i < inputDescriptor.length; i++) {
                    distance += Math.pow(inputDescriptor[i] - storedDescriptor[i], 2);
                }
                distance = Math.sqrt(distance);
                
                console.log(`Face match distance for ${user.email}: ${distance}`);
                
                // Threshold for face match - increased to 0.7 for better compatibility
                if (distance < 0.7 && distance < lowestDistance) {
                    lowestDistance = distance;
                    matchedUser = user;
                }
            }
        }
        
        if (!matchedUser) {
            return res.status(401).json({ 
                success: false, 
                message: 'Face not recognized. Please try again or login with email/password.' 
            });
        }
        
        console.log(`Face login successful: ${matchedUser.email}`);
        
        res.json({
            success: true,
            message: 'Face login successful',
            user: {
                id: matchedUser.id,
                name: matchedUser.name,
                email: matchedUser.email
            }
        });
        
    } catch (error) {
        console.error('Face login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error with face login' 
        });
    }
});

// Get user by ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'SELECT id, name, email, face_descriptor, created_at FROM users WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            user: result.rows[0]
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting user' 
        });
    }
});

// Check if email exists
app.get('/api/check-email/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const result = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        res.json({
            exists: result.rows.length > 0
        });
        
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error checking email' 
        });
    }
});

// Save face descriptor for user
app.post('/api/save-face', async (req, res) => {
    try {
        const { email, faceDescriptor } = req.body;
        
        if (!email || !faceDescriptor) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and face descriptor are required' 
            });
        }
        
        // Update user's face descriptor
        const result = await pool.query(
            'UPDATE users SET face_descriptor = $1 WHERE email = $2 RETURNING id, name, email',
            [JSON.stringify(faceDescriptor), email]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        console.log(`Face saved for user: ${email}`);
        
        res.json({
            success: true,
            message: 'Face data saved successfully',
            user: {
                id: result.rows[0].id,
                name: result.rows[0].name,
                email: result.rows[0].email
            }
        });
        
    } catch (error) {
        console.error('Save face error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error saving face data' 
        });
    }
});

// ==================== START SERVER ====================

async function startServer() {
    await initializeDatabase();
    
    app.listen(PORT, () => {
        console.log(`\n🎵 MusicEra Server running on http://localhost:${PORT}`);
        console.log(`📋 Database: PostgreSQL on localhost:5432/MusicEra`);
        console.log(`\nAPI Endpoints:`);
        console.log(`  POST /api/register - Register new user`);
        console.log(`  POST /api/login - Login with email/password`);
        console.log(`  POST /api/face-login - Login with face recognition`);
        console.log(`  GET /api/users/:id - Get user by ID`);
        console.log(`  GET /api/check-email/:email - Check if email exists\n`);
    });
}

// Universal Search API - YouTube (MP4) / FreeSound (MP3)
app.post('/api/search', async (req, res) => {
    const { query, format = 'mp4', page = 1 } = req.body;
    const perPage = 20;
    if (!query || query.trim().length === 0) return res.status(400).json({success:false, message:'Query required'});
    
    try {
        let allResults = [];
        
        if (format === 'mp4') {
            // YouTube videos - fetch more for pagination support
            const ytKey = process.env.YOUTUBE_API_KEY || 'demo'; // Fallback for no key
            const maxResults = Math.min(perPage * 3, 50); // Max YouTube allows ~50
            const {data} = await axios.get('https://youtube.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    q: query.trim(),
                    type: 'video',
                    videoCategoryId: '10',
                    maxResults,
                    key: ytKey
                }
            });
            allResults = data.items.map(i => ({
                id: i.id.videoId,
                title: i.snippet.title,
                artist: i.snippet.channelTitle,
                thumbnail: i.snippet.thumbnails.medium.url,
                url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
                type: 'youtube',
                format
            }));
        } else {
            // Demo MP3 - infinite pagination
            const demoMp3s = [];
            for (let i = 1; i <= perPage; i++) {
                demoMp3s.push({
                    id: `demo${(page-1)*perPage + i}`,
                    title: `${query} Track ${i} (Demo MP3)`,
                    artist: `Artist ${(page-1)*perPage + i}`,
                    thumbnail: '/placeholder-audio.jpg',
                    url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${((page-1)*perPage + i) % 16 + 1}.mp3`,
                    type: 'freesound',
                    format: 'mp3',
                    duration: `${Math.floor(Math.random()*4)+2}:${Math.floor(Math.random()*60).toString().padStart(2,'0')}`
                });
            }
            allResults = demoMp3s;
        }
        
        // Paginate
        const startIdx = (page - 1) * perPage;
        const paginatedResults = allResults.slice(startIdx, startIdx + perPage);
        const hasMore = allResults.length > startIdx + perPage;
        
        res.json({
            success: true, 
            results: paginatedResults, 
            page,
            hasMore,
            totalFetched: allResults.length,
            format, 
            source: format === 'mp4' ? 'YouTube' : 'FreeSound'
        });
    } catch(e) {
        console.error(`[${format}] Search error:`, e.message);
        res.status(500).json({success:false, message: `${format.toUpperCase()} search failed`});
    }
});

startServer();

