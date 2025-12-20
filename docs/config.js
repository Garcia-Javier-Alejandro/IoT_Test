// dashboard/config.js
// Config pública del dashboard (se commitea sin secretos)

window.APP_CONFIG = {
  // Hostname de tu cluster HiveMQ Cloud (sin https://)
  HIVEMQ_HOST: "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud",

  // WebSocket Secure endpoint (para el navegador)
  // Puerto 8884 + path /mqtt (según Connection Details de HiveMQ Cloud)
  MQTT_WSS_URL: "wss://1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud:8884/mqtt",

  // Identidad (solo para armar topics y mostrar en UI si querés)
  DEVICE_ID: "esp32-01",

  // Topics (deben coincidir con tu firmware)
  TOPIC_CMD: "devices/esp32-01/valve/gpio19/set",    // dashboard -> ESP32
  TOPIC_STATE: "devices/esp32-01/valve/gpio19/state" // ESP32 -> dashboard
};
