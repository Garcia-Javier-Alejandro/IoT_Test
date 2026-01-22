# BLE Provisioning Root Cause Analysis & Fix Plan

**Date:** 2024
**Author:** AI Engineering Agent
**Status:** Analysis Complete

---

## Executive Summary

After thorough analysis of the ESP32 pool controller firmware, dashboard JavaScript, and HTML UI, I've identified multiple root causes for the WiFi scan failure after clearing credentials. The issue is not a single bug but a combination of:

1. **WiFi driver state corruption** after `WiFi.disconnect(true, true)` 
2. **Blocking BLE callbacks** that execute long WiFi scans synchronously
3. **Timing issues** between WiFi state transitions and BLE operations
4. **UUID mismatches** between firmware and JavaScript
5. **Missing documentation** for proper provisioning flow

---

## Root Cause Analysis

### Root Cause 1: WiFi Driver State Corruption

**Location:** `src/main.cpp` lines ~380-395 and `src/ble_provisioning.cpp` `scanWiFiNetworks()`

**Problem:** When WiFi credentials are cleared via `clear_wifi` command:
```cpp
// main.cpp - WiFi clear handler
WiFi.disconnect(true /*wifioff*/, true /*erasePersistent*/);
ESP.restart();
```

The ESP-IDF WiFi driver may not fully reset. After restart, when `scanWiFiNetworks()` runs:
```cpp
// ble_provisioning.cpp
WiFi.mode(WIFI_STA);
delay(100);
int numNetworks = WiFi.scanNetworks();
```

**Why it fails:**
- `WiFi.disconnect(true, true)` can leave the WiFi driver in an inconsistent state
- The `WIFI_STA` mode set may not properly reinitialize the radio
- BLE and WiFi coexistence requires specific initialization order
- The ESP32's WiFi driver sometimes needs a full deinit/reinit cycle

**Evidence:** The scan returns 0 or -1 networks even when networks are available.

### Root Cause 2: Blocking BLE Callback

**Location:** `src/ble_provisioning.cpp` lines ~85-100

**Problem:** WiFi scan is performed synchronously inside BLE characteristic callback:
```cpp
else if (uuid == NETWORKS_CHAR_UUID) {
  Serial.println("[BLE] Networks scan triggered via write");
  String json = scanWiFiNetworks();  // BLOCKING CALL - ~500ms+ duration
  
  pCharacteristic->setValue((uint8_t*)json.c_str(), json.length());
  pCharacteristic->notify();
}
```

**Why it fails:**
- BLE callbacks should return quickly (< 100ms) to maintain connection stability
- WiFi.scanNetworks() can take 500ms-2 seconds depending on environment
- Long blocking calls can cause BLE connection drops
- The NimBLE stack may not process events correctly during blocking operations

### Root Cause 3: Race Condition After Clear WiFi

**Problem Flow:**
1. User clicks "Clear WiFi" in dashboard
2. Dashboard writes "clear_wifi" to COMMAND_CHAR_UUID
3. ESP32 receives command, calls `WiFi.disconnect(true, true)`, restarts
4. BLE starts advertising
5. Dashboard reconnects
6. Dashboard triggers network scan → **FAILS (empty list)**

**Gap:** No proper state machine to ensure WiFi driver is fully ready before scanning.

### Root Cause 4: UUID Mismatch Between Firmware and Dashboard

**Firmware (`ble_provisioning.cpp`):**
```cpp
#define COMMAND_CHAR_UUID   "8b9d68c4-57b8-4b02-bf19-6fd94b62f709"
```

**Dashboard (`ble-provisioning.js`):**
```javascript
COMMAND_CHAR_UUID: '0b9f1e80-0f88-4b68-9a09-9d1d6921d0d8',
```

**Impact:** The `clearWifiCredentials()` function in the dashboard will silently fail because it's writing to the wrong characteristic.

### Root Cause 5: Missing Status Notifications for Network Scan

**Problem:** Dashboard doesn't subscribe to network scan notifications and has no way to know when scan completes or fails.

---

## Proposed Fixes (Ranked by Impact)

### Fix 1: Hard-Reset WiFi State Before Every Scan (HIGH IMPACT, LOW EFFORT)

**File:** `src/ble_provisioning.cpp`

**Change:** Modify `scanWiFiNetworks()` to properly reset WiFi driver:
```cpp
String scanWiFiNetworks() {
  Serial.println("[BLE] Scanning WiFi networks...");
  
  // Properly reset WiFi driver state
  WiFi.mode(WIFI_OFF);
  delay(100);
  WiFi.mode(WIFI_STA);
  delay(200);  // Longer delay for radio initialization
  
  // Perform WiFi scan
  int numNetworks = WiFi.scanNetworks();
  
  if (numNetworks == 0 || numNetworks == -1) {
    Serial.println("[BLE] No networks found or scan failed");
    Serial.print("[BLE] WiFi status: ");
    Serial.println(WiFi.status());
    return "[]";
  }
  // ... rest unchanged
}
```

**Rationale:**
- `WIFI_OFF` ensures complete WiFi stack reset
- Longer delay gives radio time to initialize after BLE is active
- Logging WiFi status helps diagnostics

### Fix 2: Make Scan Non-Blocking (HIGH IMPACT, MEDIUM EFFORT)

**File:** `src/ble_provisioning.cpp`

**Change:** Use deferred execution instead of blocking BLE callback:
```cpp
static bool pendingNetworkScan = false;

// In onWrite callback for NETWORKS_CHAR_UUID:
else if (uuid == NETWORKS_CHAR_UUID) {
  Serial.println("[BLE] Networks scan requested");
  pendingNetworkScan = true;  // Set flag, handle in main loop
}

// In main loop() - add section for BLE operations:
if (isBLEProvisioningActive()) {
  // ... existing code ...
  
  // Handle deferred network scan
  if (pendingNetworkScan) {
    pendingNetworkScan = false;
    String json = scanWiFiNetworks();
    
    if (pNetworksCharacteristic) {
      pNetworksCharacteristic->setValue((uint8_t*)json.c_str(), json.length());
      pNetworksCharacteristic->notify();
      Serial.println("[BLE] Network scan complete, notified client");
    }
  }
}
```

**Rationale:**
- BLE callbacks return immediately
- Main loop handles long operations
- Better for connection stability

### Fix 3: Add Network Scan Status Characteristic (MEDIUM IMPACT, MEDIUM EFFORT)

**Files:** `src/ble_provisioning.cpp`, `src/ble_provisioning.h`, `src/main.cpp`, `dashboard/ble-provisioning.js`

**Change:** Add a dedicated status characteristic for network scanning:
- `SCAN_STATUS_CHAR_UUID` - indicates scan started/completed/failed
- Dashboard subscribes to notifications
- Enables proper async scan flow

**Rationale:**
- Dashboard knows when scan is complete
- Can show progress indicator
- Enables retry logic on failure

### Fix 4: Fix UUID Mismatch (CRITICAL, LOW EFFORT)

**File:** `dashboard/ble-provisioning.js`

**Change:** Update `COMMAND_CHAR_UUID` to match firmware:
```javascript
// Change from:
COMMAND_CHAR_UUID: '0b9f1e80-0f88-4b68-9a09-9d1d6921d0d8',
// To:
COMMAND_CHAR_UUID: '8b9d68c4-57b8-4b02-bf19-6fd94b62f709',
```

### Fix 5: Add Retry Logic with Backoff (MEDIUM IMPACT, LOW EFFORT)

**File:** `dashboard/ble-provisioning.js`

**Change:** In `sendCredentials()` or provisioning flow:
```javascript
async sendCredentialsWithRetry(ssid, password, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.sendCredentials(ssid, password);
      return true;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
}
```

**Rationale:**
- Handles transient BLE/WiFi coexistence issues
- Exponential backoff prevents flooding

---

## Documentation Inconsistencies

### Finding 1: Device Name Mismatch

| Source | Name | Notes |
|--------|------|-------|
| Firmware `ble_provisioning.cpp` | `Controlador Smart Pool-XXXX-v2` | Spanish name |
| Firmware `main.cpp` WiFiManager | `ESP32-Pool-Setup` | Different name |
| Dashboard `ble-provisioning.js` | Filters by `ESP32-Pool` | Generic prefix |

**Resolution:** Standardize on `Controlador Smart Pool-{MAC}` format. Update WiFiManager fallback to use same naming.

### Finding 2: Missing README

**Issue:** `BLE_PROVISIONING_README.md` is referenced in open tabs but does not exist.

**Resolution:** Create comprehensive documentation covering:
- BLE provisioning flow
- Characteristic UUID reference
- Status values
- Troubleshooting guide

### Finding 3: Status Characteristic Values Not Documented

**Values used in firmware:**
- `"waiting"` - Initial state
- `"connected"` - BLE client connected
- `"ssid_received"` - SSID written
- `"password_received"` - Password written  
- `"credentials_ready"` - Both credentials received
- `"clear_wifi_requested"` - Clear command received

**Resolution:** Document all status values in header file and create user guide.

---

## Recommended Fix Implementation Order

1. **FIX-1:** Fix UUID mismatch in JavaScript (5 minutes)
2. **FIX-2:** Hard-reset WiFi state in `scanWiFiNetworks()` (10 minutes)
3. **FIX-3:** Add retry logic to provisioning flow (15 minutes)
4. **FIX-4:** Create documentation (30 minutes)
5. **FIX-5:** Non-blocking scan (optional, 1 hour)

---

## Code Changes Required

### File: `src/ble_provisioning.cpp`

```diff
@@ Scan WiFi networks and return JSON array
@@ @return JSON string with network list: [{"ssid":"NETWORK1","rssi":-50,"open":false},...]
@@ Call this in response to a scan request from the dashboard
@@/
 String scanWiFiNetworks() {
   Serial.println("[BLE] Scanning WiFi networks...");
   
-  // Ensure WiFi is in station mode for scanning (required for BLE coexistence)
-  WiFi.mode(WIFI_STA);
-  delay(100); // Give WiFi radio time to initialize
+  // Properly reset WiFi driver state for BLE coexistence
+  WiFi.mode(WIFI_OFF);
+  delay(100);
+  WiFi.mode(WIFI_STA);
+  delay(200); // Give WiFi radio time to initialize after BLE is active
   
   // Perform WiFi scan
   int numNetworks = WiFi.scanNetworks();
   
   if (numNetworks == 0 || numNetworks == -1) {
     Serial.println("[BLE] No networks found or scan failed");
+    Serial.print("[BLE] WiFi status code: ");
+    Serial.println(WiFi.status());
     return "[]";
   }
```

### File: `dashboard/ble-provisioning.js`

```diff
   SERVICE_UUID: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
   SSID_CHAR_UUID: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
   PASSWORD_CHAR_UUID: 'cba1d466-344c-4be3-ab3f-189f80dd7518',
   STATUS_CHAR_UUID: '8d8218b6-97bc-4527-a8db-13094ac06b1d',
   NETWORKS_CHAR_UUID: 'fa87c0d0-afac-11de-8a39-0800200c9a66',
-  COMMAND_CHAR_UUID: '0b9f1e80-0f88-4b68-9a09-9d1d6921d0d8',
+  COMMAND_CHAR_UUID: '8b9d68c4-57b8-4b02-bf19-6fd94b62f709',
```

---

## Files to Create/Update

1. **`docs/BLE_PROVISIONING.md`** - Complete BLE provisioning documentation
2. **`src/ble_provisioning.cpp`** - Fix WiFi reset and add logging
3. **`dashboard/ble-provisioning.js`** - Fix UUID, add retry logic
4. **`include/ble_provisioning.h`** - Document status values
5. **`src/main.cpp`** - Standardize device naming

---

## Testing Recommendations

1. **Clear WiFi → BLE Connect → Scan Test:**
   - Clear credentials via MQTT
   - Restart device
   - Connect via Web Bluetooth
   - Trigger network scan
   - Verify networks appear

2. **Multiple Scan Attempts:**
   - Scan, wait 5 seconds, scan again
   - Verify consistent results

3. **BLE Connection Stability:**
   - During WiFi scan, verify BLE stays connected
   - Monitor for unexpected disconnections

4. **Stress Test:**
   - Rapid clear/scan/provision cycles
   - Verify no memory leaks or state corruption

---

## Architectural Debt (Deferred)

The following items are identified but should be deferred:

1. **Async Scan with Status Characteristic:** Would require significant refactor for minimal gain. The fix sequence above addresses the immediate issue.

2. **BLE/WiFi Coexistence Tuning:** ESP-IDF has coexistence parameters that could be tuned, but default values work for most home environments.

3. **Mobile App Provisioning:** Not in scope for this residential IoT product.

4. **Cloud Dependency for Provisioning:** Would add unnecessary complexity.

---

## Questions for Product Owner

1. **What is the expected maximum retry count?** (Current proposal: 3)
2. **Should network scan be automatic on connect, or manual trigger?**
3. **Should we persist the last known network list to show immediately while rescanning?**

---

*This analysis is based on code inspection. Validation with actual hardware testing is recommended before deploying fixes.*

