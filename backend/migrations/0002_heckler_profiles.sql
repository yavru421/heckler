-- Migration number: 0002_heckler_profiles.sql
CREATE TABLE IF NOT EXISTS heckler_profiles (
    session_id TEXT PRIMARY KEY,
    traits TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
