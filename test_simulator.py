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
TOPIC_TIMER_STATE = "devices/esp32-pool-01/timer/state"
TOPIC_PUMP_CMD = "devices/esp32-pool-01/pump/set"
TOPIC_VALVE_CMD = "devices/esp32-pool-01/valve/set"
TOPIC_TIMER_CMD = "devices/esp32-pool-01/timer/set"

# Simulated state
pump_state = "OFF"
valve_mode = "1"
timer_active = False
timer_mode = 1
timer_duration = 0
timer_remaining = 0
timer_last_update = 0

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("✓ Connected to MQTT broker")
        # Subscribe to command topics
        client.subscribe(TOPIC_PUMP_CMD)
        client.subscribe(TOPIC_VALVE_CMD)
        client.subscribe(TOPIC_TIMER_CMD)
        print(f"✓ Subscribed to {TOPIC_PUMP_CMD}")
        print(f"✓ Subscribed to {TOPIC_VALVE_CMD}")
        print(f"✓ Subscribed to {TOPIC_TIMER_CMD}")
        
        # Publish initial states
        publish_states(client)
    else:
        print(f"✗ Connection failed with code {rc}")

def on_message(client, userdata, msg):
    global pump_state, valve_mode, timer_active, timer_mode, timer_duration, timer_remaining, timer_last_update
    
    payload = msg.payload.decode().strip()
    topic = msg.topic
    
    print(f"\n[RX] {topic}: '{payload}'")
    
    if topic == TOPIC_PUMP_CMD:
        payload_upper = payload.upper()
        if payload_upper in ["ON", "OFF"]:
            # Only change if different from current state and no active timer
            if timer_active:
                print(f"⚠️ Timer is active - pump control blocked")
            elif pump_state != payload_upper:
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
    
    elif topic == TOPIC_TIMER_CMD:
        try:
            timer_cmd = json.loads(payload)
            cmd_mode = timer_cmd.get("mode", 1)
            cmd_duration = timer_cmd.get("duration", 0)
            
            if cmd_duration == 0:
                # Stop timer
                print(f"🛑 Stopping timer")
                stop_timer(client)
            else:
                # Start timer
                print(f"🕐 Starting timer: mode={cmd_mode}, duration={cmd_duration}s")
                start_timer(client, cmd_mode, cmd_duration)
        except json.JSONDecodeError:
            print(f"✗ Invalid timer JSON: '{payload}'")

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
    
    # Publish timer state
    publish_timer_state(client)

def start_timer(client, mode, duration):
    """Start timer with specified mode and duration"""
    global timer_active, timer_mode, timer_duration, timer_remaining, timer_last_update, pump_state, valve_mode
    
    timer_active = True
    timer_mode = mode
    timer_duration = duration
    timer_remaining = duration
    timer_last_update = time.time()
    
    # Set valve mode
    valve_mode = str(mode)
    client.publish(TOPIC_VALVE_STATE, valve_mode, retain=True)
    print(f"[TX] {TOPIC_VALVE_STATE}: {valve_mode}")
    
    # Turn on pump
    pump_state = "ON"
    client.publish(TOPIC_PUMP_STATE, pump_state, retain=True)
    print(f"[TX] {TOPIC_PUMP_STATE}: {pump_state}")
    
    # Publish timer state
    publish_timer_state(client)

def stop_timer(client):
    """Stop active timer"""
    global timer_active, timer_remaining, pump_state
    
    if not timer_active:
        return
    
    timer_active = False
    timer_remaining = 0
    
    # Turn off pump
    pump_state = "OFF"
    client.publish(TOPIC_PUMP_STATE, pump_state, retain=True)
    print(f"[TX] {TOPIC_PUMP_STATE}: {pump_state}")
    
    # Publish timer state
    publish_timer_state(client)

def update_timer(client):
    """Update timer countdown (call periodically)"""
    global timer_active, timer_remaining, timer_last_update
    
    if not timer_active:
        return
    
    now = time.time()
    elapsed = int(now - timer_last_update)
    
    if elapsed >= 1:
        timer_last_update = now
        
        if timer_remaining > 0:
            timer_remaining -= 1
            
            # Publish every 10 seconds or when < 10 seconds remaining
            if timer_remaining % 10 == 0 or timer_remaining <= 10:
                publish_timer_state(client)
                print(f"⏱️  Timer: {timer_remaining // 60}m {timer_remaining % 60}s remaining")
        else:
            # Timer expired
            print("⏰ Timer expired!")
            stop_timer(client)

def publish_timer_state(client):
    """Publish timer state"""
    timer_data = {
        "active": timer_active,
        "remaining": timer_remaining,
        "mode": timer_mode,
        "duration": timer_duration
    }
    client.publish(TOPIC_TIMER_STATE, json.dumps(timer_data), retain=True)
    print(f"[TX] {TOPIC_TIMER_STATE}: {json.dumps(timer_data)}")

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
        
        # Periodic updates
        counter = 0
        last_wifi_update = time.time()
        
        while True:
            # Update timer every second
            update_timer(client)
            time.sleep(1)
            
            # WiFi updates every 30 seconds
            now = time.time()
            if now - last_wifi_update >= 30:
                last_wifi_update = now
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
