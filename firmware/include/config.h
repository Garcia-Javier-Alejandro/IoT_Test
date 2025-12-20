#pragma once

#define MQTT_HOST "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883

// Identidad del dispositivo (te ayuda a ordenar topics)
#define DEVICE_ID "esp32-valve-01"

// Topics:
// TOPIC_VALVE_SET   = dashboard publica comandos (ON/OFF) -> ESP32 se suscribe
// TOPIC_VALVE_STATE = ESP32 publica estado (ON/OFF) -> dashboard se suscribe
#define TOPIC_VALVE_SET    "devices/" DEVICE_ID"/valve/gpio19/set"
#define TOPIC_VALVE_STATE  "devices/" DEVICE_ID "/valve/gpio19/state"
