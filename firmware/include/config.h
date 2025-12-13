#pragma once

#define MQTT_HOST "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883

// Identidad del dispositivo (te ayuda a ordenar topics)
#define DEVICE_ID "esp32-01"

// Topics (dashboard -> dispositivo) y (dispositivo -> dashboard)
#define TOPIC_LED_SET    "devices/" DEVICE_ID "/led/gpio4/set"
#define TOPIC_LED_STATE  "devices/" DEVICE_ID "/led/gpio4/state"
