# ESP32 Pool Controller - BLE Provisioning

## 🎯 Overview

This implementation adds **Bluetooth Low Energy (BLE) provisioning** to your ESP32 Pool Controller, enabling WiFi setup directly from your HTTPS dashboard without network switching or HTTP security warnings.

## 🏗️ Architecture

```
┌─────────────────┐         BLE          ┌──────────────┐
│   Dashboard     │ ◄──────────────────► │    ESP32     │
│ (HTTPS Website) │   WiFi Credentials   │ Pool Device  │
└─────────────────┘                       └──────────────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │   Home WiFi  │
                                          │   + MQTT     │
                                          └──────────────┘
```

## 📁 Files Created

### ESP32 Firmware
- **`include/ble_provisioning.h`** - BLE provisioning interface
- **`src/ble_provisioning.cpp`** - BLE provisioning implementation
- **`src/main.cpp`** - Updated with BLE + NVS integration

### Dashboard (Web)
- **`dashboard/ble-provisioning.js`** - Web Bluetooth API module
- **`dashboard/add-device.html`** - Standalone provisioning page

## 🔧 How It Works

### First Boot (No WiFi Credentials)
1. ESP32 starts **BLE advertising** as `ESP32-Pool-XXXX`
2. User opens dashboard → clicks "Add Device"
3. Browser shows BLE device picker (Web Bluetooth API)
4. User selects ESP32 device
5. Dashboard sends WiFi SSID + password via BLE
6. ESP32 saves credentials to **NVS** (non-volatile storage)
7. ESP32 connects to WiFi + MQTT
8. BLE shuts down (saves power)

### Subsequent Boots
1. ESP32 loads credentials from NVS
2. Auto-connects to WiFi directly
3. No BLE needed (fast boot)

### Fallback Option
- **WiFiManager** captive portal remains available as backup
- Can be triggered manually if BLE fails

## 🚀 Testing Instructions

### 1. Build & Flash Firmware

```powershell
# In the firmware directory
platformio run --target upload
platformio device monitor
```

### 2. Clear Credentials (Force BLE Mode)

Uncomment in `main.cpp` around line 626:
```cpp
// clearWiFiCredentials();
// Serial.println("[WiFi] Credentials cleared for testing");
```

Flash once, then re-comment.

### 3. Test BLE Provisioning

**Requirements:**
- Chrome, Edge, or Opera browser (Web Bluetooth support)
- Desktop or Android (iOS Safari doesn't support Web Bluetooth yet)

**Steps:**
1. Open `dashboard/add-device.html` in Chrome
2. Power on ESP32 - wait for BLE advertising log:
   ```
   [BLE] Device name: ESP32-Pool-XX
   [BLE] Waiting for dashboard connection...
   ```
3. Enter WiFi credentials in dashboard
4. Click "Scan for Device"
5. Select `ESP32-Pool-XXXX` from browser popup
6. Watch ESP32 serial monitor:
   ```
   [BLE] Client connected
   [BLE] SSID received: YourNetwork
   [BLE] Password received (8 chars)
   [BLE] ✓ WiFi credentials complete
   [WiFi] ✓ CONNECTED
   ```

### 4. Verify Auto-Connect

Power cycle ESP32:
```
[NVS] ✓ Loaded WiFi credentials for: YourNetwork
[WiFi] Connecting to: YourNetwork
[WiFi] ✓ CONNECTED
```

Should connect immediately without BLE.

## 📱 Browser Compatibility

| Browser | Desktop | Android | iOS |
|---------|---------|---------|-----|
| Chrome  | ✅      | ✅      | ❌  |
| Edge    | ✅      | ✅      | ❌  |
| Opera   | ✅      | ✅      | ❌  |
| Safari  | ❌      | ❌      | ❌  |
| Firefox | ❌      | ❌      | ❌  |

**Note:** iOS users must use WiFiManager fallback (captive portal).

## 🔌 Integration with Cloudflare Dashboard

### Option 1: Embed in Existing Dashboard

```html
<!-- In your main dashboard HTML -->
<script src="/ble-provisioning.js"></script>

<button onclick="addDevice()">Add Device</button>

<script>
async function addDevice() {
  const ssid = prompt('WiFi Network:');
  const password = prompt('WiFi Password:');
  
  await ESP32BLEProvisioning.provision(ssid, password, {
    onSuccess: () => alert('Device added!'),
    onError: (err) => alert('Error: ' + err.message)
  });
}
</script>
```

### Option 2: Link to Standalone Page

```html
<a href="/add-device.html">
  <button>➕ Add Device</button>
</a>
```

Upload both `ble-provisioning.js` and `add-device.html` to Cloudflare Pages.

## 🎨 Customization

### Change BLE Device Name

In `ble_provisioning.cpp` line 130:
```cpp
snprintf(deviceName, sizeof(deviceName), "MyPool-%02X%02X", mac[4], mac[5]);
```

### Change Timeout / UX

In `main.cpp`:
```cpp
#define BLE_CHECK_INTERVAL 1000  // Check for credentials every 1s
```

In `add-device.html`:
```javascript
await new Promise(resolve => setTimeout(resolve, 3000)); // Wait time
```

## 🐛 Troubleshooting

### "Web Bluetooth not supported"
- Use Chrome/Edge/Opera browser
- Enable flags if needed: `chrome://flags/#enable-web-bluetooth`

### BLE not advertising
Check serial monitor for:
```
[BLE] Initializing BLE provisioning...
[BLE] Device name: ESP32-Pool-XXXX
```

If missing, credentials might already exist. Clear NVS.

### Credentials sent but WiFi fails
- Check SSID/password are correct
- Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)
- Check WiFi signal strength

### iOS devices
Use WiFiManager fallback - BLE provisioning not supported on iOS.

## 📊 Serial Monitor Output Guide

**Successful BLE Provisioning:**
```
[BLE] Initializing BLE provisioning...
[BLE] Device name: ESP32-Pool-A4B2
[BLE] ✓ Provisioning service started
[BLE] Client connected
[BLE] SSID received: MyWiFi
[BLE] Password received (10 chars)
[BLE] ✓ WiFi credentials complete
[BLE] Stopping provisioning service...
[WiFi] Connecting to: MyWiFi
...
[WiFi] ✓ CONNECTED
[NVS] ✓ Saved WiFi credentials for: MyWiFi
```

**Subsequent Boots:**
```
[NVS] ✓ Loaded WiFi credentials for: MyWiFi
[WiFi] Connecting to: MyWiFi
[WiFi] ✓ CONNECTED
```

## 🎯 Benefits Over Captive Portal

| Feature | BLE Provisioning | Captive Portal |
|---------|------------------|----------------|
| Dashboard stays HTTPS | ✅ | ❌ (HTTP only) |
| No network switching | ✅ | ❌ (must join AP) |
| Desktop support | ✅ | ✅ |
| Mobile support | ✅ (Android) | ✅ |
| iOS support | ❌ | ✅ |
| User experience | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

## 🔐 Security Notes

- BLE credentials transfer happens over **encrypted BLE connection**
- Credentials stored in **ESP32 NVS** (encrypted flash)
- MQTT connection uses **TLS (port 8883)**
- Dashboard must be served over **HTTPS** for Web Bluetooth API

## ✅ Next Steps

1. Build and test ESP32 firmware with BLE
2. Upload dashboard files to Cloudflare Pages
3. Test provisioning flow end-to-end
4. Integrate "Add Device" button into main dashboard
5. Consider adding device discovery/pairing UI

---

**Created:** January 2, 2026  
**Version:** 2.0 (BLE Provisioning)
