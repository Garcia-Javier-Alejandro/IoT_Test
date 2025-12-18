#include <Arduino.h>

#include <WiFi.h>              // WiFi del ESP32
#include <WiFiClientSecure.h>  // Cliente TLS (HTTPS/MQTTS)
#include <PubSubClient.h>      // MQTT client (usa un Client por debajo)
#include <time.h>              // Para NTP (hora del sistema)
#include <HTTPClient.h>        // Cliente HTTP 

// Tus headers (definidos por vos)
#include "config.h"    // host/puertos/topics/device_id (NO secretos)
#include "secrets.h"   // wifi y mqtt user/pass (SECRETO, no va a GitHub)
#include "ca_cert.h"   // certificado Root CA (público)

// -------------------- Hardware --------------------
static const int LED_PIN = 4;     // GPIO4 -> resistencia -> LED -> GND
static bool ledState = false;     // Estado "lógico" del LED

// -------------------- MQTT/TLS --------------------
// Cliente TLS (se usa para conectar a un servidor con certificado)
WiFiClientSecure tlsClient;

// Cliente MQTT que viaja por el tlsClient
PubSubClient mqtt(tlsClient);

// Aplica ledState al pin real
void applyLed() {
  digitalWrite(LED_PIN, ledState ? HIGH : LOW);
}

// Convierte payload MQTT (bytes) a String
String payloadToString(const byte* payload, unsigned int length) {
  String s;
  s.reserve(length);
  for (unsigned int i = 0; i < length; i++) s += (char)payload[i];
  s.trim();
  return s;
}

// Publica el estado actual del LED en el topic de "state"
// retain=true: el broker guarda el último valor y se lo entrega a quien se suscriba después.
void publishState() {
  const char* msg = ledState ? "ON" : "OFF";

  bool ok = mqtt.publish(TOPIC_LED_STATE, msg, true /*retain*/);

  Serial.print("[MQTT] publish ");
  Serial.print(TOPIC_LED_STATE);
  Serial.print(" = ");
  Serial.print(msg);
  Serial.print(" (retain) -> ");
  Serial.println(ok ? "OK" : "FAIL");
}
bool postEventToCloudflare(const char* state) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[CF] Skip: no WiFi");
    return false;
  }

  // Si no hay hora válida, evitamos registrar timestamps basura
  time_t now = time(nullptr);
  if (now < 1700000000) {
    Serial.println("[CF] Skip: time not synced");
    return false;
  }

  WiFiClientSecure client;
  // Cloudflare uses different certificates - skip verification for now
  // TODO: Add proper Cloudflare CA certificate for production
  client.setInsecure();

  HTTPClient https;
  String url = String(CF_API_BASE_URL) + "/api/event";

  if (!https.begin(client, url)) {
    Serial.println("[CF] https.begin failed");
    return false;
  }

  https.addHeader("Content-Type", "application/json");
  https.addHeader("x-api-key", CF_API_KEY);

  uint64_t tsMs = (uint64_t)now * 1000ULL;

  String body = String("{\"deviceId\":\"") + DEVICE_ID +
                "\",\"state\":\"" + state +
                "\",\"ts\":" + String((unsigned long long)tsMs) +
                "}";

  int code = https.POST(body);
  String resp = https.getString();
  https.end();

  Serial.print("[CF] POST /api/event code=");
  Serial.println(code);
  if (code < 200 || code >= 300) {
    Serial.print("[CF] Response: ");
    Serial.println(resp);
    return false;
  }

  return true;
}


// Esta función se llama cada vez que llega un mensaje MQTT
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String t = String(topic);
  String msg = payloadToString(payload, length);
  msg.toUpperCase();

  Serial.print("[MQTT] RX ");
  Serial.print(t);
  Serial.print(" : ");
  Serial.println(msg);

  // Solo reaccionamos a nuestro topic de comando
  if (t == TOPIC_LED_SET) {
    bool newState;

    if (msg == "ON" || msg == "1") {
      newState = true;
    } else if (msg == "OFF" || msg == "0") {
      newState = false;
    } else {
      Serial.println("[MQTT] Comando desconocido. Usá ON/OFF/1/0");
      return;
    }

    // Solo actuamos si cambió
    if (newState == ledState) {
      Serial.println("[STATE] No change; skipping.");
      return;
    }

    ledState = newState;
    applyLed();
    publishState();

    // Registrar evento en Cloudflare
    postEventToCloudflare(ledState ? "ON" : "OFF");
  }

}

// -------------------- WiFi --------------------
bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.println();
  Serial.print("[WiFi] Conectando a ");
  Serial.println(WIFI_SSID);

  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 20000) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] ERROR: timeout conectando.");
    return false;
  }

  Serial.println("[WiFi] OK conectado.");
  Serial.print("[WiFi] IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

// -------------------- Tiempo/NTP --------------------
// TLS valida fechas del certificado. Si el ESP32 tiene hora "cualquiera", puede fallar el handshake.
// Por eso sincronizamos NTP antes de conectar MQTT TLS.
bool syncTimeNTP() {
  Serial.println("[NTP] Sincronizando hora...");
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  time_t now = time(nullptr);
  const uint32_t start = millis();

  // Esperamos hasta que la hora sea “razonable”
  while (now < 1700000000 && (millis() - start) < 15000) {
    Serial.print(".");
    delay(500);
    now = time(nullptr);
  }
  Serial.println();

  if (now < 1700000000) {
    Serial.println("[NTP] WARN: no sincronizó (timeout). TLS puede fallar.");
    return false;
  }

  Serial.print("[NTP] OK epoch: ");
  Serial.println((long)now);
  return true;
}

// -------------------- MQTT TLS --------------------
void setupMqtt() {
  // Endpoint MQTT TLS (8883) del broker
  mqtt.setServer(MQTT_HOST, MQTT_PORT);

  // Callback para mensajes entrantes
  mqtt.setCallback(onMqttMessage);

  // Cargamos la CA raíz para que el ESP32 pueda validar el certificado del broker
  tlsClient.setCACert(LETS_ENCRYPT_ISRG_ROOT_X1);
}

bool connectMqtt() {
  Serial.print("[MQTT] Conectando a ");
  Serial.print(MQTT_HOST);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  // ClientID: conviene que sea estable y único.
  // DEVICE_ID viene de config.h
  const char* clientId = DEVICE_ID;

  // MQTT_USER / MQTT_PASS vienen de secrets.h
  bool ok = mqtt.connect(clientId, MQTT_USER, MQTT_PASS);

  if (!ok) {
    Serial.print("[MQTT] ERROR connect rc=");
    Serial.println(mqtt.state()); // código de error de PubSubClient
    return false;
  }

  Serial.println("[MQTT] OK conectado.");

  // Nos suscribimos al topic de comando
  mqtt.subscribe(TOPIC_LED_SET);
  Serial.print("[MQTT] Subscribed: ");
  Serial.println(TOPIC_LED_SET);

  // Publicamos estado inicial (y queda retenido)
  publishState();
  return true;
}

// -------------------- Arduino entrypoints --------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(LED_PIN, OUTPUT);
  ledState = false;
  applyLed();

  // 1) WiFi
  connectWiFi();

  // 2) Hora para TLS
  syncTimeNTP();

  // 3) MQTT
  setupMqtt();
  connectMqtt();
}

void loop() {
  // Si se cae WiFi, intentamos recuperar
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Si se cae MQTT, reconectamos
  if (!mqtt.connected()) {
    connectMqtt();
  }

  // Mantiene viva la conexión y procesa mensajes entrantes
  mqtt.loop();
}
