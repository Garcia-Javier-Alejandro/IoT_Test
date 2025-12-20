// dashboard/config.js
// Config pública del dashboard (se commitea sin secretos)

window.APP_CONFIG = {
  // Hostname de tu cluster HiveMQ Cloud (sin https://)
  HIVEMQ_HOST: "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud",

  // WebSocket Secure endpoint (para el navegador)
  // Puerto 8884 + path /mqtt (según Connection Details de HiveMQ Cloud)
  MQTT_WSS_URL: "wss://1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud:8884/mqtt",

  // Identidad (solo para armar topics y mostrar en UI si querés)
  DEVICE_ID: "esp32-valve-01",

  // Topics para Válvula 1 (deben coincidir con tu firmware)
  TOPIC_VALVE1_CMD: "devices/esp32-valve-01/valve1/set",    // dashboard -> ESP32
  TOPIC_VALVE1_STATE: "devices/esp32-valve-01/valve1/state", // ESP32 -> dashboard

  // Topics para Válvula 2
  TOPIC_VALVE2_CMD: "devices/esp32-valve-01/valve2/set",
  TOPIC_VALVE2_STATE: "devices/esp32-valve-01/valve2/state"
};
