export async function onRequest({ request }) {
  const url = new URL(request.url);

  const deviceId = url.searchParams.get("deviceId") || "esp32-01";
  const range = url.searchParams.get("range") || "24h";

  const body = {
    ok: true,
    endpoint: "GET /api/history",
    deviceId,
    range,
    items: [],
    note: "stub (next step: read from D1)"
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
