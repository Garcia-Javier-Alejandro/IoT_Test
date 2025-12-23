#include <Arduino.h>

#include <WiFi.h>              // WiFi del ESP32
#include <WiFiClientSecure.h>  // Cliente TLS (HTTPS/MQTTS)
#include <PubSubClient.h>      // MQTT client (usa un Client por debajo)
#include <time.h>              // Para NTP (hora del sistema) 

// =================== Project Includes ====================
#include "config.h"    // host/puertos/topics/device_id (NO secretos)
#include "secrets.h"   // wifi y mqtt user/pass (SECRETO, no va a GitHub)
#include "ca_cert.h"   // certificado Root CA (público)

// ==================== Constants ====================
const int PULSE_DURATION_MS = 100;        // Duración del pulso para relays (ms)
const int RELAY_SETTLE_DELAY = 200;       // Tiempo para que el relay se estabilice (ms)
const int VALVE_SWITCH_DELAY = 500;       // Tiempo para que las válvulas cambien completamente (ms)
const int WIFI_CONNECT_TIMEOUT = 15000;   // Timeout para conexión WiFi (ms)
const int NTP_SYNC_TIMEOUT = 15000;       // Timeout para sincronización NTP (ms)
const int WIFI_STATE_INTERVAL = 30000;    // Intervalo para publicar estado WiFi (ms)
const int TIMER_PUBLISH_INTERVAL = 10000; // Intervalo para publicar estado del timer (ms)
const long MIN_VALID_EPOCH = 1700000000L; // Época mínima válida para NTP (Nov 2023)

// ==================== Hardware State ====================
static bool pumpState = false;     // Estado lógico de la bomba (ON/OFF)
static int valveMode = 1;          // Modo de válvulas: 1 o 2

// ==================== Timer State ====================
static bool timerActive = false;   // Timer está corriendo
static int timerMode = 1;          // Modo del timer (1=Cascada, 2=Eyectores)
static uint32_t timerDuration = 0; // Duración total del timer en segundos
static uint32_t timerRemaining = 0; // Tiempo restante en segundos
static uint32_t timerLastUpdate = 0; // Último millis() para countdown

// ==================== MQTT/TLS ====================
// Cliente TLS (se usa para conectar a un servidor con certificado)
WiFiClientSecure tlsClient;

// Cliente MQTT que viaja por el tlsClient
PubSubClient mqtt(tlsClient);

// ==================== Helper Functions ====================

/**
 * Convierte un payload MQTT (bytes) a String
 * @param payload Array de bytes recibido del broker MQTT
 * @param length Longitud del payload en bytes
 * @return String con el contenido del payload (trimmed)
 */
String payloadToString(const byte* payload, unsigned int length) {
  String s;
  s.reserve(length);
  for (unsigned int i = 0; i < length; i++) s += (char)payload[i];
  s.trim();
  return s;
}

// ==================== State Sensing ====================

/**
 * Lee el sensor de voltaje de la bomba (220V AC via ZMPT101B)
 * Usa el ADC del ESP32 para leer el voltaje rectificado del sensor
 * @return true si detecta voltaje por encima del umbral (bomba ON), false en caso contrario
 */
bool readPumpSensor() {
  int adcValue = analogRead(PUMP_SENSE_PIN);
  bool detected = (adcValue > VOLTAGE_THRESHOLD);
  
  Serial.print("[SENSOR] Pump ADC=");
  Serial.print(adcValue);
  Serial.print(" -> ");
  Serial.println(detected ? "ON" : "OFF");
  
  return detected;
}

/**
 * Lee el sensor de voltaje de las válvulas (24V DC)
 * Detecta si las válvulas están recibiendo alimentación
 * @return true si detecta voltaje por encima del umbral (válvulas energizadas), false en caso contrario
 */
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

/**
 * Envía un pulso al relay para alternar (toggle) el contactor de la bomba
 * El relay es tipo "latching" o "biestable", cada pulso cambia el estado ON<->OFF
 * @note Usa PULSE_DURATION_MS para la duración del pulso
 */
void sendPumpPulse() {
  Serial.println("[RELAY] Sending pump pulse...");
  digitalWrite(PUMP_RELAY_PIN, HIGH);
  delay(PULSE_DURATION_MS);
  digitalWrite(PUMP_RELAY_PIN, LOW);
  Serial.println("[RELAY] Pump pulse sent");
}

/**
 * Envía pulsos a las válvulas para cambiar al modo especificado
 * Sistema de 2 válvulas con relays latching que controlan el flujo:
 * - Modo 1: Cascada (válvula 1 activa, normalmente abierta)
 * - Modo 2: Eyectores (válvula 2 activa, normalmente cerrada)
 * @param mode Modo de válvulas: 1 (Cascada) o 2 (Eyectores)
 */
void sendValvePulse(int mode) {
  Serial.print("[RELAY] Switching to valve mode ");
  Serial.println(mode);
  
  if (mode == 1) {
    // Modo 1: Activar válvula 1 (NO - Cascada)
    digitalWrite(VALVE1_RELAY_PIN, HIGH);
    digitalWrite(VALVE2_RELAY_PIN, LOW);
    delay(PULSE_DURATION_MS);
    digitalWrite(VALVE1_RELAY_PIN, LOW);
  } else if (mode == 2) {
    // Modo 2: Activar válvula 2 (NC - Eyectores)
    digitalWrite(VALVE1_RELAY_PIN, LOW);
    digitalWrite(VALVE2_RELAY_PIN, HIGH);
    delay(PULSE_DURATION_MS);
    digitalWrite(VALVE2_RELAY_PIN, LOW);
  }
  
  Serial.println("[RELAY] Valve pulse sent");
}

// ==================== MQTT State Publishing ====================

/**
 * Publica el estado actual de la bomba al topic MQTT
 * Usa retain=true para que el último valor quede almacenado en el broker
 */
void publishPumpState() {
  const char* msg = pumpState ? "ON" : "OFF";
  bool ok = mqtt.publish(TOPIC_PUMP_STATE, msg, true /*retain*/);
  
  Serial.print("[MQTT] publish ");
  Serial.print(TOPIC_PUMP_STATE);
  Serial.print(" = ");
  Serial.print(msg);
  Serial.println(ok ? " OK" : " FAIL");
}

/**
 * Publica el estado actual de las válvulas al topic MQTT
 * Envía "1" o "2" según el modo activo
 */
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

/**
 * Publica el estado WiFi completo en formato JSON
 * Incluye: status, SSID, IP, RSSI (señal), quality (calidad)
 * La calidad se determina basándose en el RSSI:
 * - excellent: >= -50 dBm
 * - good: >= -60 dBm
 * - fair: >= -70 dBm
 * - weak: < -70 dBm
 */
void publishWiFiState() {
  if (WiFi.status() != WL_CONNECTED) {
    mqtt.publish(TOPIC_WIFI_STATE, "{\"status\":\"disconnected\"}", true);
    return;
  }
  
  int rssi = WiFi.RSSI();
  String quality;
  
  // Determinar calidad de señal basado en RSSI
  if (rssi >= -50) quality = "excellent";
  else if (rssi >= -60) quality = "good";
  else if (rssi >= -70) quality = "fair";
  else quality = "weak";
  
  // Construir JSON
  String json = "{";
  json += "\"status\":\"connected\",";
  json += "\"ssid\":\"" + WiFi.SSID() + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(rssi) + ",";
  json += "\"quality\":\"" + quality + "\"";
  json += "}";
  
  bool ok = mqtt.publish(TOPIC_WIFI_STATE, json.c_str(), true /*retain*/);
  
  Serial.print("[MQTT] publish ");
  Serial.print(TOPIC_WIFI_STATE);
  Serial.print(" = ");
  Serial.print(json);
  Serial.println(ok ? " OK" : " FAIL");
}

/**
 * Publica el estado del timer en formato JSON
 * Incluye: active (bool), remaining (segundos), mode (1 o 2), duration (segundos totales)
 */
void publishTimerState() {
  String json = "{";
  json += "\"active\":" + String(timerActive ? "true" : "false") + ",";
  json += "\"remaining\":" + String(timerRemaining) + ",";
  json += "\"mode\":" + String(timerMode) + ",";
  json += "\"duration\":" + String(timerDuration);
  json += "}";
  
  bool ok = mqtt.publish(TOPIC_TIMER_STATE, json.c_str(), true /*retain*/);
  
  Serial.print("[MQTT] publish ");
  Serial.print(TOPIC_TIMER_STATE);
  Serial.print(" = ");
  Serial.print(json);
  Serial.println(ok ? " OK" : " FAIL");
}

// ==================== Control Logic ====================

/**
 * Controla la bomba: intenta cambiar al estado targetState
 * Usa sensor de feedback para:
 * 1. Verificar el estado actual antes de enviar pulso
 * 2. Evitar pulsos innecesarios si ya está en el estado deseado
 * 3. Confirmar que el cambio se realizó correctamente
 * @param targetState Estado deseado: true=ON, false=OFF
 */
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
  delay(RELAY_SETTLE_DELAY);
  
  // Verificar el cambio
  actualState = readPumpSensor();
  pumpState = actualState;
  
  if (actualState == targetState) {
    Serial.println("[CONTROL] Pump state changed successfully");
  } else {
    Serial.println("[CONTROL] WARNING: Pump state did not change as expected!");
  }
  
  publishPumpState();
}

/**
 * Controla las válvulas: cambia al modo especificado
 * Verifica que el modo sea válido (1 o 2) y evita pulsos innecesarios
 * si ya está en el modo deseado
 * @param targetMode Modo deseado: 1 (Cascada) o 2 (Eyectores)
 */
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
}

// ==================== Timer Control ====================

/**
 * Inicia el timer con modo y duración especificados
 * Secuencia:
 * 1. Valida parámetros (modo 1 o 2, duración > 0)
 * 2. Configura variables del timer
 * 3. Establece modo de válvulas
 * 4. Enciende la bomba
 * 5. Publica estado inicial
 * @param mode Modo de válvulas: 1 (Cascada) o 2 (Eyectores)
 * @param durationSeconds Duración en segundos
 */
void startTimer(int mode, uint32_t durationSeconds) {
  if (mode != 1 && mode != 2) {
    Serial.println("[TIMER] ERROR: Invalid mode. Use 1 or 2");
    return;
  }
  
  if (durationSeconds == 0) {
    Serial.println("[TIMER] ERROR: Duration must be > 0");
    return;
  }
  
  Serial.print("[TIMER] Starting timer: mode=");
  Serial.print(mode);
  Serial.print(", duration=");
  Serial.print(durationSeconds);
  Serial.println("s");
  
  // Configurar timer
  timerActive = true;
  timerMode = mode;
  timerDuration = durationSeconds;
  timerRemaining = durationSeconds;
  timerLastUpdate = millis();
  
  // Establecer modo de válvulas
  setValveMode(mode);
  delay(VALVE_SWITCH_DELAY); // Esperar que válvulas cambien completamente
  
  // Encender bomba
  setPumpState(true);
  
  // Publicar estado inicial del timer
  publishTimerState();
}

/**
 * Detiene el timer
 * Apaga la bomba y publica el nuevo estado (inactive)
 */
void stopTimer() {
  if (!timerActive) return;
  
  Serial.println("[TIMER] Stopping timer");
  
  timerActive = false;
  timerRemaining = 0;
  
  // Apagar bomba
  setPumpState(false);
  
  // Publicar estado del timer
  publishTimerState();
}

/**
 * Actualiza el countdown del timer (llamar en loop)
 * Decrementa el tiempo restante cada segundo y publica el estado periódicamente
 * Cuando el timer expira (remaining=0), detiene automáticamente
 */
void updateTimer() {
  if (!timerActive) return;
  
  uint32_t now = millis();
  uint32_t elapsed = (now - timerLastUpdate) / 1000; // Segundos transcurridos
  
  if (elapsed >= 1) {
    timerLastUpdate = now;
    
    if (timerRemaining > 0) {
      timerRemaining--;
      
      // Publicar estado cada 10 segundos o cuando quede poco tiempo
      static uint32_t lastPublish = 0;
      if (timerRemaining % 10 == 0 || timerRemaining <= 10 || (now - lastPublish) > TIMER_PUBLISH_INTERVAL) {
        lastPublish = now;
        publishTimerState();
      }
      
      // Mostrar tiempo restante en Serial
      if (timerRemaining % 60 == 0 || timerRemaining <= 60) {
        Serial.print("[TIMER] Remaining: ");
        Serial.print(timerRemaining / 60);
        Serial.print("m ");
        Serial.print(timerRemaining % 60);
        Serial.println("s");
      }
    } else {
      // Timer finalizado
      Serial.println("[TIMER] Time expired!");
      stopTimer();
    }
  }
}

// ==================== MQTT Message Handler ====================

/**
 * Callback invocado cuando llega un mensaje MQTT
 * Maneja 3 tipos de comandos:
 * 1. Bomba (TOPIC_PUMP_SET): ON/OFF/TOGGLE
 * 2. Válvulas (TOPIC_VALVE_SET): 1/2/TOGGLE
 * 3. Timer (TOPIC_TIMER_SET): JSON con {mode, duration}
 * @param topic Topic del mensaje recibido
 * @param payload Contenido del mensaje (bytes)
 * @param length Longitud del payload
 */
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

  // ===== Control de Timer =====
  if (t == TOPIC_TIMER_SET) {
    // Parsear JSON simple: {"mode": 1, "duration": 3600}
    // Nota: Usa parsing manual en lugar de ArduinoJson para ahorrar memoria
    int modeIdx = msg.indexOf("\"mode\":");
    int durationIdx = msg.indexOf("\"duration\":");
    
    if (modeIdx == -1 || durationIdx == -1) {
      Serial.println("[MQTT] ERROR: Timer command must be JSON with mode and duration");
      return;
    }
    
    // Extraer valores (parsing simple)
    int modeStart = msg.indexOf(":", modeIdx) + 1;
    int modeEnd = msg.indexOf(",", modeStart);
    if (modeEnd == -1) modeEnd = msg.indexOf("}", modeStart);
    String modeStr = msg.substring(modeStart, modeEnd);
    modeStr.trim();
    int mode = modeStr.toInt();
    
    int durationStart = msg.indexOf(":", durationIdx) + 1;
    int durationEnd = msg.indexOf("}", durationStart);
    if (durationEnd == -1) durationEnd = msg.length();
    String durationStr = msg.substring(durationStart, durationEnd);
    durationStr.trim();
    uint32_t duration = durationStr.toInt();
    
    if (duration == 0) {
      // Comando para detener timer
      Serial.println("[MQTT] Timer stop command received");
      stopTimer();
    } else {
      // Comando para iniciar timer
      Serial.print("[MQTT] Timer start command: mode=");
      Serial.print(mode);
      Serial.print(", duration=");
      Serial.println(duration);
      startTimer(mode, duration);
    }
    return;
  }
}


// ==================== WiFi Connection ====================

/**
 * Estructura para definir redes WiFi
 */
struct WiFiNetwork {
  const char* ssid;
  const char* password;
};

/**
 * Helper: Intenta conectar a una red WiFi específica
 * @param ssid SSID de la red
 * @param password Contraseña de la red
 * @return true si se conectó exitosamente, false si timeout
 */
bool tryConnectToNetwork(const char* ssid, const char* password) {
  Serial.println();
  Serial.print("[WiFi] Conectando a ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  uint32_t start = millis();
  
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();
  
  return (WiFi.status() == WL_CONNECTED);
}

/**
 * Conecta a WiFi probando múltiples redes en orden de prioridad
 * Intenta conectar a 3 redes definidas en secrets.h
 * @return true si logró conectar a alguna red, false si todas fallaron
 */
bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  
  // Definir array de redes a intentar (en orden de prioridad)
  WiFiNetwork networks[] = {
    {WIFI_SSID, WIFI_PASS},
    {WIFI_SSID_2, WIFI_PASS_2},
    {WIFI_SSID_3, WIFI_PASS_3}
  };
  const int numNetworks = 3;
  
  // Intentar conectar a cada red
  for (int i = 0; i < numNetworks; i++) {
    if (tryConnectToNetwork(networks[i].ssid, networks[i].password)) {
      // Conexión exitosa
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
    
    // Si no es la última red, informar y continuar
    if (i < numNetworks - 1) {
      Serial.print("[WiFi] ERROR: timeout con red ");
      Serial.print(i + 1);
      Serial.println(". Intentando siguiente...");
    }
  }
  
  // Todas las redes fallaron
  Serial.println("[WiFi] ERROR: timeout conectando a todas las redes WiFi.");
  return false;
}

// ==================== NTP Time Synchronization ====================

/**
 * Sincroniza el reloj del ESP32 con servidores NTP
 * IMPORTANTE: TLS valida fechas del certificado. Si el ESP32 tiene hora
 * incorrecta, puede fallar el handshake. Por eso sincronizamos NTP ANTES
 * de conectar MQTT TLS.
 * @return true si sincronizó exitosamente, false si timeout
 */
bool syncTimeNTP() {
  Serial.println("[NTP] Sincronizando hora...");
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  time_t now = time(nullptr);
  const uint32_t start = millis();

  // Esperamos hasta que la hora sea "razonable" (después de Nov 2023)
  while (now < MIN_VALID_EPOCH && (millis() - start) < NTP_SYNC_TIMEOUT) {
    Serial.print(".");
    delay(500);
    now = time(nullptr);
  }
  Serial.println();

  if (now < MIN_VALID_EPOCH) {
    Serial.println("[NTP] WARN: no sincronizó (timeout). TLS puede fallar.");
    return false;
  }

  Serial.print("[NTP] ✓ OK epoch: ");
  Serial.println((long)now);
  return true;
}

// ==================== MQTT TLS Connection ====================

/**
 * Configura el cliente MQTT con TLS
 * - Establece servidor y puerto (definidos en config.h)
 * - Registra callback para mensajes entrantes
 * - Carga certificado CA raíz para validación TLS
 */
void setupMqtt() {
  // Endpoint MQTT TLS (8883) del broker
  mqtt.setServer(MQTT_HOST, MQTT_PORT);

  // Callback para mensajes entrantes
  mqtt.setCallback(onMqttMessage);

  // Cargamos la CA raíz para que el ESP32 pueda validar el certificado del broker
  tlsClient.setCACert(LETS_ENCRYPT_ISRG_ROOT_X1);
}

/**
 * Conecta al broker MQTT con autenticación
 * Después de conectar:
 * 1. Se suscribe a topics de comando (pump, valve, timer)
 * 2. Lee sensores para sincronizar estado
 * 3. Publica estado inicial de todos los componentes
 * @return true si conectó exitosamente, false en caso contrario
 */
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

  mqtt.subscribe(TOPIC_TIMER_SET);
  Serial.print("[MQTT] Subscribed: ");
  Serial.println(TOPIC_TIMER_SET);

  // Leer sensores y publicar estado inicial
  pumpState = readPumpSensor();
  publishPumpState();
  publishValveState();
  publishWiFiState();
  publishTimerState();
  
  return true;
}

// ==================== Arduino Setup & Loop ====================

/**
 * Inicialización del sistema (ejecutada una vez al arrancar)
 * Secuencia:
 * 1. Configura Serial para debug
 * 2. Configura pines (relays como OUTPUT, sensores como INPUT)
 * 3. Estado inicial: todos los relays apagados
 * 4. Conecta WiFi (probando múltiples redes)
 * 5. Sincroniza hora con NTP (necesario para TLS)
 * 6. Configura y conecta MQTT con TLS
 */
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

/**
 * Loop principal (ejecutado continuamente)
 * Responsabilidades:
 * 1. Actualizar countdown del timer
 * 2. Publicar estado WiFi periódicamente
 * 3. Detectar y recuperar pérdida de conexión WiFi
 * 4. Detectar y recuperar pérdida de conexión MQTT
 * 5. Procesar mensajes MQTT entrantes (mqtt.loop)
 */
void loop() {
  // Actualizar timer si está activo
  updateTimer();
  
  // Publicar estado WiFi periódicamente
  static uint32_t lastWiFiUpdate = 0;
  if (millis() - lastWiFiUpdate > WIFI_STATE_INTERVAL) {
    lastWiFiUpdate = millis();
    if (mqtt.connected()) {
      publishWiFiState();
    }
  }
  
  // Si se cae WiFi, intentamos recuperar
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Conexión perdida, reconectando...");
    connectWiFi();
    if (mqtt.connected()) publishWiFiState();
  }

  // Si se cae MQTT, reconectamos
  if (!mqtt.connected()) {
    Serial.println("[MQTT] Conexión perdida, reconectando...");
    connectMqtt();
  }

  // Mantiene viva la conexión y procesa mensajes entrantes
  mqtt.loop();
}
