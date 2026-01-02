#include <Arduino.h>

#include <WiFi.h>              // WiFi del ESP32
#include <WiFiClientSecure.h>  // Cliente TLS (HTTPS/MQTTS)
#include <WiFiManager.h>       // WiFiManager for captive portal provisioning
#include <PubSubClient.h>      // MQTT client (usa un Client por debajo)
#include <time.h>              // Para NTP (hora del sistema)
#include <OneWire.h>           // OneWire protocol for DS18B20
#include <DallasTemperature.h> // DS18B20 temperature sensor library

// =================== Project Includes ====================
#include "config.h"    // host/puertos/topics/device_id (NO secretos)
#include "secrets.h"   // wifi y mqtt user/pass (SECRETO)
#include "ca_cert.h"   // certificado Root CA (público)

// ==================== Timing Constants ====================
#define VALVE_SWITCH_DELAY      500       // Delay for valve switching (ms)
#define WIFI_CONNECT_TIMEOUT    15000     // Timeout for WiFi connection (ms)
#define NTP_SYNC_TIMEOUT        15000     // Timeout for NTP synchronization (ms)
#define WIFI_STATE_INTERVAL     30000     // Interval to publish WiFi state (ms)
#define TIMER_PUBLISH_INTERVAL  10000     // Interval to publish timer state (ms)
#define TEMP_PUBLISH_INTERVAL   60000     // Interval to publish temperature (ms) - 1 minute
#define MIN_VALID_EPOCH         1700000000L // Época mínima válida para NTP (Nov 2023)

// ==================== Hardware State ====================
static bool pumpState = false;     // Estado lógico de la bomba (ON/OFF)
static int valveMode = 1;          // Modo de válvulas: 1 o 2
static float currentTemperature = 0.0; // Temperatura actual en °C
static bool wifiProvisioned = false;   // Flag para saber si se completó provisioning

// ==================== Timer State ====================
static bool timerActive = false;   // Timer está corriendo
static int timerMode = 1;          // Modo del timer (1=Cascada, 2=Eyectores)
static uint32_t timerDuration = 0; // Duración total del timer en segundos
static uint32_t timerRemaining = 0; // Tiempo restante en segundos
static uint32_t timerLastUpdate = 0; // Último millis() para countdown

// ==================== Temperature Sensor ====================
// Setup OneWire on GPIO 33
OneWire oneWire(TEMP_SENSOR_PIN);
DallasTemperature tempSensor(&oneWire);

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

// ==================== Temperature Sensor ====================

/**
 * Lee la temperatura del sensor DS18B20
 * @return Temperatura en grados Celsius, o NAN si hay error
 */
float readTemperature() {
  tempSensor.requestTemperatures();
  float temp = tempSensor.getTempCByIndex(0);
  
  Serial.print("[SENSOR] Temperature: ");
  if (temp == DEVICE_DISCONNECTED_C) {
    Serial.println("ERROR - sensor desconectado");
    return NAN;
  }
  Serial.print(temp);
  Serial.println(" °C");
  
  return temp;
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

/**
 * Publica la temperatura actual al topic MQTT
 * Formato: número decimal con 1 decimal (ej: "25.3")
 */
void publishTemperature() {
  if (isnan(currentTemperature)) {
    Serial.println("[MQTT] Skip temperature publish - invalid reading");
    return;
  }
  
  char tempStr[8];
  dtostrf(currentTemperature, 4, 1, tempStr); // Format: "XX.X"
  
  bool ok = mqtt.publish(TOPIC_TEMP_STATE, tempStr, true);
  
  Serial.print("[MQTT] publish ");
  Serial.print(TOPIC_TEMP_STATE);
  Serial.print(" = ");
  Serial.print(tempStr);
  Serial.println(ok ? " OK" : " FAIL");
}

// ==================== Relay Control ====================

/**
 * Controla el relay de la bomba con estado continuo
 * @param targetState Estado deseado: true=ON, false=OFF
 */
void setPumpRelay(bool targetState) {
  Serial.print("[RELAY] Pump relay: ");
  Serial.println(targetState ? "ON" : "OFF");
  
  digitalWrite(PUMP_RELAY_PIN, targetState ? HIGH : LOW);
  pumpState = targetState;
}

/**
 * Controla el relay de las válvulas (NC+NO en paralelo)
 * LOW = Modo 1 (Cascada), HIGH = Modo 2 (Eyectores)
 * @param targetMode Modo deseado: 1 (Cascada) o 2 (Eyectores)
 */
void setValveRelay(int targetMode) {
  if (targetMode != 1 && targetMode != 2) {
    Serial.println("[RELAY] ERROR: Invalid valve mode. Use 1 or 2");
    return;
  }
  
  Serial.print("[RELAY] Valve relay: Mode ");
  Serial.println(targetMode);
  
  // Mode 1 (Cascada) = LOW, Mode 2 (Eyectores) = HIGH
  digitalWrite(VALVE_RELAY_PIN, (targetMode == 2) ? HIGH : LOW);
  valveMode = targetMode;
}

// ==================== Control Logic ====================

/**
 * Controla la bomba: establece el estado del relay y publica
 * @param targetState Estado deseado: true=ON, false=OFF
 */
void setPumpState(bool targetState) {
  Serial.print("[CONTROL] Pump target state: ");
  Serial.println(targetState ? "ON" : "OFF");
  
  setPumpRelay(targetState);
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
    Serial.println("[CONTROL] Valve already in target mode");
    publishValveState();
    return;
  }
  
  setValveRelay(targetMode);
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


// ==================== WiFi Connection (Provisioning) ====================

/**
 * Callback para when WiFiManager se conecta exitosamente
 */
void onWiFiConnect() {
  Serial.println("[WiFi] ✓ CONECTADO vía WiFiManager");
  Serial.print("[WiFi] SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("[WiFi] IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("[WiFi] RSSI: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
  wifiProvisioned = true;
}

/**
 * Callback para cuando WiFiManager entra en AP mode (provisioning)
 */
void onWiFiAPStart(WiFiManager* wm) {
  Serial.println("[WiFi] Modo AP iniciado - Captive Portal activo");
  Serial.print("[WiFi] Conectate a: ");
  Serial.println(wm->getConfigPortalSSID());
  Serial.println("[WiFi] Abre tu navegador a: http://192.168.4.1");
}

/**
 * Inicializa WiFi con WiFiManager (Captive Portal + Auto-Connect)
 * - Si no hay credenciales guardadas: abre portal cautivo
 * - Si hay credenciales guardadas: conecta automáticamente
 * - Timeout de 3 minutos para el portal (luego entra en reinicio)
 * @return true si se conectó a WiFi, false si falló
 */
bool initWiFiProvisioning() {
  Serial.println("[WiFi] Inicializando WiFiManager...");
  
  // Crear instancia de WiFiManager
  WiFiManager wm;
  
  // Configurar callbacks
  wm.setAPCallback(onWiFiAPStart);
  
  // OPTIONAL: Uncomment to reset saved WiFi credentials for testing
  wm.resetSettings();
  Serial.println("[WiFi] Credenciales de WiFi reseteadas. Abriendo portal cautivo...");
  
  // Configurar portal (3 minutos timeout, auto-reset si falla)
  wm.setConfigPortalTimeout(180);  // 3 minutos
  
  // Enable specific features for better captive portal
  wm.setWebServerCallback([]() {
    Serial.println("[WiFi] Servidor web iniciado en 192.168.4.1");
  });
  
  // Auto-conectar con credenciales guardadas
  // Si no tiene credenciales, abre el portal cautivo
  bool connected = wm.autoConnect("ESP32-Pool-Setup", "");
  
  if (!connected) {
    Serial.println("[WiFi] TIMEOUT: No se ingresaron credenciales en el portal");
    // El ESP32 se reiniciará automáticamente después del timeout
    return false;
  }
  
  // Callback manual para cuando se conecta
  onWiFiConnect();
  
  return true;
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
 * 2. Publica estado inicial de todos los componentes (pump, valve, wifi, timer)
 * 3. Lee y publica temperatura inicial
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

  // Publicar estado inicial
  publishPumpState();
  publishValveState();
  publishWiFiState();
  publishTimerState();
  
  // Leer y publicar temperatura inicial
  currentTemperature = readTemperature();
  publishTemperature();
  
  return true;
}

// ==================== Arduino Setup & Loop ====================

/**
 * Inicialización del sistema (ejecutada una vez al arrancar)
 * Secuencia:
 * 1. Configura Serial para debug
 * 2. Configura pines de salida (relays para bomba y válvulas)
 * 3. Inicializa sensor de temperatura DS18B20
 * 4. Estado inicial: todos los relays apagados
 * 5. Conecta WiFi (probando múltiples redes)
 * 6. Sincroniza hora con NTP (necesario para TLS)
 * 7. Configura y conecta MQTT con TLS
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
  pinMode(VALVE_RELAY_PIN, OUTPUT);
  
  // Estado inicial: todos los relays apagados
  digitalWrite(PUMP_RELAY_PIN, LOW);
  digitalWrite(VALVE_RELAY_PIN, LOW);

  // Inicializar sensor de temperatura DS18B20
  Serial.println("[SENSOR] Inicializando DS18B20...");
  tempSensor.begin();
  int deviceCount = tempSensor.getDeviceCount();
  Serial.print("[SENSOR] Dispositivos DS18B20 encontrados: ");
  Serial.println(deviceCount);

  // Estado inicial
  pumpState = false;
  valveMode = 1;
  currentTemperature = 0.0;

  // 1) Inicializar WiFi con provisioning (Captive Portal)
  initWiFiProvisioning();

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
 * 3. Leer y publicar temperatura periódicamente
 * 4. Detectar y recuperar pérdida de conexión WiFi
 * 5. Detectar y recuperar pérdida de conexión MQTT
 * 6. Procesar mensajes MQTT entrantes (mqtt.loop)
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
  
  // Leer y publicar temperatura periódicamente (cada 1 minuto)
  static uint32_t lastTempUpdate = 0;
  if (millis() - lastTempUpdate > TEMP_PUBLISH_INTERVAL) {
    lastTempUpdate = millis();
    currentTemperature = readTemperature();
    if (mqtt.connected()) {
      publishTemperature();
    }
  }
  
  // Si se cae WiFi, WiFiManager intentará reconectar automáticamente
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Conexión perdida, intentando recuperar...");
    // WiFiManager maneja la reconexión automáticamente
    // pero podemos forzar un intento con timeout corto
    WiFiManager wm;
    wm.setConfigPortalTimeout(30);  // 30 segundos para reconectar
    wm.autoConnect();  // Si falla, reinicia después de timeout
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
