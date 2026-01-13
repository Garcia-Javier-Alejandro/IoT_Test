-- =============================================================================
-- Migration: 001_create_events_table
-- Purpose: Create events table for logging pool control events
-- Created: January 2026
-- Database: Cloudflare D1
-- =============================================================================
--
-- DESCRIPTION:
-- This migration creates the events table for storing pool control event logs.
-- Each event records when the pump or valves changed state, with timestamp,
-- device identifier, and valve-specific information.
--
-- SCHEMA:
-- - id: Unique event identifier (auto-increment, primary key)
-- - device_id: Identifier for the ESP32 device (e.g., "esp32-01")
-- - ts: Event timestamp in milliseconds since epoch (Unix time)
-- - state: Pump/valve state ("ON" or "OFF")
-- - valve_id: Which valve changed (1 or 2; default 1 for pump)
-- - created_at: Record creation timestamp (for audit trail)
--
-- RETENTION:
-- Events are stored indefinitely in this schema. In production, consider:
-- - Adding a cleanup scheduled job to archive old records
-- - Setting a retention policy (e.g., keep only 90 days of history)
-- - Using a data warehouse for long-term analytics
--
-- INDEXES:
-- - PRIMARY: id (auto-incrementing unique identifier)
-- - Index on (device_id, ts): Optimizes queries for device history by date range
-- - Index on device_id: Optimizes device-specific queries
--
-- USAGE:
-- Insert event: INSERT INTO events (device_id, ts, state, valve_id) 
--               VALUES ('esp32-01', 1704067200000, 'ON', 1)
-- 
-- Query last 24 hours: SELECT * FROM events 
--                      WHERE device_id = 'esp32-01' 
--                      AND ts > (strftime('%s', 'now') * 1000 - 86400000)
--                      ORDER BY ts DESC
--
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
  -- Primary key: unique event identifier
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Device identifier (e.g., "esp32-01", "esp32-pool-01")
  device_id TEXT NOT NULL DEFAULT 'esp32-01',
  
  -- Event timestamp in milliseconds since epoch (Unix time)
  -- Allows precise ordering and time-based queries
  ts INTEGER NOT NULL,
  
  -- State change: "ON" or "OFF"
  -- Represents pump activation/deactivation or valve mode change
  state TEXT NOT NULL CHECK(state IN ('ON', 'OFF')),
  
  -- Valve identifier: which valve/relay changed
  -- 1 = Pump relay
  -- 2 = Valve relay (alternate interpretation)
  -- Default: 1 (usually indicates pump event)
  valve_id INTEGER DEFAULT 1 CHECK(valve_id IN (1, 2)),
  
  -- Record creation timestamp (audit trail)
  -- Automatically set to current timestamp when record is created
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Composite index for efficient time-range queries per device
-- Optimizes: WHERE device_id = ? AND ts > ? AND ts < ?
CREATE INDEX IF NOT EXISTS idx_events_device_ts ON events(device_id, ts DESC);

-- Single column index for device queries
-- Optimizes: WHERE device_id = ?
CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id);

-- Index on state for state-specific queries (e.g., count of "ON" events)
CREATE INDEX IF NOT EXISTS idx_events_state ON events(state);

-- =============================================================================
-- POST-MIGRATION CHECKLIST:
--
-- [ ] Verify table created: .schema events
-- [ ] Test insert: INSERT INTO events (...) VALUES (...)
-- [ ] Test query: SELECT * FROM events LIMIT 10
-- [ ] Verify indexes: .indexes events
-- [ ] Test time-range query: SELECT * FROM events WHERE ts > ?
-- [ ] Verify retention policy (if applicable)
--
-- =============================================================================
