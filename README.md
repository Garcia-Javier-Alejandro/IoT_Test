Placeholder for commit test
# ESP32 Pool Control System v2.5

IoT-based swimming pool control system using ESP32, MQTT, and DS18B20 temperature sensor. Controls a 220V pump and 24V electrovalves with manual override capability, automated scheduling, and BLE WiFi provisioning.

## 🏊 Project Overview

This system allows remote control of:
- **1× Swimming pool pump** (220V AC) via standard SONGLE relay
- **2× Electrovalves** (24V) wired in parallel (NC + NO) - controlled by single relay
  - Relay LOW = Mode 1 (Cascada) - NC valve open, NO valve closed
  - Relay HIGH = Mode 2 (Eyectores) - NC valve closed, NO valve open
- **1× DS18B20 temperature sensor** - Pool water temperature monitoring

### Key Features

- ✅ **BLE WiFi Provisioning** - No-code WiFi setup via Web Bluetooth from any Chrome/Edge browser
- ✅ **WiFi Network Scanner** - Automatic network discovery during provisioning (no manual SSID entry)
- ✅ **Remote WiFi Clearing** - MQTT command to clear credentials and force provisioning mode
- ✅ **MQTT Last Will and Testament** - Automatic "disconnected" status on connection loss
- ✅ **Standard relay control** - Continuous HIGH/LOW for SONGLE SRD-5VDC-SL-C relays
- ✅ **Temperature monitoring** - DS18B20 OneWire sensor with 1-minute update intervals
- ✅ **Manual override compatibility** - SPDT switches wired in parallel with ESP32 relays
- ✅ **Blind control** - No feedback sensors, simple command-based operation
- ✅ **MQTT over TLS** - Secure communication via HiveMQ Cloud (port 8883)
- ✅ **Modern responsive dashboard** - Mobile-first design with Tailwind CSS
- ✅ **Countdown timer** - Set duration and mode for automatic pump shutoff
- ✅ **Program scheduling** - Up to 3 weekly schedules with automatic execution
- ✅ **Conflict detection** - Automatic handling of timer/program/manual conflicts
- ✅ **WiFi status monitoring** - Real-time signal strength with color-coded indicators
- ✅ **Event logging** - Collapsible log panel with timestamps
- ✅ **Localized interface** - Spanish translation throughout dashboard UI
- ✅ **Resource optimization** - BLE stops after WiFi connects (saves 30-50KB RAM)

---

## 📁 Project Structure

```
IoT/
├── firmware/                    # ESP32 firmware (PlatformIO)
│   ├── src/
│   │   ├── main.cpp            # Main control logic
│   │   └── ble_provisioning.cpp # BLE WiFi provisioning implementation
│   ├── include/
│   │   ├── config.h            # GPIO pins, MQTT topics, thresholds
│   │   ├── secrets.h           # WiFi/MQTT credentials (not committed)
│   │   ├── ble_provisioning.h  # BLE provisioning API
│   │   └── ca_cert.h           # TLS certificate
│   └── platformio.ini          # PlatformIO configuration
│
├── docs/                        # Web dashboard (PWA-ready)
│   ├── index.html              # Main dashboard (unified design)
│   ├── config.js               # MQTT topics and device ID
│   ├── js/
│   │   ├── app.js              # Main application controller
│   │   ├── mqtt.js             # MQTT client wrapper
│   │   ├── ble-provisioning.js # Web Bluetooth provisioning client
│   │   ├── programas.js        # Schedule management module
│   │   ├── log.js              # Event logging module
│   │   └── history.js          # Historical data (optional)
│   ├── logo.png                # Application logo
│   └── _routes.json            # Deployment routes config
│
├── WIRING_DIAGRAM.md           # Complete hardware wiring guide
├── DEVICE_PROVISIONING.md      # WiFi provisioning guide (BLE & Captive Portal)
├── MULTI_USER_ARCHITECTURE.md  # Multi-user SaaS architecture guide (future scaling)
├── CODE_REVIEW.md              # Code quality review and recommendations
└── README.md                   # This file
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
| `devices/esp32-pool-01/wifi/clear` | Dashboard → ESP32 | `clear` | Clear WiFi credentials, force provisioning mode |
| `devices/esp32-pool-01/pump/state` | ESP32 → Dashboard | `ON`, `OFF` | Pump actual state (retained) |
| `devices/esp32-pool-01/valve/set` | Dashboard → ESP32 | `1`, `2`, `TOGGLE` | Valve mode commands |
| `devices/esp32-pool-01/valve/state` | ESP32 → Dashboard | `1`, `2` | Valve actual mode (retained) |
| `devices/esp32-pool-01/temperature/state` | ESP32 → Dashboard | `25.3` | Pool water temperature in °C (retained, updates every 60s) |
| `devices/esp32-pool-01/status` | ESP32 → Dashboard (LWT) | `online`, `disconnected` | Device connection status (Last Will and Testament) |

**Note:** The ESP32 uses MQTT Last Will and Testament (LWT) to automatically publish `disconnected` to the `status` topic when it loses connection to the broker. On successful connection, it publishes `online`.

---

## 🔵 BLE WiFi Provisioning

### Overview

The system includes **BLE provisioning** for WiFi configuration without needing to switch networks or use insecure HTTP. Configuration is done directly from the HTTPS dashboard using the Web Bluetooth API.

### How It Works

#### First Boot (No WiFi Credentials)
1. ESP32 starts **BLE advertising** as `ESP32-Pool-XXXX` (XX = last 2 MAC digits)
2. User visits https://iot-5wo.pages.dev → clicks blue "Add Device" button
3. Modal appears asking for WiFi credentials
4. User enters SSID and password → clicks "Connect"
5. Browser shows BLE device picker → user selects ESP32-Pool-XXXX
6. Dashboard sends credentials via encrypted BLE
7. ESP32 saves credentials to **NVS** (Non-Volatile Storage)
8. ESP32 connects to WiFi → connects to MQTT
9. BLE shuts down automatically (saves ~30-50KB RAM and CPU cycles)
10. Modal shows "✓ Device connected!" and auto-closes

#### Subsequent Boots (WiFi Saved)
1. ESP32 loads credentials from NVS
2. Auto-connects to WiFi directly (no BLE overhead)
3. Connects to MQTT immediately
4. Fast boot (~5 seconds)

#### Remote WiFi Credential Clearing
1. User clicks "Disconnect devices" button in dashboard
2. Dashboard publishes `clear` message to MQTT topic `devices/esp32-pool-01/wifi/clear`
3. ESP32 receives command, publishes `disconnected` status, erases NVS credentials
4. ESP32 automatically restarts
5. On restart without credentials, returns to BLE provisioning mode
6. User can re-configure WiFi from dashboard

**Important:** WiFi clearing uses MQTT, NOT BLE. This allows remote device disconnection without physical proximity.

### BLE Service UUIDs

**Primary Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b`

| Characteristic | UUID | R/W | Description |
|----------------|------|-----|-------------|
| SSID | `beb5483e-36e1-4688-b7f5-ea07361b26a8` | Write | WiFi network name
| Password | `1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e` | Write | WiFi password
| Networks | `d3a6f5c8-2b1e-4a9c-8f7d-6e5c4b3a2d1e` | Read | Available networks list (JSON)
| Status | `a1b2c3d4-e5f6-7890-1234-567890abcdef` | Read | Provisioning status
| Command | `8b9d68c4-57b8-4b02-bf19-6fd94b62f709` | Write | Special commands (deprecated, use MQTT)

### Automatic Network Scanning

During provisioning, the ESP32 automatically scans available WiFi networks and displays them in the dashboard. The list is optimized for BLE transmission:

- **Size limit:** JSON <400 bytes (avoids BLE MTU issues)
- **Format:** `[{"ssid":"MyWiFi","rssi":-45,"auth":3}, ...]`
- **Filtering:** Duplicates and networks without SSID removed
- **Sorting:** By signal strength (RSSI) descending

**Example network JSON:**
```json
[
  {"ssid":"Casa_WiFi","rssi":-42,"auth":3},
  {"ssid":"Vecino_5G","rssi":-68,"auth":4}
]
```

### Browser Compatibility

| Browser | Desktop | Android | iOS |
|---------|---------|---------|-----|
| Chrome  | ✅ Working | ✅ Working | ❌ Not Supported |
| Edge    | ✅ Working | ✅ Working | ❌ Not Supported |
| Opera   | ✅ Working | ✅ Working | ❌ Not Supported |
| Safari  | ❌ No Web Bluetooth | ❌ No Web Bluetooth | ❌ No Web Bluetooth |
| Firefox | ❌ Disabled by default | ❌ Disabled by default | ❌ Not Supported |

**iOS Users:** Use WiFiManager captive portal fallback (connect to `ESP32-Pool-Setup` AP → http://192.168.4.1)

### Resource Optimization

**RAM Savings:**
- BLE automatically stops after WiFi successfully connects
- Typical savings: **30-50KB of RAM**
- CPU cycle savings by not processing unnecessary BLE events

**Rationale:**
- Keeping BLE active after WiFi connection is resource waste
- WiFi clear command moved to MQTT (more efficient than BLE)
- BLE only needed during initial provisioning

### BLE Troubleshooting

**"No Characteristics matching UUID" error:**
- ESP32 already has WiFi saved (not in provisioning mode)
- Solution: Click "Disconnect devices" (clears WiFi via MQTT), restart ESP32

**"User cancelled" error:**
- User cancelled device selection
- Solution: Click "Retry" and select the device

**"GATT Server disconnected" error:**
- Browser pairing cache issue
- Solution: 
  1. Chrome Settings → Privacy & Security → Site Settings → Bluetooth → Remove device
  2. Restart ESP32
  3. Retry provisioning

**Truncated or incomplete network JSON:**
- BLE MTU limited to ~512 bytes
- Automatic solution: Firmware limits JSON to 400 bytes, only shows strongest networks

**BLE and WiFi interfere with each other:**
- ESP32 has shared 2.4GHz radio
- Implemented solution: `WiFi.mode(WIFI_STA)` before scanning networks

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

**Option A: BLE WiFi Provisioning (Recommended - No Code Changes Required)**

1. Flash firmware with default settings (no WiFi credentials needed)
2. ESP32 boots into BLE provisioning mode automatically
3. Use dashboard to provision WiFi (see "BLE WiFi Provisioning" section below)

**Option B: Hard-Code WiFi Credentials (Traditional)**

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

**Expected boot sequence (without WiFi credentials)**:
```
========================================
   ESP32 Pool Control System v2.0
========================================
[WiFi] Starting WiFi provisioning...
[NVS] No WiFi credentials stored
[WiFi] No valid credentials - starting BLE provisioning...
[BLE] Initializing BLE provisioning...
[BLE] Device name: Controlador Smart Pool 5A00
[BLE] ✓ Provisioning service started
[BLE] Waiting for dashboard connection...
========================================
   Waiting for BLE provisioning...
   Open dashboard to provision device
========================================
```

---

## 📱 BLE WiFi Provisioning

The system includes **zero-configuration WiFi provisioning** via Web Bluetooth. No need to hard-code credentials or recompile firmware!

### How It Works

1. **ESP32 boots without WiFi** → Starts BLE provisioning mode
2. **Advertises as**: `Controlador Smart Pool XXXX` (XXXX = last 4 hex digits of MAC)
3. **Dashboard connects via Web Bluetooth** → Scans available WiFi networks
4. **User selects network** → Enters password → ESP32 saves credentials to NVS
5. **ESP32 reboots** → Connects to WiFi automatically → BLE stops
6. **Credentials persist** → No provisioning needed on subsequent boots

### Provisioning Flow (User Perspective)

1. **Open dashboard** (https://iot-5wo.pages.dev) on Chrome/Edge browser
2. Click **"Conectar dispositivo a WiFi"** button
3. Click **"Escanear redes WiFi"** 
4. **Browser pairing dialog appears** → Select "Controlador Smart Pool XXXX" → Pair
5. **Network list appears automatically** → Select your WiFi network
6. **Enter WiFi password** → Click "Conectar"
7. **ESP32 connects to WiFi** → BLE provisioning stops → Dashboard connects via MQTT

### Technical Details

**BLE GATT Service**:
- **Service UUID**: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- **Characteristics**:
  - `SSID_CHAR` (R/W): WiFi network name
  - `PASSWORD_CHAR` (W): WiFi password (write-only for security)
  - `STATUS_CHAR` (R/Notify): Provisioning status updates
  - `NETWORKS_CHAR` (R/W/Notify): WiFi scan results (JSON array)

**Network Scanning**:
- Dashboard writes `"scan"` to `NETWORKS_CHAR` → Triggers ESP32 WiFi scan
- ESP32 scans networks → Returns JSON: `[{"ssid":"NetworkName","rssi":-45,"open":false},...]`
- Dashboard displays sorted list (strongest signal first) with lock icons

**Browser Requirements**:
- **Chrome 56+** or **Edge 79+** (Web Bluetooth API required)
- **Bluetooth adapter** on device (PC/laptop/phone)
- **Bluetooth enabled** in OS settings
- **HTTPS connection** (required for Web Bluetooth - Cloudflare Pages provides this)

**Fallback**: If Web Bluetooth is unavailable (iOS Safari, Firefox, etc.), credentials must be hard-coded in `secrets.h`

**See**: `WIFI_PROVISIONING.md` for implementation details and architecture

---

### 4. Deploy Dashboard

#### Local Development
```bash
```

#### Production Deployment
The dashboard is automatically deployed via GitHub Actions to Cloudflare Pages:
- **Live URL**: https://iot-5wo.pages.dev
- **Deployment**: Automatic on push to main branch
- **Custom domain**: Can be configured in Cloudflare
- **Auto-deploy from**: `docs/` folder

**Or deploy to any static hosting** (GitHub Pages, Netlify, Vercel, etc.)

### 5. Configure Dashboard & Provision Device

**First Time Setup**:
1. Open dashboard (https://iot-5wo.pages.dev) in Chrome/Edge
2. Click **"Conectar dispositivo a WiFi"** → Provision ESP32 via BLE (see "BLE WiFi Provisioning" section above)
3. After ESP32 connects to WiFi, click main **"Conectar"** button for MQTT
4. Enter MQTT credentials (same as in firmware)
5. Credentials saved in localStorage for future sessions

**Subsequent Usage**:
- Dashboard auto-connects to MQTT on page load
- No provisioning needed unless WiFi credentials change
- Click **"Desconectar dispositivos"** to unpair BLE and start fresh

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
- ✅ **BLE WiFi Provisioning** - Web Bluetooth-based WiFi setup (no code changes needed)
- ✅ **WiFi Network Scanner** - Automatic network discovery via BLE GATT characteristic
- ✅ **Automatic program execution** - 15-minute interval checking with conflict resolution
- ✅ **Timer functionality** - Countdown with auto-shutoff and ESP32 sync
- ✅ **Manual override detection** - Pauses programs when user takes manual control
- ✅ **Responsive UI polish** - Smaller table sizes, improved spacing
- ✅ **Program scheduling** - Up to 3 weekly programs with per-day configuration
- ✅ **Conflict handling** - Timer cancellation, program priority, manual override
- ✅ **Signal strength monitoring** - Color-coded WiFi indicators

## 🚀 Future Enhancements

- [ ] **iOS Support for Provisioning** - Detect iOS browsers and show WiFiManager fallback instructions (Web Bluetooth not supported on iOS)
- [ ] **QR Code Provisioning** - Scan QR codes for quick WiFi setup
- [ ] **Multi-device Provisioning** - Provision multiple ESP32 devices in sequence
- [ ] Temperature alert thresholds (low/high water temp)
- [ ] OTA (Over-The-Air) firmware updates
- [ ] Historical data visualization and analytics
- [ ] Email/SMS notifications for critical events
- [ ] Integration with Home Assistant / Google Home
- [ ] Multiple device support (control multiple pools)
- [ ] Relay health monitoring (click count tracking)
- [ ] **WiFiManager Fallback UI** - Auto-switch to AP mode instructions for devices without Bluetooth
- [ ] Progress bar during provisioning
- [ ] Device nickname/labeling
- [ ] Bluetooth pairing PIN for extra security

## 📝 Changelog v2.5

### New Features
- ✅ **MQTT Last Will and Testament (LWT)**: Automatic connection status updates
- ✅ **Remote WiFi Clearing**: MQTT `wifi/clear` command to erase credentials without BLE
- ✅ **RAM Optimization**: BLE stops after WiFi connects (saves 30-50KB)
- ✅ **Full Localization**: All user-facing messages changed to "Controlador Smart Pool" in Spanish
- ✅ **Automatic Network Scanning**: Dashboard displays available WiFi networks during provisioning

### Technical Improvements
- ✅ Fixed: BLE command characteristic UUID corrected (`8b9d68c4-57b8-4b02-bf19-6fd94b62f709`)
- ✅ Fixed: WiFi network JSON limited to <400 bytes to avoid BLE MTU issues
- ✅ Fixed: `WiFi.mode(WIFI_STA)` before scanning to avoid BLE/WiFi conflicts
- ✅ Fixed: `unpairDevices()` function now uses MQTT instead of BLE
- ✅ Fixed: MQTT LWT configured in `connectMqtt()` with topic `devices/esp32-pool-01/status`

### Architecture Decisions
- Decision: Changed WiFi clearing from BLE to MQTT (more efficient, no BLE overhead)
- Decision: BLE only for initial provisioning, stops after WiFi connected
- Rationale: Avoid resource waste keeping BLE active unnecessarily

## 📄 License

This project is provided as-is for personal use. No warranty. Use at your own risk.

**Electrical work disclaimer**: Pool equipment control involves high voltage. Consult licensed electrician if unsure.

---

## 🙏 Credits

- **Original valve control project**: Foundation for this pool system
- **Developed by**: [Javier Alejandro Garcia](https://github.com/Garcia-Javier-Alejandro)

**Built with**:
- **MQTT.js**: Client library for browser-based MQTT
- **PubSubClient**: Arduino MQTT library  
- **NimBLE-Arduino**: Lightweight Bluetooth Low Energy stack
- **HiveMQ Cloud**: Free tier MQTT broker with TLS
- **PlatformIO**: ESP32 development environment
- **Tailwind CSS**: Utility-first CSS framework

---

## 📧 Support

For issues or questions:
1. Review **WIRING_DIAGRAM.md** for hardware questions
2. Review **WIFI_PROVISIONING.md** for BLE provisioning technical details
3. Open GitHub issue with:
   - Serial monitor output
   - Photos of wiring (if hardware related)
   - Dashboard console errors (F12 in browser)

---

**Built with ☕ in 2025**

