-- Add segment metadata column to jokes table
-- Stores JSON array of {type: 'speech'|'pause', text?: string, durationMs?: number, audioIndex?: number}
ALTER TABLE jokes ADD COLUMN segments TEXT;

-- Add comedian archetype column
ALTER TABLE comedians ADD COLUMN archetype TEXT DEFAULT 'deadpan_cynic';
