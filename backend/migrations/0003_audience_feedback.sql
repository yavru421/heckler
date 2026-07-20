-- Create audience feedback chat table
CREATE TABLE IF NOT EXISTS audience_chat (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
