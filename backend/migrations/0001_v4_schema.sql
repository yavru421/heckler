DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS heckles;
DROP TABLE IF EXISTS jokes;
DROP TABLE IF EXISTS heckler_profiles;
DROP TABLE IF EXISTS routine_reviews;

CREATE TABLE jokes (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT DEFAULT 'observational',
    author_name TEXT NOT NULL,
    kills INTEGER DEFAULT 0,
    bombs INTEGER DEFAULT 0,
    is_ghosted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE heckles (
    id TEXT PRIMARY KEY,
    joke_id TEXT NOT NULL,
    text TEXT NOT NULL,
    author_name TEXT NOT NULL,
    kills INTEGER DEFAULT 0,
    bombs INTEGER DEFAULT 0,
    is_ghosted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(joke_id) REFERENCES jokes(id) ON DELETE CASCADE
);

CREATE TABLE ratings (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('joke', 'heckle')),
    rating TEXT NOT NULL CHECK(rating IN ('kill', 'bomb')),
    voter_fingerprint TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(target_id, voter_fingerprint)
);

CREATE INDEX idx_jokes_new ON jokes(created_at DESC);
CREATE INDEX idx_heckles_joke ON heckles(joke_id);
CREATE INDEX idx_ratings_target ON ratings(target_id);
