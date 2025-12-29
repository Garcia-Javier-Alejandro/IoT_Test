#pragma once

#define MQTT_HOST "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883

// Identidad del dispositivo (te ayuda a ordenar topics)
#define DEVICE_ID "esp32-pool-01"

// ==================== GPIO Pins ====================

// --- Outputs: Relay Control ---
#define PUMP_RELAY_PIN      18  // Standard relay controlling 220V AC pump
#define VALVE_RELAY_PIN     19  // Standard relay controlling 24V electrovalves (NC+NO in parallel)

// --- Inputs: Sensors ---
#define TEMP_SENSOR_PIN     21  // DS18B20 temperature probe (OneWire)

// ==================== MQTT Topics ====================

// Pump Control:
// TOPIC_PUMP_SET   = dashboard publica comando (ON/OFF/TOGGLE) -> ESP32 se suscribe
// TOPIC_PUMP_STATE = ESP32 publica estado actual (ON/OFF) -> dashboard se suscribe
#define TOPIC_PUMP_SET      "devices/" DEVICE_ID "/pump/set"
#define TOPIC_PUMP_STATE    "devices/" DEVICE_ID "/pump/state"

// Valve Control (unified - single mode):
// TOPIC_VALVE_SET   = dashboard publica modo (1/2/TOGGLE) -> ESP32 se suscribe
// TOPIC_VALVE_STATE = ESP32 publica modo actual (1/2) -> dashboard se suscribe
#define TOPIC_VALVE_SET     "devices/" DEVICE_ID "/valve/set"
#define TOPIC_VALVE_STATE   "devices/" DEVICE_ID "/valve/state"

// WiFi Status:
// TOPIC_WIFI_STATE = ESP32 publica estado WiFi (JSON: ssid, ip, rssi, quality) -> dashboard se suscribe
#define TOPIC_WIFI_STATE    "devices/" DEVICE_ID "/wifi/state"

// Timer Control:
// TOPIC_TIMER_SET   = dashboard publica config timer (JSON: mode, duration) -> ESP32 se suscribe
// TOPIC_TIMER_STATE = ESP32 publica estado timer (JSON: active, remaining, mode) -> dashboard se suscribe
#define TOPIC_TIMER_SET     "devices/" DEVICE_ID "/timer/set"
#define TOPIC_TIMER_STATE   "devices/" DEVICE_ID "/timer/state"

// Temperature:
// TOPIC_TEMP_STATE = ESP32 publica temperatura actual (°C) -> dashboard se suscribe
#define TOPIC_TEMP_STATE    "devices/" DEVICE_ID "/temperature/state"
