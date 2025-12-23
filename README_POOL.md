# ESP32 Pool Control System v2.0

IoT-based swimming pool control system using ESP32, MQTT, and voltage feedback sensors. Controls a 220V pump and dual 24V electrovalves with manual override priority and automated scheduling.

## 🏊 Project Overview

This system allows remote control of:
- **1× Swimming pool pump** (0.75kW @ 220V) via latching contactor
- **2× Electrovalves** (24V) connected in parallel - controlled as unified modes (Mode 1 / Mode 2)
  - Valve 1: Normally Open (NO) - Cascada mode
  - Valve 2: Normally Closed (NC) - Eyectores mode

### Key Features

- ✅ **Latching contactor support** - 100ms pulse control for pump and valves
- ✅ **Voltage feedback sensors** - ZMPT101B (pump) and DC sensor (valves) for state detection
- ✅ **Manual override priority** - Pneumatic push buttons work independently alongside ESP32 control
- ✅ **State verification** - Prevents unnecessary switching if already in target state
- ✅ **MQTT over TLS** - Secure communication via HiveMQ Cloud
- ✅ **Modern responsive dashboard** - Mobile-first design with Tailwind CSS
- ✅ **Countdown timer** - Set duration and mode for automatic pump shutoff
- ✅ **Program scheduling** - Up to 3 weekly schedules with automatic execution
- ✅ **Conflict detection** - Automatic handling of timer/program/manual conflicts
- ✅ **WiFi status monitoring** - Real-time signal strength with color-coded indicators
- ✅ **Event logging** - Collapsible log panel with timestamps
- ✅ **Multi-network WiFi** - Automatic fallback to 3 configured networks
- ✅ **Well-documented code** - Comprehensive inline comments and section separators

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
├── docs/                        # Web dashboard (PWA-ready)
│   ├── index.html              # Main dashboard (NEW unified design!)
│   ├── config.js               # MQTT topics and device ID
│   ├── js/
│   │   ├── app.js              # Main application controller
│   │   ├── mqtt.js             # MQTT client wrapper
│   │   ├── programas.js        # Schedule management module
│   │   ├── log.js              # Event logging module
│   │   └── history.js          # Historical data (optional)
│   ├── logo.png                # Application logo
│   └── _routes.json            # Deployment routes config
│
├── WIRING_DIAGRAM.md           # Complete hardware wiring guide
└── README_POOL.md              # This file
```


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
| `devices/esp32-pool-01/pump/set` | Dashboard → ESP32 | `ON`, `OFF`, `TOGGLE` | Pump control command
| `devices/esp32-pool-01/timer/set` | Dashboard → ESP32 | `{"mode":1,"duration":3600}` | Timer start command (JSON) |
| `devices/esp32-pool-01/timer/state` | ESP32 → Dashboard | `{"active":true,"remaining":3420,...}` | Timer state updates (retained) |
| `devices/esp32-pool-01/wifi/state` | ESP32 → Dashboard | `{"status":"connected","ssid":"...","rssi":-45,...}` | WiFi status with signal strength (retained) |s |
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

#### Local Development
```bash
```

#### Production Deployment
The dashboard is automatically deployed via GitHub Actions to Cloudflare Pages:
- **Live URL**: https://iot-pool.pages.dev
- **Deployment**: Automatic on push to main branch
- **Custom domain**: Can be configured in Cloudflare

**Or deploy to any static hosting** (GitHub Pages, Netlify, Vercel, etc.)

### 5. Configure Dashboard

1. Open dashboard in browser
2. Enter MQTT credentials (same as in `secrets.h`)
3. Click **"Conectar"**
4. Wait for state synchronization
5. Credentials are saved in localStorage for future sessionsser
2. Enter MButton
- **Large blue button** with power icon
- Click to toggle pump ON/OFF
- Animated ring appears when pump is running
- Shows current state: "Bomba ON" or "Bomba OFF"
- Automatically disabled during MQTT disconnection
- Detects conflicts with active programs

#### Valve Mode Buttons
- **Two buttons side by side**: Cascada (waterfall icon) and Eyectores (air icon)
- Click to switch between modes
- Active mode highlighted in blue
- Mode 1 (Cascada): Valve 1 energized
- Mode 2 (Eyectores): Valve 2 energized
- Switching modes automatically cancels active timer
- Detects conflicts with active programs

#### Timer Button
- Opens timer configuration screen
- Select mode (Cascada or Eyectores)
- Set duration (hours and minutes)
- Start button begins countdown
- Active timer shows on main screen with stop button
- Timer button displays countdown (HH:MM:SS)
- Auto-stops pump when timer expires

#### Programas Button
- Opens weekly schedule management
- Create up to 3 programs
- Each program can have different schedules per day
- Enable/disable programs with toggle button
- Edit or delete existing programs
- Active program name displayed on button
- Visual ring indicator when program is running
- Automatic execution every 15 minutes
- Manual override pauses programs until next day

### Program Scheduling

#### Creating a Program
1. Click **"Programas"** button
2. Select an empty slot (1, 2, or 3)
3. Enable days by clicking day toggle buttons
4. For each enabled day:
   - Select mode (Cascada or Eyectores icon)
   - Set start time
   - Set stop time
5. Click **"Crear"** and enter program name
6. Program is automatically enabled

#### Program Priority
When multiple programs overlap:
- Slot 0 > Slot 1 > Slot 2 (first slot has priority)
- Alert shown for conflicts
- Only highest priority program executes

#### Manual Override
When you manually control pump/valves while a program is active:
- Alert: "⚠️ Conflicto con programa activo"
- Program pauses until next day (midnight reset)
- Programs resume automatically at 00:00

### Connection Status

#### WiFi Indicator
- **Icon color** indicates signal quality:
  - Green: Excellent (>= -50 dBm)
  - Blue: Good (>= -60 dBm)
  - Yellow: Fair (>= -70 dBm)
  - Orange: Weak (< -70 dBm)
  - Red: Disconnected
- Displays connected SSID

#### MQTT Indicator
- **Green animated dot**: Connected
- **Red static dot**: Disconnected
- Shows connection status text

#### Log Panel
- Shows real-time events with timestamps
- Color-coded messages:
  - ✅ Success (green)
  - ⚠️ Warnings (orange)
  - ❌ Errors (red)
  - ▶ Program execution
  - ■ Program stop
  - 🕐 Timer events
- **▼** button: Expand/collapse
- **🗑️** button: Clear log
- Auto-scrolls to latest entry
- Gradient fade at bottom for smooth UXgized
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
Automatic Program Execution

The dashboard checks every 15 minutes if any enabled program should be running:

1. **Time Matching**: Compares current time against program schedules
2. **Day Matching**: JavaScript `Date.getDay()` matches schedule (0=Sunday, 1=Monday, etc.)
3. **Conflict Resolution**: Slot priority system (slot 0 beats slot 1 beats slot 2)
4. **MQTT Commands**: Publishes pump ON and valve mode commands
5. **Manual Override**: Detects user intervention and pauses until next day
6. **Midnight Reset**: Automatic resume at 00:00 after manual override

### Timer Synchronization

Timer state is synchronized between ESP32 and dashboard:
- ESP32 sends timer state updates every 10 seconds
- Dashboard displays countdown locally (1-second updates)
- Resync on reconnection prevents drift
- Stop command from either side stops both

### WiFi Fallback

ESP32 attempts connection to 3 networks in priority order:
1. Primary WiFi (WIFI_SSID)
2. Secondary WiFi (WIFI_SSID_2)
3. Tertiary WiFi (WIFI_SSID_3)

If all fail, periodic retry every 30 seconds.

### Custom Sensor Calibration

If ADC readings are inconsistent, calibrate in `firmware/src/main.cpp`:

```cpp
// Constants section at top of file
const int VOLTAGE_THRESHOLD = 1200;  // Adjust based on your sensors
```

Test range: Read ADC values via Serial Monitor when ON/OFF, set threshold midway.

### Pulse Duration Tuning

Different contactors may need different pulse lengths (in `main.cpp`):

```cpp
const int PULSE_DURATION_MS = 150;  // Increase if contactors don't switch reliably
```

Test range: 50-200ms (too short = no trigger, too long = unnecessary)

### Code Organization

All code files follow consistent structure with section separators:

**ESP32 Firmware** (`main.cpp`):
- Constants → State → Helper Functions → Sensors → Relays → MQTT Publishing → Control Logic → Timer → MQTT Handler → WiFi → NTP → MQTT TLS → Setup/Loop

**JavaScript Modules** (`app.js`, `programas.js`):
- Constants → State → DOM Cache → Initialization → Event Listeners → Business Logic → Public API

**HTML** (`index.html`):
- Meta → Styles → Config → Header → Main Screen → Timer Screen → Programas Screen → Create Program Screen → Footer → Scripts

### ESP32 Won't Connect to WiFi

**Check:**
- SSID/password correct in `secrets.h`?
- WiFi signal strength (RSSI should be > -70 dBm)
- Try Recent Improvements (December 2025)

### ✅ Completed
- ✅ **Automatic program execution** - 15-minute interval checking with conflict resolution
- ✅ **Timer functionality** - Countdown with auto-shutoff and ESP32 sync
- ✅ **Manual override detection** - Pauses programs when user takes manual control
- ✅ **Code refactoring** - Comprehensive documentation and section separators
- ✅ **WiFi multi-network** - Automatic fallback to 3 configured networks
- ✅ **Custom waterfall icon** - SVG icon for Cascada mode
- ✅ **Responsive UI polish** - Smaller table sizes, improved spacing
- ✅ **Program scheduling** - Up to 3 weekly programs with per-day configuration
- ✅ **Conflict handling** - Timer cancellation, program priority, manual override
- ✅ **Signal strength monitoring** - Color-coded WiFi indicators

### 🚧 TODO / Future Enhancements

- [ ] Hardware testing with actual ESP32 and sensors
- [ ] Power usage monitoring (current sensor integration)
- [ ] Temperature sensor for pool water monitoring
- [ ] OTA (Over-The-Air) firmware updates
- [ ] Mobile app wrapper (Capacitor or PWA improvements)
- [ ] Historical data visualization and analytics
- [ ] Email/SMS notifications for critical events
- [ ] Integration with Home Assistant / Google Home
- [ ] Multiple device support (control multiple pools)
- [ ] Sensor debouncing and advanced validationlel with manual buttons

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

### Custom Sensor Calibration

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

**Built with ☕ in 2025**
