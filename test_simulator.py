#!/usr/bin/env python3
"""
ESP32 Pool Control Simulator
Simulates MQTT messages from the ESP32 for testing the dashboard
"""

import paho.mqtt.client as mqtt
import json
import time
import sys

# MQTT Configuration (from your config)
BROKER = "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud"
PORT = 8883
USERNAME = "User-ESP32-01"  # Your MQTT username
PASSWORD = "Manzana1"        # Your MQTT password

# Topics
TOPIC_PUMP_STATE = "devices/esp32-pool-01/pump/state"
TOPIC_VALVE_STATE = "devices/esp32-pool-01/valve/state"
TOPIC_WIFI_STATE = "devices/esp32-pool-01/wifi/state"
TOPIC_PUMP_CMD = "devices/esp32-pool-01/pump/set"
TOPIC_VALVE_CMD = "devices/esp32-pool-01/valve/set"

# Simulated state
pump_state = "OFF"
valve_mode = "1"

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("✓ Connected to MQTT broker")
        # Subscribe to command topics
        client.subscribe(TOPIC_PUMP_CMD)
        client.subscribe(TOPIC_VALVE_CMD)
        print(f"✓ Subscribed to {TOPIC_PUMP_CMD}")
        print(f"✓ Subscribed to {TOPIC_VALVE_CMD}")
        
        # Publish initial states
        publish_states(client)
    else:
        print(f"✗ Connection failed with code {rc}")

def on_message(client, userdata, msg):
    global pump_state, valve_mode
    
    payload = msg.payload.decode().strip()
    topic = msg.topic
    
    print(f"\n[RX] {topic}: '{payload}'")
    
    if topic == TOPIC_PUMP_CMD:
        payload_upper = payload.upper()
        if payload_upper in ["ON", "OFF"]:
            # Only change if different from current state
            if pump_state != payload_upper:
                pump_state = payload_upper
                print(f"→ Pump state changed to: {pump_state}")
                client.publish(TOPIC_PUMP_STATE, pump_state, retain=True)
                print(f"[TX] {TOPIC_PUMP_STATE}: {pump_state}")
            else:
                print(f"→ Pump already in state: {pump_state}")
        else:
            print(f"✗ Unknown pump command: '{payload}'")
    
    elif topic == TOPIC_VALVE_CMD:
        if payload in ["1", "2"]:
            # Only change if different from current mode
            if valve_mode != payload:
                valve_mode = payload
                print(f"→ Valve mode changed to: {valve_mode}")
                client.publish(TOPIC_VALVE_STATE, valve_mode, retain=True)
                print(f"[TX] {TOPIC_VALVE_STATE}: {valve_mode}")
            else:
                print(f"→ Valve already in mode: {valve_mode}")
        else:
            print(f"✗ Unknown valve command: '{payload}'")

def publish_states(client):
    """Publish current states"""
    global pump_state, valve_mode
    
    # Publish pump state
    client.publish(TOPIC_PUMP_STATE, pump_state, retain=True)
    print(f"[TX] {TOPIC_PUMP_STATE}: {pump_state}")
    
    # Publish valve state
    client.publish(TOPIC_VALVE_STATE, valve_mode, retain=True)
    print(f"[TX] {TOPIC_VALVE_STATE}: {valve_mode}")
    
    # Publish WiFi state (simulated)
    wifi_data = {
        "status": "connected",
        "ssid": "ClaroWifi6545",
        "ip": "192.168.0.100",
        "rssi": -45,  # Excellent signal
        "quality": "excellent"
    }
    client.publish(TOPIC_WIFI_STATE, json.dumps(wifi_data), retain=True)
    print(f"[TX] {TOPIC_WIFI_STATE}: {json.dumps(wifi_data)}")

def main():
    print("=" * 50)
    print("ESP32 Pool Control Simulator")
    print("=" * 50)
    print(f"Broker: {BROKER}:{PORT}")
    print(f"Device: esp32-pool-01")
    print("=" * 50)
    
    # Create MQTT client
    client = mqtt.Client(client_id="simulator-test-001")
    client.username_pw_set(USERNAME, PASSWORD)
    client.tls_set()  # Enable TLS
    
    # Set callbacks
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        print("\nConnecting to broker...")
        client.connect(BROKER, PORT, 60)
        
        # Start loop
        client.loop_start()
        
        print("\n✓ Simulator running. Press Ctrl+C to stop.")
        print("\nCommands from dashboard will be processed automatically.")
        print("Publishing WiFi status every 30 seconds...\n")
        
        # Periodic WiFi status updates
        counter = 0
        while True:
            time.sleep(30)
            counter += 1
            
            # Vary signal strength for testing
            rssi_values = [-45, -55, -65, -75]
            quality_values = ["excellent", "good", "fair", "weak"]
            idx = counter % 4
            
            wifi_data = {
                "status": "connected",
                "ssid": "ClaroWifi6545",
                "ip": "192.168.0.100",
                "rssi": rssi_values[idx],
                "quality": quality_values[idx]
            }
            client.publish(TOPIC_WIFI_STATE, json.dumps(wifi_data), retain=True)
            print(f"[TX] WiFi update: {quality_values[idx]} ({rssi_values[idx]} dBm)")
    
    except KeyboardInterrupt:
        print("\n\nShutting down simulator...")
    except Exception as e:
        print(f"\n✗ Error: {e}")
    finally:
        client.loop_stop()
        client.disconnect()
        print("✓ Disconnected")

if __name__ == "__main__":
    main()
