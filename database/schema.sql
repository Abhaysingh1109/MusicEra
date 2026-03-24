-- MusicEra database schema
-- This schema matches the backend runtime expectations.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	email VARCHAR(255) UNIQUE NOT NULL,
	password VARCHAR(255) NOT NULL,
	face_descriptor TEXT,
	profile_photo TEXT,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS face_data (
	id SERIAL PRIMARY KEY,
	user_id INTEGER REFERENCES users(id),
	face_descriptor TEXT NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emotion_history (
	id SERIAL PRIMARY KEY,
	user_email VARCHAR(255),
	emotion VARCHAR(50),
	confidence FLOAT,
	user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
	dominant_emotion VARCHAR(50) NOT NULL,
	emotion_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
	detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_view_history (
	id SERIAL PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	song_id VARCHAR(100),
	song_title TEXT,
	song_artist TEXT,
	search_query TEXT,
	mood_snapshot VARCHAR(50),
	played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_view_history_user_played_at
ON user_view_history (user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_view_history_search_query
ON user_view_history (search_query);

CREATE INDEX IF NOT EXISTS idx_user_view_history_song_title
ON user_view_history (song_title);

CREATE TABLE IF NOT EXISTS email_verification_otps (
	id SERIAL PRIMARY KEY,
	email VARCHAR(255) NOT NULL,
	otp_hash VARCHAR(255) NOT NULL,
	payload JSONB NOT NULL DEFAULT '{}'::jsonb,
	attempt_count INTEGER NOT NULL DEFAULT 0,
	expires_at TIMESTAMP NOT NULL,
	consumed_at TIMESTAMP,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_verification_otps_email_created_at
ON email_verification_otps (email, created_at DESC);

CREATE TABLE IF NOT EXISTS user_preferences (
	id SERIAL PRIMARY KEY,
	user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	preferred_eras TEXT[] DEFAULT '{}'::text[],
	preferred_languages TEXT[] DEFAULT '{}'::text[],
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mood_song_mapping (
	id SERIAL PRIMARY KEY,
	mood VARCHAR(50) NOT NULL,
	song_keywords TEXT NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO mood_song_mapping (mood, song_keywords)
SELECT mood, song_keywords
FROM (
	VALUES
		('happy', 'upbeat,dance,party,fun,energetic,feel good,celebrating'),
		('sad', 'emotional,heartbreak,lonely,melancholy,slow,acoustic,sentimental'),
		('angry', 'rock,metal,rap,hard,intense,powerful,angry,aggressive'),
		('fear', 'calm,relax,meditation,healing,soft,ambient,peaceful'),
		('disgust', 'clean,detox,fresh,reset,focus,chill,motivation'),
		('surprise', 'trending,viral,remix,latest,fresh,new,hit,chart,popular'),
		('neutral', 'chill,lofi,focus,instrumental,ambient,calm,lo-fi,study')
) AS seed_data(mood, song_keywords)
WHERE NOT EXISTS (
	SELECT 1 FROM mood_song_mapping existing WHERE existing.mood = seed_data.mood
);

COMMIT;
