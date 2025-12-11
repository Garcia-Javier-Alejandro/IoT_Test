/* 
  Firmware para ESP32 que permite controlar un LED de forma remota mediante MQTT. 
  El dispositivo se conecta a WiFi, escucha comandos ON/OFF desde el tópico 
  "casa/led1/cmd" y publica su estado real en "casa/led1/status" (retained) para 
  sincronizarse con un dashboard web.
*/


#include <WiFi.h>
#include <PubSubClient.h>

// ---------------------------------------------------------------------------
// CONFIGURACIÓN DE RED WiFi
// ---------------------------------------------------------------------------
const char* ssid     = "TU_WIFI";     // SSID de tu red WiFi
const char* password = "TU_PASS";     // Contraseña de tu WiFi

// ---------------------------------------------------------------------------
// CONFIGURACIÓN DEL BROKER MQTT
// ---------------------------------------------------------------------------
const char* mqtt_server = "broker.hivemq.com";  // Broker MQTT público (sin auth)
const int   mqtt_port   = 1883;                 // Puerto estándar sin TLS

WiFiClient espClient;
PubSubClient client(espClient);

// ---------------------------------------------------------------------------
// DEFINICIÓN DE PINES Y TÓPICOS MQTT
// ---------------------------------------------------------------------------
const int LED_PIN = 2;  // GPIO donde está conectado el LED; GPIO2 es seguro para pruebas

// Tópico por el que el dashboard ENVÍA comandos para controlar el LED
const char* TOPIC_CMD = "casa/led1/cmd";

// Tópico donde el ESP32 PUBLICA el estado real del LED
const char* TOPIC_STATUS = "casa/led1/status";


// ---------------------------------------------------------------------------
// FUNCIÓN: PUBLICA EL ESTADO ACTUAL DEL LED (retained = true)
// ---------------------------------------------------------------------------
void publishState(bool isOn) {
  client.publish(
    TOPIC_STATUS,
    isOn ? "ON" : "OFF",
    true   // "retained": permite que el dashboard vea el estado incluso si recarga la página
  );
}


// ---------------------------------------------------------------------------
// CALLBACK: SE EJECUTA CUANDO LLEGA UN MENSAJE MQTT
// Maneja los comandos ON/OFF recibidos desde el dashboard
// ---------------------------------------------------------------------------
void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  msg.trim();

  if (msg == "ON") {
    digitalWrite(LED_PIN, HIGH);
    publishState(true);
  }
  else if (msg == "OFF") {
    digitalWrite(LED_PIN, LOW);
    publishState(false);
  }
}


// ---------------------------------------------------------------------------
// FUNCIÓN: SE RECONOCE AUTOMÁTICAMENTE AL BROKER EN CASO DE CORTE
// ---------------------------------------------------------------------------
void reconnect() {
  while (!client.connected()) {
    Serial.print("Intentando conectar al broker MQTT... ");

    if (client.connect("ESP32_LED_Client")) {  
      Serial.println("Conectado!");

      // Suscribirse al tópico de comandos
      client.subscribe(TOPIC_CMD);

      // Publicar el estado inicial del LED cuando vuelve la conexión
      publishState(digitalRead(LED_PIN));
    } 
    else {
      Serial.println("Fallo. Reintentando en 1s...");
      delay(1000);
    }
  }
}


// ---------------------------------------------------------------------------
// SETUP DEL ESP32
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);  // Estado inicial

  // Conectar a WiFi
  WiFi.begin(ssid, password);
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println("\nWiFi conectado!");
  Serial.print("IP asignada: ");
  Serial.println(WiFi.localIP());

  // Configuración del cliente MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}


// ---------------------------------------------------------------------------
// LOOP PRINCIPAL
// ---------------------------------------------------------------------------
void loop() {
  // Si se pierde la conexión MQTT, intentar reconectar
  if (!client.connected()) {
    reconnect();
  }

  // Mantiene la comunicación MQTT viva
  client.loop();
}
