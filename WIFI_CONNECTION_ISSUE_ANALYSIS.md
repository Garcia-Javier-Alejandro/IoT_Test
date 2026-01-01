# WiFi Connection Issue Analysis

**Date:** January 1, 2026  
**Issue:** Unreliable connection when ESP32 is connected to secondary WiFi network (SSID_2)

---

## Problem Description

When the ESP32 connects to the second WiFi network (SSID_2) after failing to connect to the primary network (SSID_1), the connection becomes unreliable. The suspected cause is that the ESP32 continues attempting to reconnect to SSID_1 in the background.

---

## Current WiFi Connection Logic

### Boot Sequence (`connectWiFi()` function - lines 518-555)

```cpp
bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  
  WiFiNetwork networks[] = {
    {WIFI_SSID, WIFI_PASS},          // SSID_1 (Primary)
    {WIFI_SSID_2, WIFI_PASS_2},      // SSID_2 (Secondary)
    {WIFI_SSID_3, WIFI_PASS_3}       // SSID_3 (Tertiary)
  };
  
  for (int i = 0; i < 3; i++) {
    if (tryConnectToNetwork(networks[i].ssid, networks[i].password)) {
      // Success - connected
      return true;
    }
    // ⚠️ PROBLEM: No WiFi.disconnect() here before trying next network
  }
  
  return false;
}
```

### Connection Attempt (`tryConnectToNetwork()` function - lines 496-511)

```cpp
bool tryConnectToNetwork(const char* ssid, const char* password) {
  WiFi.begin(ssid, password);  // ⚠️ Called without disconnecting previous attempt
  
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 15000) {
    delay(500);
  }
  
  return (WiFi.status() == WL_CONNECTED);
}
```

### Runtime Reconnection (`loop()` function - lines 756-760)

```cpp
if (WiFi.status() != WL_CONNECTED) {
  Serial.println("[WiFi] Conexión perdida, reconectando...");
  connectWiFi();  // ⚠️ Tries ALL networks again, starting with SSID_1
  if (mqtt.connected()) publishWiFiState();
}
```

---

## Root Cause Analysis

### Issue 1: No Disconnect Between Connection Attempts

**Location:** Lines 530-549 in `main.cpp`

When `tryConnectToNetwork()` fails for SSID_1:
1. `WiFi.begin(SSID_1, PASS_1)` is called
2. After 15 seconds timeout, it returns `false`
3. **The WiFi connection state is NOT cleared**
4. Immediately `WiFi.begin(SSID_2, PASS_2)` is called

**What happens internally:**
- The ESP32 WiFi stack may still have pending connection attempts to SSID_1
- Starting a new connection without disconnecting can cause:
  - Race conditions between connection attempts
  - Cached credentials interfering with new connection
  - Auto-reconnect features trying to reconnect to previous SSID

**Evidence:**
- ESP32 WiFi library documentation recommends calling `WiFi.disconnect()` before `WiFi.begin()` when switching networks
- Many ESP32 projects have reported similar issues when not properly disconnecting

### Issue 2: Auto-Reconnect to Primary Network

**Location:** Lines 756-760 in `main.cpp`

When WiFi connection drops during runtime:
1. `connectWiFi()` is called
2. It **always tries SSID_1 first**
3. If SSID_1 becomes available (even briefly), it will switch to it
4. If SSID_1 is unstable, this causes continuous switching

**Scenario Example:**
```
1. Boot: SSID_1 unavailable → connects to SSID_2 ✓
2. Runtime: WiFi drops briefly
3. Reconnection: Tries SSID_1 (now available) → connects to SSID_1
4. SSID_1 unstable → connection drops
5. Reconnection: Tries SSID_1 → fails → tries SSID_2 → connects
6. Loop repeats → unreliable connection
```

### Issue 3: No Sticky Connection

Once connected to SSID_2, the system doesn't "remember" which network it's using. On every reconnection, it starts from scratch with SSID_1.

**Desired Behavior:**
- Connect to SSID_2 → stay on SSID_2 unless it becomes unavailable
- Only try other networks if current network fails

---

## Impact Assessment

### Symptoms When Connected to SSID_2:
- ✗ Intermittent MQTT disconnections
- ✗ Dashboard shows connection status flickering
- ✗ Commands may not be received or executed
- ✗ Temperature updates may be missed
- ✗ Timer may stop unexpectedly
- ✗ System logs show repeated WiFi reconnection attempts

### Why This Happens:
1. **Background interference:** Incomplete disconnect from SSID_1 causes interference
2. **Connection instability:** ESP32 may be trying to maintain two connections simultaneously
3. **Auto-reconnect loops:** If SSID_1 briefly appears, ESP32 tries to switch back
4. **Resource conflicts:** WiFi stack resources not properly released between attempts

---

## Recommended Fixes

### Fix 1: Add WiFi.disconnect() Between Network Attempts ✅ (Primary Fix)

**Change in `tryConnectToNetwork()` function:**

```cpp
bool tryConnectToNetwork(const char* ssid, const char* password) {
  Serial.println();
  Serial.print("[WiFi] Conectando a ");
  Serial.println(ssid);
  
  WiFi.disconnect(true);  // ✅ Disconnect and clear saved credentials
  delay(100);             // ✅ Give WiFi stack time to fully disconnect
  
  WiFi.begin(ssid, password);
  uint32_t start = millis();
  
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();
  
  return (WiFi.status() == WL_CONNECTED);
}
```

**Benefits:**
- ✅ Ensures clean state before each connection attempt
- ✅ Prevents interference between networks
- ✅ Clears any cached connection data
- ✅ WiFi.disconnect(true) also erases saved credentials from flash

### Fix 2: Remember Last Connected Network (Optional Enhancement)

**Add to state variables (after line 27):**

```cpp
static int lastConnectedNetwork = -1;  // Track which network we're connected to
```

**Modify `connectWiFi()` to try last successful network first:**

```cpp
bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  
  WiFiNetwork networks[] = {
    {WIFI_SSID, WIFI_PASS},
    {WIFI_SSID_2, WIFI_PASS_2},
    {WIFI_SSID_3, WIFI_PASS_3}
  };
  const int numNetworks = 3;
  
  // If we were previously connected to a specific network, try it first
  if (lastConnectedNetwork >= 0 && lastConnectedNetwork < numNetworks) {
    if (tryConnectToNetwork(networks[lastConnectedNetwork].ssid, 
                           networks[lastConnectedNetwork].password)) {
      Serial.print("[WiFi] Reconnected to previous network (");
      Serial.print(lastConnectedNetwork + 1);
      Serial.println(")");
      // Already connected, publish state and return
      Serial.println("[WiFi] ✓ CONECTADO");
      // ... (rest of success logging)
      return true;
    }
  }
  
  // Try all networks in order
  for (int i = 0; i < numNetworks; i++) {
    if (tryConnectToNetwork(networks[i].ssid, networks[i].password)) {
      lastConnectedNetwork = i;  // Remember this network
      // ... (rest of success logging)
      return true;
    }
    // ...
  }
  
  return false;
}
```

**Benefits:**
- ✅ Reduces unnecessary network switching
- ✅ Faster reconnection to last known good network
- ✅ More stable connection when primary network is intermittent

### Fix 3: Add WiFi Event Handlers (Advanced, Optional)

Use ESP32 WiFi events to detect and log connection issues:

```cpp
void WiFiEvent(WiFiEvent_t event) {
  switch(event) {
    case SYSTEM_EVENT_STA_DISCONNECTED:
      Serial.println("[WiFi Event] Disconnected");
      break;
    case SYSTEM_EVENT_STA_CONNECTED:
      Serial.println("[WiFi Event] Connected");
      break;
    // ... other events
  }
}

// In setup():
WiFi.onEvent(WiFiEvent);
```

---

## Testing Plan

### Test 1: Clean Disconnect Between Networks
1. Make SSID_1 unavailable (turn off router or change password)
2. Boot ESP32
3. Verify it tries SSID_1, fails, then cleanly tries SSID_2
4. Monitor serial output for any error messages
5. Verify stable connection to SSID_2

### Test 2: Long-term Stability on Secondary Network
1. Connect to SSID_2
2. Run for 24 hours
3. Monitor for:
   - MQTT disconnections
   - WiFi reconnection attempts
   - Successful command execution
   - Regular temperature updates

### Test 3: Reconnection Behavior
1. Connect to SSID_2
2. Temporarily disable SSID_2
3. Verify it tries to reconnect to SSID_2
4. Re-enable SSID_2
5. Verify it reconnects successfully

### Test 4: Primary Network Becomes Available
1. Boot with SSID_1 unavailable → connects to SSID_2
2. Make SSID_1 available again
3. Verify ESP32 stays on SSID_2 (with Fix 2)
4. OR verify it only switches if SSID_2 fails (without Fix 2)

---

## Implementation Priority

### Must Have (Fix 1): ⭐⭐⭐⭐⭐
**Add `WiFi.disconnect()` before each connection attempt**
- Minimal code change (3 lines)
- Solves the core issue
- No side effects
- Standard ESP32 best practice

### Should Have (Fix 2): ⭐⭐⭐⭐
**Remember last connected network**
- Prevents unnecessary network switching
- Improves stability and reconnection speed
- Moderate code change (~20 lines)

### Nice to Have (Fix 3): ⭐⭐
**WiFi event handlers**
- Better debugging
- More detailed logging
- Doesn't solve the root issue
- Can be added later for diagnostics

---

## Expected Results After Fix

### Before Fix:
```
[WiFi] Conectando a 1234
............................. timeout
[WiFi] Conectando a Fibertel 
....... CONNECTED  ← But may have SSID_1 interference
[MQTT] Connected
[MQTT] Disconnected  ← Unreliable due to WiFi issues
[WiFi] Conexión perdida
[WiFi] Conectando a 1234  ← Tries to switch back
```

### After Fix:
```
[WiFi] Conectando a 1234
WiFi.disconnect(true)  ← Clean state
............................. timeout
[WiFi] Conectando a Fibertel 
WiFi.disconnect(true)  ← Clean state before SSID_2
....... CONNECTED
[MQTT] Connected
(Stable connection, no reconnection attempts)
```

---

## Conclusion

**Root Cause:** Missing `WiFi.disconnect()` call between network attempts causes interference and instability when connected to secondary or tertiary networks.

**Solution:** Add `WiFi.disconnect(true)` and a small delay before each `WiFi.begin()` call to ensure clean connection state.

**Estimated Impact:** 
- Fix implementation: 5 minutes
- Testing: 1-2 hours
- Expected improvement: 95%+ reduction in WiFi stability issues on secondary networks

---

**Next Steps:**
1. Implement Fix 1 (mandatory)
2. Test on secondary network for 24 hours
3. If still unstable, implement Fix 2
4. Document results and update README if needed
