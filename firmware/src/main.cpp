#include <Arduino.h>

const int LED_PIN = 2;  // Para test. Si no parpadea, después lo cambiamos.

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("Blink test: arrancando...");

  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED ON");
  delay(1000);

  digitalWrite(LED_PIN, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
