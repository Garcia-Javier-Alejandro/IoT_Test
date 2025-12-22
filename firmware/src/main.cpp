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

// ==================== Hardware State ====================
static bool pumpState = false;     // Estado lógico de la bomba (ON/OFF)
static int valveMode = 1;          // Modo de válvulas: 1 o 2

// ==================== MQTT/TLS ====================
// Cliente TLS (se usa para conectar a un servidor con certificado)
WiFiClientSecure tlsClient;

// Cliente MQTT que viaja por el tlsClient
PubSubClient mqtt(tlsClient);

// ==================== Helper Functions ====================

// Convierte payload MQTT (bytes) a String
String payloadToString(const byte* payload, unsigned int length) {
  String s;
  s.reserve(length);
  for (unsigned int i = 0; i < length; i++) s += (char)payload[i];
  s.trim();
  return s;
}

// ==================== State Sensing ====================

// Lee el sensor de voltaje de la bomba (220V AC via ZMPT101B)
// Retorna true si detecta voltaje (bomba ON)
bool readPumpSensor() {
  int adcValue = analogRead(PUMP_SENSE_PIN);
  bool detected = (adcValue > VOLTAGE_THRESHOLD);
  
  Serial.print("[SENSOR] Pump ADC=");
  Serial.print(adcValue);
  Serial.print(" -> ");
  Serial.println(detected ? "ON" : "OFF");
  
  return detected;
}

// Lee el sensor de voltaje de las válvulas (24V DC)
// Retorna true si detecta voltaje (válvulas energizadas)
bool readValveSensor() {
  int adcValue = analogRead(VALVE_SENSE_PIN);
  bool detected = (adcValue > VOLTAGE_THRESHOLD);
  
  Serial.print("[SENSOR] Valve ADC=");
  Serial.print(adcValue);
  Serial.print(" -> ");
  Serial.println(detected ? "POWERED" : "OFF");
  
  return detected;
}

// ==================== Relay Control (Latching Pulses) ====================

// Envía un pulso de 100ms al relay para alternar (toggle) el contactor de la bomba
void sendPumpPulse() {
  Serial.println("[RELAY] Sending pump pulse...");
  digitalWrite(PUMP_RELAY_PIN, HIGH);
  delay(PULSE_DURATION_MS);
  digitalWrite(PUMP_RELAY_PIN, LOW);
  Serial.println("[RELAY] Pump pulse sent");
}

// Envía pulsos a las válvulas para cambiar al modo especificado
// mode: 1 o 2
void sendValvePulse(int mode) {
  Serial.print("[RELAY] Switching to valve mode ");
  Serial.println(mode);
  
  if (mode == 1) {
    // Modo 1: Activar válvula 1 (NO)
    digitalWrite(VALVE1_RELAY_PIN, HIGH);
    digitalWrite(VALVE2_RELAY_PIN, LOW);
    delay(PULSE_DURATION_MS);
    digitalWrite(VALVE1_RELAY_PIN, LOW);
  } else if (mode == 2) {
    // Modo 2: Activar válvula 2 (NC)
    digitalWrite(VALVE1_RELAY_PIN, LOW);
    digitalWrite(VALVE2_RELAY_PIN, HIGH);
    delay(PULSE_DURATION_MS);
    digitalWrite(VALVE2_RELAY_PIN, LOW);
  }
  
  Serial.println("[RELAY] Valve pulse sent");
}

// ==================== MQTT State Publishing ====================

// Publica el estado actual de la bomba
void publishPumpState() {
  const char* msg = pumpState ? "ON" : "OFF";
  bool ok = mqtt.publish(TOPIC_PUMP_STATE, msg, true /*retain*/);
  
  Serial.print("[MQTT] publish ");
  Serial.print(TOPIC_PUMP_STATE);
  Serial.print(" = ");
  Serial.print(msg);
  Serial.println(ok ? " OK" : " FAIL");
}

// Publica el estado actual de las válvulas
void publishValveState() {
  char msg[2];
  msg[0] = '0' + valveMode;  // Convierte 1 o 2 a "1" o "2"
  msg[1] = '\0';
  
  bool ok = mqtt.publish(TOPIC_VALVE_STATE, msg, true /*retain*/);
  
  Serial.print("[MQTT] publish ");
  Serial.print(TOPIC_VALVE_STATE);
  Serial.print(" = ");
  Serial.print(msg);
  Serial.println(ok ? " OK" : " FAIL");
}

// ==================== Cloudflare Event Logging ====================

bool postEventToCloudflare(const char* device, const char* state) {
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
                "\",\"device\":\"" + device +
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

// ==================== Control Logic ====================

// Controla la bomba: intenta cambiar al estado targetState
// Usa sensor de feedback para evitar cambios innecesarios
void setPumpState(bool targetState) {
  Serial.print("[CONTROL] Pump target state: ");
  Serial.println(targetState ? "ON" : "OFF");
  
  // Leer estado actual del sensor
  bool actualState = readPumpSensor();
  
  if (actualState == targetState) {
    Serial.println("[CONTROL] Pump already in target state, skipping pulse");
    // Actualizamos la variable interna por si estaba desincronizada
    pumpState = actualState;
    publishPumpState();
    return;
  }
  
  // Enviar pulso de toggle al contactor
  sendPumpPulse();
  
  // Esperar un momento para que el contactor cambie
  delay(200);
  
  // Verificar el cambio
  actualState = readPumpSensor();
  pumpState = actualState;
  
  if (actualState == targetState) {
    Serial.println("[CONTROL] Pump state changed successfully");
  } else {
    Serial.println("[CONTROL] WARNING: Pump state did not change as expected!");
  }
  
  publishPumpState();
  postEventToCloudflare("pump", pumpState ? "ON" : "OFF");
}

// Controla las válvulas: cambia al modo targetMode (1 o 2)
void setValveMode(int targetMode) {
  if (targetMode != 1 && targetMode != 2) {
    Serial.println("[CONTROL] ERROR: Invalid valve mode. Use 1 or 2");
    return;
  }
  
  Serial.print("[CONTROL] Valve target mode: ");
  Serial.println(targetMode);
  
  if (valveMode == targetMode) {
    Serial.println("[CONTROL] Valves already in target mode, skipping pulse");
    publishValveState();
    return;
  }
  
  // Enviar pulso para cambiar modo
  sendValvePulse(targetMode);
  
  // Actualizar estado interno
  valveMode = targetMode;
  
  publishValveState();
  
  char modeStr[2] = {'0' + targetMode, '\0'};
  postEventToCloudflare("valve", modeStr);
}

// ==================== MQTT Message Handler ====================

// Esta función se llama cada vez que llega un mensaje MQTT
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String t = String(topic);
  String msg = payloadToString(payload, length);
  msg.toUpperCase();

  Serial.print("[MQTT] RX ");
  Serial.print(t);
  Serial.print(" : ");
  Serial.println(msg);

  // ===== Control de Bomba =====
  if (t == TOPIC_PUMP_SET) {
    if (msg == "ON" || msg == "1") {
      setPumpState(true);
    } else if (msg == "OFF" || msg == "0") {
      setPumpState(false);
    } else if (msg == "TOGGLE") {
      // Toggle: invertir el estado actual
      setPumpState(!pumpState);
    } else {
      Serial.println("[MQTT] Unknown pump command. Use: ON/OFF/TOGGLE");
    }
    return;
  }

  // ===== Control de Válvulas =====
  if (t == TOPIC_VALVE_SET) {
    if (msg == "1") {
      setValveMode(1);
    } else if (msg == "2") {
      setValveMode(2);
    } else if (msg == "TOGGLE") {
      // Toggle: alternar entre modo 1 y 2
      setValveMode(valveMode == 1 ? 2 : 1);
    } else {
      Serial.println("[MQTT] Unknown valve command. Use: 1/2/TOGGLE");
    }
    return;
  }
}

// -------------------- WiFi --------------------
bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  
  // Try primary WiFi credentials
  Serial.println();
  Serial.print("[WiFi] Conectando a ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 15000) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();

  // If primary failed, try secondary WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] ERROR: timeout con WiFi primaria. Intentando WiFi secundaria...");
    
    Serial.print("[WiFi] Conectando a ");
    Serial.println(WIFI_SSID_2);
    
    WiFi.begin(WIFI_SSID_2, WIFI_PASS_2);
    start = millis();
    
    while (WiFi.status() != WL_CONNECTED && (millis() - start) < 15000) {
      Serial.print(".");
      delay(500);
    }
    Serial.println();
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] ERROR: timeout conectando a ambas redes WiFi.");
    return false;
  }

  Serial.println("[WiFi] ✓ CONECTADO");
  Serial.print("[WiFi] SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("[WiFi] IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("[WiFi] RSSI: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
  
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

  Serial.print("[NTP] ✓ OK epoch: ");
  Serial.println((long)now);
  return true;
}

// ==================== MQTT TLS ====================
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

  Serial.println("[MQTT] ✓ CONECTADO");

  // Suscribirse a topics de comando
  mqtt.subscribe(TOPIC_PUMP_SET);
  Serial.print("[MQTT] Subscribed: ");
  Serial.println(TOPIC_PUMP_SET);
  
  mqtt.subscribe(TOPIC_VALVE_SET);
  Serial.print("[MQTT] Subscribed: ");
  Serial.println(TOPIC_VALVE_SET);

  // Leer sensores y publicar estado inicial
  pumpState = readPumpSensor();
  publishPumpState();
  publishValveState();
  
  return true;
}

// ==================== Arduino Setup & Loop ====================

void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println();
  Serial.println("========================================");
  Serial.println("   ESP32 Pool Control System v2.0");
  Serial.println("========================================");

  // Configurar pines de salida (relays)
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  pinMode(VALVE1_RELAY_PIN, OUTPUT);
  pinMode(VALVE2_RELAY_PIN, OUTPUT);
  
  // Estado inicial: todos los relays apagados
  digitalWrite(PUMP_RELAY_PIN, LOW);
  digitalWrite(VALVE1_RELAY_PIN, LOW);
  digitalWrite(VALVE2_RELAY_PIN, LOW);
  
  // Configurar pines de entrada (sensores analógicos)
  pinMode(PUMP_SENSE_PIN, INPUT);
  pinMode(VALVE_SENSE_PIN, INPUT);

  // Estado inicial
  pumpState = false;
  valveMode = 1;

  // 1) Conectar WiFi
  connectWiFi();

  // 2) Sincronizar hora para TLS
  syncTimeNTP();

  // 3) Configurar y conectar MQTT
  setupMqtt();
  connectMqtt();
  
  Serial.println("========================================");
  Serial.println("   Sistema listo");
  Serial.println("========================================");
}

void loop() {
  // Si se cae WiFi, intentamos recuperar
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Conexión perdida, reconectando...");
    connectWiFi();
  }

  // Si se cae MQTT, reconectamos
  if (!mqtt.connected()) {
    Serial.println("[MQTT] Conexión perdida, reconectando...");
    connectMqtt();
  }

  // Mantiene viva la conexión y procesa mensajes entrantes
  mqtt.loop();
}
