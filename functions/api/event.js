export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method Not Allowed. Use POST." }),
      { status: 405, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      { status: 400, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  // Esperado a futuro: { deviceId: "esp32-01", ts: 173..., state: "ON"|"OFF" }
  const body = {
    ok: true,
    endpoint: "POST /api/event",
    received: payload,
    note: "stub (next step: write to D1)"
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
