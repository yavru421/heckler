-- Add audio data column to jokes and heckles
ALTER TABLE jokes ADD COLUMN audio_data BLOB;
ALTER TABLE heckles ADD COLUMN audio_data BLOB;

-- Create lineups (playlists) table
CREATE TABLE IF NOT EXISTS lineups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create lineup_jokes mapping table
CREATE TABLE IF NOT EXISTS lineup_jokes (
    lineup_id TEXT NOT NULL,
    joke_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (lineup_id, joke_id),
    FOREIGN KEY (lineup_id) REFERENCES lineups(id) ON DELETE CASCADE,
    FOREIGN KEY (joke_id) REFERENCES jokes(id) ON DELETE CASCADE
);

-- Create club_rooms table for co-listening tables
CREATE TABLE IF NOT EXISTS club_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    current_lineup_id TEXT,
    current_joke_index INTEGER DEFAULT 0,
    joke_started_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_lineup_id) REFERENCES lineups(id) ON DELETE SET NULL
);

-- Create room_reactions table for real-time emoji bursts
CREATE TABLE IF NOT EXISTS room_reactions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    reaction_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES club_rooms(id) ON DELETE CASCADE
);

-- Create comedians profile table
CREATE TABLE IF NOT EXISTS comedians (
    username TEXT PRIMARY KEY,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create follows table for comedian fan bases
CREATE TABLE IF NOT EXISTS follows (
    follower_username TEXT NOT NULL,
    comedian_username TEXT NOT NULL,
    PRIMARY KEY (follower_username, comedian_username),
    FOREIGN KEY (comedian_username) REFERENCES comedians(username) ON DELETE CASCADE
);
