-- Migration number: 0001_initialize.sql
CREATE TABLE IF NOT EXISTS jokes (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    premise TEXT NOT NULL,
    kills INTEGER DEFAULT 0,
    bombs INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    joke_id TEXT NOT NULL,
    rating TEXT NOT NULL CHECK(rating IN ('kill', 'bomb')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(joke_id) REFERENCES jokes(id) ON DELETE CASCADE
);
