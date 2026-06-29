-- Migration number: 0003_routine_reviews.sql
CREATE TABLE IF NOT EXISTS routine_reviews (
    id TEXT PRIMARY KEY,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
