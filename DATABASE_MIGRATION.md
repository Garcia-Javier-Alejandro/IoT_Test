# Database Migration for Dual Valve Support

## Schema Change Required

The `events` table needs a new column `valve_id` to track which valve each event belongs to.

### Migration SQL

Run this in your Cloudflare D1 database:

```sql
ALTER TABLE events ADD COLUMN valve_id INTEGER DEFAULT 1;
```

### Verification

After migration, verify the schema:

```sql
PRAGMA table_info(events);
```

You should see columns: `device_id`, `ts`, `state`, `valve_id`

### Notes

- Old events without `valve_id` will default to `1` (Válvula 1)
- New events from the ESP32 will include `valveId` in the POST payload
- The frontend and backend code handle missing `valve_id` gracefully with defaults
