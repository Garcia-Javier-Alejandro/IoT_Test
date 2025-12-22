# Database Migration for Dual Valve Support

### Notes

- Old events without `valve_id` will default to `1` (Válvula 1)
- New events from the ESP32 will include `valveId` in the POST payload
- The frontend and backend code handle missing `valve_id` gracefully with defaults
