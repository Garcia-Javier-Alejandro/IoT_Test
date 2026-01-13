/**
 * ============================================================================
 * Event History Query API - Cloudflare Worker
 * ============================================================================
 * 
 * GET endpoint for retrieving pool control event history from D1 database
 * 
 * @route GET /api/history?deviceId=esp32-01&range=24h&limit=200
 * @env DB: Cloudflare D1 database binding
 * 
 * Query Parameters:
 * - deviceId: Device ID to query (default: "esp32-01")
 * - range: Time range to retrieve (default: "24h")
 *   - Format: "XmXhXd" (e.g., "24h", "7d", "60m")
 *   - Special value: "all" (retrieves 1 year of history)
 *   - Limits: 1m minimum, 30d maximum
 * - limit: Maximum number of events to return (default: 200, max: 500)
 * 
 * Response (Success 200):
 * {
 *   "ok": true,
 *   "deviceId": "esp32-01",
 *   "count": number,
 *   "range": "24h",
 *   "events": [
 *     {
 *       "id": number,
 *       "deviceId": "esp32-01",
 *       "ts": number (epoch milliseconds),
 *       "state": "ON" | "OFF",
 *       "valveId": 1 | 2
 *     },
 *     ...
 *   ]
 * }
 * 
 * Response (Error):
 * {
 *   "ok": false,
 *   "error": "error description"
 * }
 * 
 * Error Codes:
 * - 405: Method not allowed (use GET)
 * - 500: Server error (database issue)
 * 
 * Example Queries:
 * - Last 24 hours: /api/history?deviceId=esp32-01&range=24h&limit=100
 * - Last 7 days: /api/history?deviceId=esp32-01&range=7d&limit=500
 * - All history: /api/history?deviceId=esp32-01&range=all
 * - Last hour: /api/history?deviceId=esp32-01&range=60m
 * 
 * Use Cases:
 * - Dashboard historical data visualization
 * - Event trending analysis
 * - Device usage reports
 * - Data export for troubleshooting
 * 
 * ============================================================================
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function parseRangeToMs(rangeStr) {
  // Accepts: "24h", "7d", "60m", "all"
  const raw = (rangeStr || "24h").toString().trim().toLowerCase();
  
  // Special case: "all" means all time (use a very old timestamp)
  if (raw === "all") {
    return 365 * 24 * 60 * 60 * 1000; // 1 year back
  }
  
  const m = raw.match(/^(\d+)\s*([mhd])$/);
  if (!m) return 24 * 60 * 60 * 1000;

  const n = parseInt(m[1], 10);
  const unit = m[2];

  const mult =
    unit === "m" ? 60 * 1000 :
    unit === "h" ? 60 * 60 * 1000 :
    24 * 60 * 60 * 1000;

  // Reasonable limits to prevent abuse: 1m to 30d
  const ms = n * mult;
  const min = 60 * 1000;
  const max = 30 * 24 * 60 * 60 * 1000;
  return Math.max(min, Math.min(max, ms));
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed. Use GET." }, 405);
  }

  const url = new URL(request.url);
  const deviceId = (url.searchParams.get("deviceId") || "esp32-01").toString().trim();
  const range = (url.searchParams.get("range") || "24h").toString().trim();
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") || "200", 10)));

  const rangeMs = parseRangeToMs(range);
  const sinceTs = Date.now() - rangeMs;

  try {
    const stmt = env.DB
      .prepare(
        "SELECT ts, state, valve_id FROM events WHERE device_id = ? AND ts >= ? ORDER BY ts ASC LIMIT ?"
      )
      .bind(deviceId, sinceTs, limit);

    const rows = await stmt.all();

    return json({
      ok: true,
      deviceId,
      range,
      sinceTs,
      count: rows.results?.length || 0,
      items: (rows.results || []).map(r => ({ 
        ts: r.ts, 
        state: r.state,
        valve_id: r.valve_id || 1 // Default to 1 for old records
      })),
    });
  } catch (e) {
    return json({ ok: false, error: "DB query failed", detail: String(e) }, 500);
  }
}
