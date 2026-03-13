/**
 * 
 * Handwash Sensor - ESP32
 * Copyright (c) 2026 Bennet Schmidt
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software to use, copy, modify, and distribute it, subject to the
 * following conditions: The above copyright notice shall be included in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */

#include <WiFi.h>
#include <PubSubClient.h>

// ── WiFi & MQTT Config ──────────────────────────────────────
const char* ssid       = "########";
const char* password   = "########";  //Change ######## to your own Values!!! 
const char* mqttServer = "########";
const int   mqttPort   = 1883;
const char* mqttUser   = "";
const char* mqttPass   = "";
const char* mqttTopic  = "sensor/handwash/trigger";
long  cooldownUntil  = 0;           // NEU: Cooldown nach Relay-Off
const long COOLDOWN_MS = 5000;      // NEU: 5s Cooldown
int   triggerCount   = 0;           // NEU: Debounce-Zähler
const int TRIGGER_CONFIRM = 3;     // NEU: 3x hintereinander < 10cm

// ── Pins ─────────────────────────────────────────────────────
const int trigPin  = 18;
const int echoPin  = 19;
const int relayPin = 16;

// ── Timing ───────────────────────────────────────────────────
const float TRIGGER_DISTANCE   = 10.0;     // unter 10 cm = Trigger
const long  RELAY_ON_TIME_MS   = 30000;     //60000; // 30 Sekunden
const long  MEASURE_INTERVAL   = 500;      // Messintervall ms

// ── State ────────────────────────────────────────────────────
bool  relayActive    = false;
long  relayStartTime = 0;
long  lastMeasure    = 0;
bool  mqttEnabled    = false;

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);

// ── WiFi ─────────────────────────────────────────────────────
void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("WiFi");
  long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > 15000) {
      Serial.println(" FAILED");
      mqttEnabled = false;
      return;
    }
    delay(200);
    Serial.print(".");
  }
  Serial.println(" OK: " + WiFi.localIP().toString());
  mqttEnabled = true;
}

// ── MQTT ─────────────────────────────────────────────────────
void reconnectMQTT() {
  for (int i = 0; i < 3 && !mqttClient.connected(); i++) {
    if (mqttClient.connect("ESP32_Handwash", mqttUser, mqttPass)) {
      Serial.println("MQTT connected");
      return;
    }
    delay(1000);
  }
}

// ── Distanz messen ───────────────────────────────────────────
float measureDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long dur = pulseIn(echoPin, HIGH, 30000);
  if (dur == 0) return -1;
  return dur * 0.0343 / 2.0;
}

// ── Setup ────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW);

  setupWiFi();
  if (mqttEnabled) mqttClient.setServer(mqttServer, mqttPort);
}

// ── Loop ─────────────────────────────────────────────────────
void loop() {
  if (mqttEnabled) {
    if (!mqttClient.connected()) reconnectMQTT();
    mqttClient.loop();
  }

  long now = millis();

  // Relay nach 30s ausschalten
  if (relayActive && (now - relayStartTime >= RELAY_ON_TIME_MS)) {
    digitalWrite(relayPin, LOW);
    relayActive = false;
    cooldownUntil = now + COOLDOWN_MS;  // NEU
    triggerCount = 0;                    // NEU
    Serial.println("Relay OFF → Cooldown 5s");
}

  // Messen im Intervall
  if (now - lastMeasure < MEASURE_INTERVAL) return;
  lastMeasure = now;

  float dist = measureDistance();

  // Serial Debug
  if (dist < 0) Serial.println("No object");
  else { Serial.print(dist); Serial.println(" cm"); }

  // Trigger: unter 10cm, Relay nicht aktiv, kein Cooldown
  if (!relayActive && now > cooldownUntil && dist > 0 && dist < TRIGGER_DISTANCE) {
      triggerCount++;
      if (triggerCount >= TRIGGER_CONFIRM) {
          Serial.println("TRIGGERED! Relay ON 30s");
          digitalWrite(relayPin, HIGH);
          relayActive = true;
          relayStartTime = now;
          triggerCount = 0;

          if (mqttEnabled && mqttClient.connected()) {
              mqttClient.publish(mqttTopic, "{\"event\":\"triggered\",\"duration\":30}");
              Serial.println("Daten wurden übertragen");
          }
      }
  } else {
      triggerCount = 0;  // Reset wenn keine Hand erkannt
  }

  // Serial-Kommandos
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "on")     { digitalWrite(relayPin, HIGH); Serial.println("Manual HIGH"); }
    else if (cmd == "off")  { digitalWrite(relayPin, LOW); relayActive = false; Serial.println("Manual LOW"); }
    else if (cmd == "status") {
      Serial.printf("Relay: %s | WiFi: %s | MQTT: %s\n",
        relayActive ? "ON" : "OFF",
        WiFi.status() == WL_CONNECTED ? "OK" : "FAIL",
        mqttClient.connected() ? "OK" : "FAIL");
    }
    else if (cmd == "mqtt") {
      if (mqttEnabled && mqttClient.connected()) {
        mqttClient.publish(mqttTopic, "{\"event\":\"manual_test\"}");
        Serial.println("Test sent");
      } else Serial.println("MQTT not connected");
    }
  }
}