#pragma once

#define MQTT_HOST "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883

// Identidad del dispositivo (te ayuda a ordenar topics)
#define DEVICE_ID "esp32-pool-01"

// ==================== GPIO Pins ====================

// --- Outputs: Relay Control (via transistors) ---
#define PUMP_RELAY_PIN      19  // Latching pulse for pump contactor
#define VALVE1_RELAY_PIN    18  // NO valve relay (Mode 1)
#define VALVE2_RELAY_PIN    17  // NC valve relay (Mode 2)

// --- Inputs: State Feedback Sensors ---
#define PUMP_SENSE_PIN      36  // ZMPT101B analog input (ADC1_0) - 220V pump detection
#define VALVE_SENSE_PIN     39  // 24V sensor analog input (ADC1_3) - valve power detection

// ==================== Control Parameters ====================

// Latching relay pulse duration (milliseconds)
#define PULSE_DURATION_MS   100

// ADC threshold for voltage detection (0-4095 range)
// If ADC reading > threshold, voltage is considered present
#define VOLTAGE_THRESHOLD   1000

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
