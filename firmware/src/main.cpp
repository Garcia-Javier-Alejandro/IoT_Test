#include <Arduino.h>
#include <WiFi.h>

const char* ssid     = "ClaroWifi6545";
const char* password = "123456789";

const int LED_PIN = 4;  // GPIO4

// LED RGB ánodo común: ON = LOW, OFF = HIGH
void ledOn()  { digitalWrite(LED_PIN, LOW); } // Manda 0V al pin4, que como tiene 3.3V en el ánodo, enciende el LED
void ledOff() { digitalWrite(LED_PIN, HIGH); } // Manda 3.3V al pin4, que como tiene 3.3V en el ánodo, apaga el LED

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(LED_PIN, OUTPUT);
  ledOff();

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Conectando a WiFi SSID: ");
  Serial.println(ssid);
}

void loop() {
  // 1) Mantener WiFi vivo sin bloquear todo
  wl_status_t st = WiFi.status();

  static unsigned long lastLog = 0; // cada 2 segundos loguea el estado de WiFi
  if (millis() - lastLog > 2000) {
    lastLog = millis();
    Serial.print("WiFi status: ");
    Serial.print((int)st);
    if (st == WL_CONNECTED) {
      Serial.print(" | IP: ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println();
    }
  }

  // 2) Indicador LED robusto:

  const unsigned long BLINK_MS = 500;
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  unsigned long now = millis();

  if (st == WL_CONNECTED) {
    if (now - lastBlink >= BLINK_MS) {
      lastBlink = now;
      ledState = !ledState;
      if (ledState) ledOn();
      else ledOff();
    }
  } else {
    ledOff();
    
    lastBlink = now; // resetea el parpadeo cuando vuelve a conectar
    
  }

  delay(10);
}

