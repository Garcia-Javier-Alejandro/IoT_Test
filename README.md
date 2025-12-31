# ESP32 Pool Control System v2.0

IoT-based swimming pool control system using ESP32, MQTT, and DS18B20 temperature sensor. Controls a 220V pump and 24V electrovalves with manual override capability and automated scheduling.

## 🏊 Project Overview

This system allows remote control of:
- **1× Swimming pool pump** (220V AC) via standard SONGLE relay
- **2× Electrovalves** (24V) wired in parallel (NC + NO) - controlled by single relay
  - Relay LOW = Mode 1 (Cascada) - NC valve open, NO valve closed
  - Relay HIGH = Mode 2 (Eyectores) - NC valve closed, NO valve open
- **1× DS18B20 temperature sensor** - Pool water temperature monitoring

### Key Features

- ✅ **Standard relay control** - Continuous HIGH/LOW for SONGLE SRD-5VDC-SL-C relays
- ✅ **Temperature monitoring** - DS18B20 OneWire sensor with 1-minute update intervals
- ✅ **Manual override compatibility** - SPDT switches wired in parallel with ESP32 relays
- ✅ **Blind control** - No feedback sensors, simple command-based operation
- ✅ **MQTT over TLS** - Secure communication via HiveMQ Cloud
- ✅ **Modern responsive dashboard** - Mobile-first design with Tailwind CSS
- ✅ **Countdown timer** - Set duration and mode for automatic pump shutoff
- ✅ **Program scheduling** - Up to 3 weekly schedules with automatic execution
- ✅ **Conflict detection** - Automatic handling of timer/program/manual conflicts
- ✅ **WiFi status monitoring** - Real-time signal strength with color-coded indicators
- ✅ **Event logging** - Collapsible log panel with timestamps


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
| **16** | Output | VALVE_RELAY_PIN | Relay IN1 → NC+NO electrovalves (parallel, opposite polarity) + 10kΩ pull-down |
| **19** | Output | PUMP_RELAY_PIN | Relay IN2 → 220V pump motor + 10kΩ pull-down |
| **33** | Input (OneWire) | TEMP_SENSOR_PIN | DS18B20 temperature probe data line + 4.7kΩ pull-up to 3.3V |

---

## 📡 MQTT Topics

| Topic | Direction | Values | Description |
|-------|-----------|--------|-------------|
| `devices/esp32-pool-01/pump/set` | Dashboard → ESP32 | `ON`, `OFF`, `TOGGLE` | Pump control command
| `devices/esp32-pool-01/timer/set` | Dashboard → ESP32 | `{"mode":1,"duration":3600}` | Timer start command (JSON) |
| `devices/esp32-pool-01/timer/state` | ESP32 → Dashboard | `{"active":true,"remaining":3420,...}` | Timer state updates (retained) |
| `devices/esp32-pool-01/wifi/state` | ESP32 → Dashboard | `{"status":"connected","ssid":"...","rssi":-45,...}` | WiFi status with signal strength (retained) |
| `devices/esp32-pool-01/pump/state` | ESP32 → Dashboard | `ON`, `OFF` | Pump actual state (retained) |
| `devices/esp32-pool-01/valve/set` | Dashboard → ESP32 | `1`, `2`, `TOGGLE` | Valve mode commands |
| `devices/esp32-pool-01/valve/state` | ESP32 → Dashboard | `1`, `2` | Valve actual mode (retained) |
| `devices/esp32-pool-01/temperature/state` | ESP32 → Dashboard | `25.3` | Pool water temperature in °C (retained, updates every 60s) |

---

## 🚀 Getting Started

### 1. Hardware Assembly

1. **ESP32 + SONGLE relay modules** (2× SRD-5VDC-SL-C relays)
2. **Connect outputs**:
   - GPIO 16 → Relay IN1 (Valve control) → 24V electrovalves (NC+NO in parallel)
   - GPIO 19 → Relay IN2 (Pump control) → 220V pump motor
3. **Connect temperature sensor**:
   - DS18B20 data line → GPIO 33 (with 4.7kΩ pull-up to 3.3V)
4. **Pull-down resistors**: 10kΩ from GPIO 16 to GND, 10kΩ from GPIO 19 to GND
5. **Wire SPDT manual switches** in parallel with ESP32 relay outputs (optional)
6. **Power supply**: 220V AC → 24V DC (5.5A) → LM2596S → 5V for ESP32/relays

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
   - Verify MQTT topics match your dashboard configuration

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
[SENSOR] Dispositivos DS18B20 encontrados: 1
[SENSOR] Temperatura: 22.5°C
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
5. Credentials are saved in localStorage for future sessions

#### Pump Toggle Switch
- **Blue toggle switch** with power icon labeled "Bomba"
- Slide to toggle pump ON/OFF
- Blue background (#001A72) when ON with light grey slider dot
- Grey background when OFF with white slider dot
- Combined with valve mode buttons in unified control panel
- Automatically disabled during MQTT disconnection
- Detects conflicts with active programs

#### Valve Mode Buttons
- **Two compact buttons**: Cascada (waterfall icon) and Eyectores (water jet icon)
- Located below pump toggle in same container
- Click to switch between modes
- Active mode highlighted in blue (#001A72) with white icon and text
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
  - Temperature readings
- **▼** button: Expand/collapse
- **🗑️** button: Clear log

### Manual Override

**Manual SPDT switches work in parallel with ESP32:**

1. **Scenario**: Dashboard shows pump OFF, but you flip manual switch → Pump turns ON
2. **ESP32 has no feedback** - it doesn't know about manual changes
3. **Both controls work independently** - OR logic (either manual OR ESP32 can activate)

**Note**: ESP32 operates "blind" - it sends commands but doesn't verify state. If manual switch is used, dashboard won't reflect the change.

---

## 🔧 Control Logic

### Pump Control (Standard Relay)

```cpp
// User clicks "Turn ON" in dashboard
1. Set GPIO 19 HIGH (relay closes)
2. Pump motor receives 220V AC power
3. Update internal state variable
4. Publish "ON" to MQTT pump/state topic
```

### Valve Control (Single Relay, NC+NO Parallel)

```cpp
// User clicks "Change to Mode 2"
1. Set GPIO 16 HIGH (relay energizes)
2. NC valve closes, NO valve opens (opposite polarity)
3. Water flow direction changes
4. Update internal mode variable
5. Publish "2" to MQTT valve/state topic
```

### Temperature Reading

**DS18B20 OneWire sensor on GPIO 33:**

```cpp
// Every 60 seconds in loop()
1. Request temperature from sensor
2. Wait for conversion (~750ms max)
3. Read temperature value (°C with 1 decimal)
4. Publish to MQTT temperature/state topic
```

---

## ⏰ Automatic Program Execution

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

### Code Organization

All code files follow consistent structure with section separators:

**ESP32 Firmware** (`main.cpp`):
- Constants → State → Temperature Sensor → MQTT Publishing → Relay Control → Control Logic → Timer → MQTT Handler → WiFi → NTP → MQTT TLS → Setup/Loop

**JavaScript Modules** (`app.js`, `programas.js`):
- Constants → State → DOM Cache → Initialization → Event Listeners → Business Logic → Public API

**HTML** (`index.html`):
- Meta → Styles → Config → Header → Main Screen → Timer Screen → Programas Screen → Create Program Screen → Footer → Scripts

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

## 🚀 Future Enhancements

- [ ] **WiFi Provisioning / Captive Portal** - Allow WiFi network selection at first boot without hard-coding credentials. ESP32 creates temporary access point, user connects and provides WiFi credentials through web interface
- [ ] Temperature alert thresholds (low/high water temp)
- [ ] OTA (Over-The-Air) firmware updates
- [ ] Historical data visualization and analytics
- [ ] Email/SMS notifications for critical events
- [ ] Integration with Home Assistant / Google Home
- [ ] Multiple device support (control multiple pools)
- [ ] Relay health monitoring (click count tracking)


### What Changed

| Old System | New System |
|------------|------------|
| 2× Independent valves | Single relay → parallel NC+NO valves |
| MOSFET control | SONGLE standard relays |
| No sensors | DS18B20 temperature sensor |
| Separate ON/OFF buttons | Click-to-toggle cards |


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
