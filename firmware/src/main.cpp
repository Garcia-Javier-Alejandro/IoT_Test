// ESP32 - Conexión WiFi (STA) + Webserver para controlar GPIO4
// LED: GPIO4 -> resistencia -> LED -> GND  (HIGH=ON, LOW=OFF)

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>

static const int LED_PIN = 4;
static bool ledState = false;

// WiFi credenciales
const char* WIFI_SSID = "ClaroWifi6545";
const char* WIFI_PASS = "123456789";

WebServer server(80);

// Aplica el estado lógico al pin físico
void applyLed() {
  digitalWrite(LED_PIN, ledState ? HIGH : LOW);
}

String htmlPage() {
  String s;
  s += "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>";
  s += "<title>ESP32 GPIO4</title></head><body style='font-family:Arial;padding:16px'>";
  s += "<h2>GPIO4 LED Control</h2>";
  s += "<p>Estado: <b>";
  s += (ledState ? "ON" : "OFF");
  s += "</b></p>";
  s += "<p>";
  s += "<a href='/on'><button style='padding:12px 18px'>Encender</button></a> ";
  s += "<a href='/off'><button style='padding:12px 18px'>Apagar</button></a> ";
  s += "<a href='/toggle'><button style='padding:12px 18px'>Toggle</button></a>";
  s += "</p>";
  s += "<p><a href='/state'>/state (JSON)</a></p>";
  s += "</body></html>";
  return s;
}

void handleRoot() { server.send(200, "text/html", htmlPage()); }

void handleOn() {
  ledState = true; applyLed();
  server.sendHeader("Location", "/");
  server.send(302, "text/plain", "ON");
}

void handleOff() {
  ledState = false; applyLed();
  server.sendHeader("Location", "/");
  server.send(302, "text/plain", "OFF");
}

void handleToggle() {
  ledState = !ledState; applyLed();
  server.sendHeader("Location", "/");
  server.send(302, "text/plain", "TOGGLE");
}

void handleState() {
  String json = String("{\"gpio\":4,\"state\":\"") + (ledState ? "ON" : "OFF") + "\"}";
  server.send(200, "application/json", json);
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);

  Serial.println();
  Serial.print("Conectando a WiFi SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  // Log de progreso: puntos mientras intenta conectar
  const uint32_t startMs = millis();
  const uint32_t timeoutMs = 20000; // 20s

  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < timeoutMs) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi conectado.");
    Serial.print("IP asignada: ");
    Serial.println(WiFi.localIP());
    Serial.print("Abrí en el navegador: http://");
    Serial.print(WiFi.localIP());
    Serial.println("/");
  } else {
    Serial.println("No se pudo conectar a WiFi (timeout).");
    Serial.println("Tip: revisá SSID/pass, banda 2.4GHz, y que el router no tenga aislamiento raro.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(LED_PIN, OUTPUT);
  ledState = false;
  applyLed();

  connectWiFi();

  // Si no hay WiFi, igual levantamos server (pero obvio no vas a poder llegar por red)
  server.on("/", handleRoot);
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.on("/toggle", handleToggle);
  server.on("/state", handleState);
  // Alias: algunas UIs/clients piden /status
server.on("/status", []() {
  // devolvé lo mismo que /state
  String json = String("{\"gpio\":4,\"state\":\"") + (ledState ? "ON" : "OFF") + "\"}";
  server.send(200, "application/json", json);
});

// Evita requests típicas del navegador
server.on("/favicon.ico", []() {
  server.send(204); // No Content
});

// Captura cualquier otra ruta no registrada
server.onNotFound([]() {
  Serial.print("[HTTP 404] Not found: ");
  Serial.println(server.uri());
  server.send(404, "text/plain", "Not found");
});

// Responde favicon para que no “ensucie” el log
server.on("/favicon.ico", []() {
  server.send(204); // No Content
});

// Handler genérico para cualquier ruta no registrada
server.onNotFound([]() {
  Serial.print("[HTTP 404] Not found: ");
  Serial.println(server.uri());
  server.send(404, "text/plain", "Not found");
});


  server.begin();
  Serial.println("HTTP server iniciado (puerto 80).");
}

void loop() {
  server.handleClient();
}
