# ESP32 Pool Control System v2.0

IoT-based swimming pool control system using ESP32, MQTT, and voltage feedback sensors. Controls a 220V pump and dual 24V electrovalves with manual override priority.

---

## 🏊 Project Overview

This system allows remote control of:
- **1× Swimming pool pump** (0.75kW @ 220V) via latching contactor
- **2× Electrovalves** (24V) connected in parallel - controlled as unified modes (Mode 1 / Mode 2)
  - Valve 1: Normally Open (NO)
  - Valve 2: Normally Closed (NC)

### Key Features

- ✅ **Latching contactor support** - 100ms pulse control for pump and valves
- ✅ **Voltage feedback sensors** - ZMPT101B (pump) and DC sensor (valves) for state detection
- ✅ **Manual override priority** - Pneumatic push buttons work independently alongside ESP32 control
- ✅ **State verification** - Prevents unnecessary switching if already in target state
- ✅ **MQTT over TLS** - Secure communication via HiveMQ Cloud
- ✅ **Simplified dashboard** - Click-to-control cards for pump and valves
- ✅ **WiFi status logging** - Real-time connection events in log panel
- ✅ **Cloudflare Workers** - Optional event logging to serverless backend

---

## 📁 Project Structure

```
IoT/
├── firmware/                    # ESP32 firmware (PlatformIO)
│   ├── src/main.cpp            # Main control logic
│   ├── include/
│   │   ├── config.h            # GPIO pins, MQTT topics, thresholds
│   │   ├── secrets.h           # WiFi/MQTT credentials (not committed)
│   │   └── ca_cert.h           # TLS certificate
│   └── platformio.ini          # PlatformIO configuration
│
├── docs/                        # Web dashboard
│   ├── index-pool.html         # Pool control dashboard (NEW!)
│   ├── config.js               # MQTT topics and device ID
│   ├── js/
│   │   ├── app-pool.js         # Pool control UI logic
│   │   ├── mqtt-pool.js        # MQTT client for pool system
│   │   └── log.js              # Event logging module
│   └── css/styles.css          # Styling with clickable cards
│
├── functions/api/               # Cloudflare Workers (optional)
│   ├── event.js                # Event logging endpoint
│   └── history.js              # Historical data retrieval
│
├── WIRING_DIAGRAM.md           # Complete hardware wiring guide
└── README_POOL.md              # This file
```

---

## 🛠️ Hardware Components

### Essential Components

| Component | Qty | Purpose | Approx Cost |
|-----------|-----|---------|-------------|
| ESP32 DevKit V1 | 1 | Main controller | $8 |
| **ZMPT101B** AC voltage sensor | 1 | Pump state feedback (220V) | $3 |
| **25V DC voltage sensor** module | 1 | Valve state feedback (24V) | $3 |
| **Songle SRD-05VDC-SL-C** relay | 3 | Control signals (pump + 2 valves) | $6 |
| 2N2222 transistor | 3 | Relay drivers | $1 |
| 1N4007 diode | 3 | Flyback protection | $1 |
| 1kΩ resistor | 3 | Base current limiting | $0.50 |
| 10kΩ resistor | 3 | Pull-down | $0.50 |
| 5V/2A power supply | 1 | Power ESP32 + relays | $5 |
| IP65 enclosure | 1 | Weather protection | $10 |
| Terminal blocks | 5 | Connections | $5 |

**Total: ~$40-45**

### Existing Pool Equipment (Your Setup)

- Pneumatic push buttons (momentary)
- 24V latching contactors (pump + valves)
- 24V power supply
- 0.75kW pool pump (220V AC)
- 2× 24V electrovalves (parallel installation)

---

## ⚡ GPIO Pin Assignment

| GPIO | Direction | Function | Connection |
|------|-----------|----------|------------|
| **19** | Output | PUMP_RELAY_PIN | Relay 1 driver (via transistor) |
| **18** | Output | VALVE1_RELAY_PIN | Relay 2 driver (Valve 1 / Mode 1) |
| **17** | Output | VALVE2_RELAY_PIN | Relay 3 driver (Valve 2 / Mode 2) |
| **36** | Input (ADC) | PUMP_SENSE_PIN | ZMPT101B output (220V detection) |
| **39** | Input (ADC) | VALVE_SENSE_PIN | DC sensor output (24V detection) |

---

## 📡 MQTT Topics

| Topic | Direction | Values | Description |
|-------|-----------|--------|-------------|
| `devices/esp32-pool-01/pump/set` | Dashboard → ESP32 | `ON`, `OFF`, `TOGGLE` | Pump control commands |
| `devices/esp32-pool-01/pump/state` | ESP32 → Dashboard | `ON`, `OFF` | Pump actual state (retained) |
| `devices/esp32-pool-01/valve/set` | Dashboard → ESP32 | `1`, `2`, `TOGGLE` | Valve mode commands |
| `devices/esp32-pool-01/valve/state` | ESP32 → Dashboard | `1`, `2` | Valve actual mode (retained) |

---

## 🚀 Getting Started

### 1. Hardware Assembly

1. **Follow [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md)** for complete wiring instructions
2. **Build relay driver circuits** (3× identical circuits for each relay)
3. **Connect sensors**:
   - ZMPT101B to pump 220V output
   - DC sensor to 24V valve supply
4. **Wire relays in parallel** with existing manual push buttons
5. **Test on breadboard** with LEDs before connecting real loads!

### 2. Firmware Configuration

1. **Copy secrets template**:
   ```bash
   cd firmware/include
   cp "secrets (example).h" secrets.h
   ```

2. **Edit `secrets.h`** with your credentials:
   ```cpp
   #define WIFI_SSID "YourWiFi"
   #define WIFI_PASS "YourPassword"
   #define MQTT_USER "dashboard-user"
   #define MQTT_PASS "your-mqtt-password"
   #define CF_API_KEY "your-cloudflare-key" // Optional
   ```

3. **Adjust `config.h`** if needed:
   - Change GPIO pins if using different connections
   - Adjust `PULSE_DURATION_MS` (default 100ms for latching contactors)
   - Modify `VOLTAGE_THRESHOLD` (default 1000 for ADC readings)

### 3. Flash Firmware

```bash
cd firmware
pio run --target upload
pio device monitor  # View serial output
```

**Expected boot sequence**:
```
========================================
   ESP32 Pool Control System v2.0
========================================
[WiFi] Conectando a YourWiFi
.....
[WiFi] ✓ CONECTADO
[WiFi] SSID: YourWiFi
[WiFi] IP: 192.168.1.100
[NTP] ✓ OK epoch: 1735...
[MQTT] ✓ CONECTADO
[MQTT] Subscribed: devices/esp32-pool-01/pump/set
[MQTT] Subscribed: devices/esp32-pool-01/valve/set
[SENSOR] Pump ADC=0 -> OFF
[SENSOR] Valve ADC=0 -> OFF
========================================
   Sistema listo
========================================
```

### 4. Deploy Dashboard

#### Option A: Cloudflare Pages (Recommended)
```bash
cd docs
# Connect to your Cloudflare account
wrangler pages deploy . --project-name pool-control
```

#### Option B: Local Development
```bash
cd docs
python -m http.server 8000
# Open http://localhost:8000/index-pool.html
```

### 5. Configure Dashboard

1. Open `index-pool.html` in browser
2. Enter MQTT credentials (same as in `secrets.h`)
3. Click **"Conectar"**
4. Wait for state synchronization

---

## 🎮 Usage

### Dashboard Controls

#### Pump Card
- **Click anywhere on card** to toggle pump ON/OFF
- Green dot = ON, Gray dot = OFF
- Status shows: `ON` or `OFF`

#### Valve Card
- **Click anywhere on card** to toggle between Mode 1 and Mode 2
- Status shows: `1` or `2`
- Mode 1: Valve 1 (NO) energized
- Mode 2: Valve 2 (NC) energized

#### Log Panel
- Shows real-time events:
  - WiFi connection status
  - MQTT messages
  - State changes
  - Sensor readings
- **▼** button: Expand/collapse
- **🗑️** button: Clear log

### Manual Override

**Manual push buttons ALWAYS have priority:**

1. **Scenario**: Dashboard shows pump OFF, but you press manual button → Pump turns ON
2. **ESP32 detects change** via voltage sensor → Updates dashboard to show ON
3. **You can still use dashboard** - both controls work in parallel

**Note**: With latching contactors, if you manually switch while ESP32 is offline, the dashboard won't update until next sensor read.

---

## 🔧 Control Logic

### Pump Control (Latching)

```cpp
// User clicks "Turn ON" in dashboard
1. Read ZMPT101B sensor (check current state)
2. If already ON → Skip (no pulse sent)
3. If OFF → Send 100ms pulse to relay
4. Wait 200ms for contactor to switch
5. Read sensor again to verify
6. Publish new state to MQTT
```

### Valve Control (Unified Mode)

```cpp
// User clicks "Change to Mode 2"
1. Current mode is 1 → need to switch
2. Send 100ms pulse to Valve2 relay
3. Valve2 (NC) energizes
4. Update internal mode variable
5. Publish "2" to MQTT valve/state
```

### State Feedback

**ADC Threshold: 1000 (out of 4095)**

| Sensor | Voltage Present | ADC Reading | Interpreted State |
|--------|----------------|-------------|-------------------|
| ZMPT101B | 220V AC detected | > 1000 | Pump ON |
| ZMPT101B | No voltage | < 1000 | Pump OFF |
| DC Sensor | 24V DC detected | > 1000 | Valves powered |
| DC Sensor | No voltage | < 1000 | Valves OFF |

---

## ⚠️ Safety Considerations

### Critical Warnings

1. **HIGH VOLTAGE**: 220V can be lethal. Work only with power OFF.
2. **Verify isolation**: ZMPT101B provides galvanic isolation - NEVER bypass this!
3. **Use proper enclosure**: IP65 rated for outdoor/wet environments
4. **Check local codes**: Pool electrical work may require licensed electrician
5. **Test before installation**: Verify all relay switching on bench with LEDs

### Recommended Practices

- ✅ Add circuit breakers (10A for pump circuit)
- ✅ Use properly rated wire (16 AWG for 220V)
- ✅ Label all connections
- ✅ Keep low-voltage (ESP32/5V) physically separated from high-voltage (220V)
- ✅ Document actual contactor model numbers for future reference

---

## 🐛 Troubleshooting

### ESP32 Won't Connect to WiFi

**Check:**
- SSID/password correct in `secrets.h`?
- WiFi signal strength (RSSI should be > -70 dBm)
- Try secondary WiFi (configured in `secrets.h`)

**Serial output shows**:
```
[WiFi] ERROR: timeout conectando a ambas redes WiFi.
```

### Relays Click But Contactors Don't Trigger

**Likely cause**: Relay contacts not wired in parallel with manual buttons

**Fix**:
- Verify relay NO (Normally Open) contacts are in parallel with manual button
- Check contactor coil voltage (should be 24V, not 220V!)
- Test with multimeter: Should see 24V across contactor coil when relay energizes

### Sensor Always Reads Zero

**Pump sensor (ZMPT101B)**:
- Check 220V input connections
- Verify VCC (5V) and GND connected
- Test with multimeter on ZMPT output (should see ~2.5V at rest, varying with AC)

**Valve sensor (DC 24V)**:
- Check polarity (+/- connections)
- Verify voltage is actually present at valve terminals
- Swap input terminals if readings inverted

### Dashboard Shows Wrong State

**Root cause**: Manual button changed state while ESP32 was offline

**Fix**:
- ESP32 will auto-correct on next sensor read
- Manually click dashboard button to resync
- Consider adding periodic sensor polling (currently only reads on state change)

### Pump Toggles Opposite Direction

**Symptom**: Clicking "Turn ON" actually turns pump OFF

**Cause**: Latching contactor was already in opposite state

**Solution**: This is expected with latching contactors + blind control
- Manual reset: Use physical push button to set known state
- Add initialization routine in `setup()` to read sensors and sync state

---

## 📊 Advanced Features

### Event Logging to Cloudflare

The firmware includes optional Cloudflare Workers integration:

**Event schema**:
```json
{
  "deviceId": "esp32-pool-01",
  "device": "pump",
  "state": "ON",
  "ts": 1735678900000
}
```

**Setup**:
1. Deploy `functions/api/event.js` to Cloudflare Workers
2. Set `CF_API_BASE_URL` and `CF_API_KEY` in `secrets.h`
3. Uncomment `postEventToCloudflare()` calls in main.cpp

### Custom Sensor Thresholds

If ADC readings are inconsistent, calibrate in `config.h`:

```cpp
// Read actual values via Serial Monitor:
// [SENSOR] Pump ADC=2450 -> ON
// [SENSOR] Pump ADC=80 -> OFF

// Then set threshold midway between:
#define VOLTAGE_THRESHOLD 1200  // Was 1000
```

### Pulse Duration Tuning

Different contactors may need different pulse lengths:

```cpp
#define PULSE_DURATION_MS 150  // Increase if contactors don't switch reliably
```

Test range: 50-200ms (too short = no trigger, too long = unnecessary)

---

## 🔄 Migration from Valve Control v1

If upgrading from the original dual-valve control project:

### What Changed

| Old System | New System |
|------------|------------|
| 2× Independent valves | Unified valve modes (1/2) |
| MOSFET control (continuous) | Relay pulses (latching) |
| No state feedback | Voltage sensors |
| Separate ON/OFF buttons | Click-to-toggle cards |
| Timeline chart | Removed (simpler UI) |

### Migration Steps

1. **Backup old branch**:
   ```bash
   git checkout feature/electrovalve-control
   git branch backup/electrovalve-v1
   ```

2. **Switch to pool control**:
   ```bash
   git checkout feature/pool-control
   ```

3. **Update hardware**: Add relays + sensors (see WIRING_DIAGRAM.md)

4. **Flash new firmware**: Follow "Getting Started" above

5. **Deploy new dashboard**: Use `index-pool.html` instead of `index.html`

---

## 📝 TODO / Future Enhancements

- [ ] Add scheduling/timers for automatic pump cycles
- [ ] Implement power usage monitoring (current sensor integration)
- [ ] Add temperature sensor for pool water
- [ ] OTA (Over-The-Air) firmware updates
- [ ] Mobile app (React Native or Flutter)
- [ ] Historical data visualization (re-enable timeline with D3.js)
- [ ] Email/SMS notifications for critical events
- [ ] Integration with Home Assistant / Google Home

---

## 🤝 Contributing

This is a personal pool control project, but suggestions welcome!

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is provided as-is for personal use. No warranty. Use at your own risk.

**Electrical work disclaimer**: Pool equipment control involves high voltage. Consult licensed electrician if unsure.

---

## 🙏 Credits

- **Original valve control project**: Foundation for this pool system
- **MQTT.js**: Client library for browser-based MQTT
- **PubSubClient**: Arduino MQTT library
- **HiveMQ Cloud**: Free tier MQTT broker with TLS
- **Cloudflare Workers**: Serverless event logging
- **PlatformIO**: ESP32 development environment

---

## 📧 Support

For issues or questions:
1. Check **Troubleshooting** section above
2. Review **WIRING_DIAGRAM.md** for hardware questions
3. Open GitHub issue with:
   - Serial monitor output
   - Photos of wiring (if hardware related)
   - Dashboard console errors (F12 in browser)

---

**Built with ☕ and 🏊‍♂️ in 2025**
