function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function requireApiKey(request, env) {
  const key = request.headers.get("x-api-key");
  if (!env.API_KEY) return { ok: false, status: 500, error: "API_KEY not configured in environment" };
  if (!key || key !== env.API_KEY) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

function normalizeState(state) {
  const s = String(state || "").toUpperCase().trim();
  if (s === "ON" || s === "OFF") return s;
  return null;
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed. Use POST." }, 405);
  }

  const auth = requireApiKey(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const deviceId = (payload.deviceId || "esp32-01").toString().trim();
  const state = normalizeState(payload.state);
  const ts = Number.isFinite(payload.ts) ? Number(payload.ts) : Date.now();
  const valveId = Number.isFinite(payload.valveId) ? Number(payload.valveId) : 1; // Default to valve 1

  if (!deviceId) return json({ ok: false, error: "deviceId is required" }, 400);
  if (!state) return json({ ok: false, error: 'state must be "ON" or "OFF"' }, 400);
  if (!Number.isFinite(ts) || ts <= 0) return json({ ok: false, error: "ts must be a positive number (epoch ms)" }, 400);
  if (valveId !== 1 && valveId !== 2) return json({ ok: false, error: "valveId must be 1 or 2" }, 400);

  try {
    // Insert new event with valve_id
    const stmt = env.DB
      .prepare("INSERT INTO events (device_id, ts, state, valve_id) VALUES (?, ?, ?, ?)")
      .bind(deviceId, ts, state, valveId);

    const result = await stmt.run();

    // Clean up old events (retain only past 60 days)
    // Run cleanup periodically (10% chance) to avoid overhead on every insert
    if (Math.random() < 0.1) {
      const retentionMs = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds
      const cutoffTs = Date.now() - retentionMs;
      
      await env.DB
        .prepare("DELETE FROM events WHERE ts < ?")
        .bind(cutoffTs)
        .run();
    }

    return json({
      ok: true,
      inserted: {
        deviceId,
        ts,
        state,
        valveId,
      },
      meta: {
        success: result.success,
      },
    });
  } catch (e) {
    return json({ ok: false, error: "DB insert failed", detail: String(e) }, 500);
  }
}
