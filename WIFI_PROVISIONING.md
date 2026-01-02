# WiFi Provisioning Implementation

## Overview

This implementation uses **WiFiManager** to enable dynamic WiFi credential entry via a captive portal on first boot. No more hardcoded WiFi credentials in `secrets.h`!

## How It Works

### First Boot (No WiFi Credentials)

1. **ESP32 Detection**: On first boot, ESP32 detects no saved WiFi credentials
2. **Access Point Mode**: ESP32 creates a temporary WiFi hotspot named `ESP32-Pool-Setup`
3. **Captive Portal**: Device automatically opens a web portal when user connects
4. **Network Selection**: User sees list of available WiFi networks
5. **Credentials Entry**: User selects their network and enters the password
6. **Auto-Save**: Credentials are encrypted and saved to ESP32 flash memory (EEPROM)
7. **Auto-Reboot**: ESP32 restarts and connects to the configured network

### Subsequent Boots (With Saved Credentials)

1. **Auto-Connect**: ESP32 automatically connects to the saved WiFi network
2. **No Portal**: Captive portal only appears if connection fails
3. **Timeout Protection**: If provisioning fails, ESP32 reboots after 3 minutes

### Reconnection Handling

If WiFi connection is lost during operation:
- WiFiManager handles reconnection attempts automatically
- On persistent failure, the system can trigger AP mode for re-provisioning
- Loop function monitors connection status

## Technical Details

### Dependencies

**platformio.ini:**
```ini
lib_deps =
  tzapu/WiFiManager@^0.16.0
```

### Key Functions

#### `initWiFiProvisioning()`
- Initializes WiFiManager instance
- Sets up callbacks for WiFi events
- Configures 3-minute timeout for portal
- Returns true if WiFi connected, false if timeout

#### Callbacks
- `onWiFiConnect()`: Called when WiFi connection succeeds
- `onWiFiAPStart()`: Called when AP mode starts (provisioning mode)

### Flow Diagram

```
Boot
  ↓
initWiFiProvisioning()
  ↓
Has saved credentials?
  ├─ YES → WiFiManager.autoConnect() → Connected ✓
  │
  └─ NO → Start AP Mode
           ↓
           User connects to ESP32-Pool-Setup
           ↓
           Captive Portal opens
           ↓
           User enters WiFi credentials
           ↓
           Credentials saved to flash
           ↓
           ESP32 reboots
           ↓
           Connected ✓
```

## User Instructions

### First Time Setup

1. **Power on ESP32**
2. **Look for WiFi network**: `ESP32-Pool-Setup` (no password)
3. **Connect to it**
4. **Open browser**: http://192.168.4.1
5. **Select your WiFi network** from the list
6. **Enter password**
7. **Click "Save"**
8. **ESP32 automatically reboots** and connects

### Resetting WiFi Credentials

To reset and re-provision WiFi:

**Option A: Via firmware**
- Add a "Reset WiFi" feature that calls `wm.resetSettings()` then reboots
- Could be triggered by MQTT message or button press

**Option B: Erase flash**
```bash
esptool.py erase_flash
```

## Security Considerations

✅ **Encrypted Storage**: WiFiManager uses encrypted EEPROM storage
✅ **No Credentials in Code**: Removed hardcoded SSID/password from firmware
✅ **No Hardcoded Fallbacks**: No multiple WIFI_SSID_2, WIFI_SSID_3, etc.
✅ **Default Timeout**: Portal automatically closes after 3 minutes

⚠️ **AP Mode Security**: `ESP32-Pool-Setup` has no password. For production:
  - Add AP password: `wm.autoConnect("ESP32-Pool-Setup", "setup-password")`
  - Use WPA2 for the AP mode

## Troubleshooting

### Portal doesn't appear

1. Check if WiFi is already configured: Press reset, hold button during boot
2. Check serial monitor for `[WiFi] Modo AP iniciado`
3. Make sure your device's WiFi is turned on

### Connection keeps dropping

1. Check RSSI (signal strength) in logs
2. Verify SSID doesn't have special characters
3. Ensure password is correct (case-sensitive)

### Credentials not saving

1. Check ESP32's flash size (needs at least 256KB free)
2. Verify no SPIFFS conflicts
3. Clear all WiFi credentials: `wm.resetSettings()`

## Future Enhancements

- [ ] Add web UI toggle to reset WiFi credentials (for user-friendly reset)
- [ ] Add MQTT credentials provisioning (currently hardcoded in secrets.h)
- [ ] Support for WPA3 networks
- [ ] QR code for faster provisioning (WiFi QR on startup display)
- [ ] Persistent config for AP password
- [ ] Network scan timeout optimization

## References

- [WiFiManager GitHub](https://github.com/tzapu/WiFiManager)
- [ESP32 WiFi Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/network/esp_wifi.html)
- [Captive Portal Standard](https://en.wikipedia.org/wiki/Captive_portal)
