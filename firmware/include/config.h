#pragma once

#define MQTT_HOST "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883

// Identidad del dispositivo (te ayuda a ordenar topics)
#define DEVICE_ID "esp32-valve-01"

// GPIO Pins
#define VALVE1_PIN 19
#define VALVE2_PIN 16

// Topics para Válvula 1:
// TOPIC_VALVE1_SET   = dashboard publica comandos (ON/OFF) -> ESP32 se suscribe
// TOPIC_VALVE1_STATE = ESP32 publica estado (ON/OFF) -> dashboard se suscribe
#define TOPIC_VALVE1_SET    "devices/" DEVICE_ID"/valve1/set"
#define TOPIC_VALVE1_STATE  "devices/" DEVICE_ID "/valve1/state"

// Topics para Válvula 2:
#define TOPIC_VALVE2_SET    "devices/" DEVICE_ID"/valve2/set"
#define TOPIC_VALVE2_STATE  "devices/" DEVICE_ID "/valve2/state"
