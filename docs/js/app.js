/**
 * Pool Control Application Module
 * Simplified dashboard for pump + valve control (no timeline feature)
 */

const AppModule = (() => {
  // UI state
  let pumpState = "UNKNOWN";   // "ON" | "OFF" | "UNKNOWN"
  let valveMode = "UNKNOWN";   // "1" | "2" | "UNKNOWN"

  // Cached DOM elements
  let elements = {};

  /**
   * Initialize the entire application
   */
  async function init() {
    // Validate APP_CONFIG
    if (!window.APP_CONFIG) {
      alert("APP_CONFIG no está definido. ¿Incluiste config.js?");
      throw new Error("APP_CONFIG no definido");
    }

    const { MQTT_WSS_URL, TOPIC_PUMP_CMD, TOPIC_PUMP_STATE, TOPIC_VALVE_CMD, TOPIC_VALVE_STATE } =
      window.APP_CONFIG;
    if (!MQTT_WSS_URL || !TOPIC_PUMP_CMD || !TOPIC_PUMP_STATE || !TOPIC_VALVE_CMD || !TOPIC_VALVE_STATE) {
      alert("APP_CONFIG incompleto: falta configuración de topics");
      throw new Error("APP_CONFIG incompleto");
    }

    // Cache all required DOM elements
    cacheElements();

    // Initialize logging module
    LogModule.init(
      elements.logBox,
      elements.btnLogToggle,
      elements.btnLogClear,
      elements.logContainer,
      elements.logToggleIcon,
      elements.logTimestamp
    );

    // Setup MQTT event callbacks
    setupMQTTEvents();

    // Wire up UI event listeners
    wireUIEvents();

    // Load stored credentials
    loadStoredCredentials();

    // Initialize UI state
    setPumpState("UNKNOWN");
    setValveMode("UNKNOWN");
    disconnectUI();

    // Auto-connect if credentials are available
    if (elements.userInput.value && elements.passInput.value) {
      connectMQTT(
        elements.userInput.value.trim(),
        elements.passInput.value,
        MQTT_WSS_URL
      );
    } else {
      LogModule.append("Ingresá credenciales MQTT y presioná Conectar");
    }

    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      MQTTModule.disconnect();
    });
  }

  /**
   * Cache all required DOM elements at startup
   */
  function cacheElements() {
    const mapping = {
      "pump-label": "pumpLabel",
      "pump-ring": "pumpRing",
      "btn-valve-1": "btnValve1",
      "btn-valve-2": "btnValve2",
      "btn-timer": "btnTimer",
      "btn-programas": "btnProgramas",
      "conn-text": "connText",
      "conn-indicator": "connIndicator",
      "wifi-icon": "wifiIcon",
      "wifi-ssid": "wifiSsid",
      "btn-pump": "btnPump",
      "log-box": "logBox",
      "log-container": "logContainer",
      "log-toggle-icon": "logToggleIcon",
      "log-timestamp": "logTimestamp",
      "mqtt-user": "userInput",
      "mqtt-pass": "passInput",
      "btn-connect": "btnConnect",
      "login-card": "loginCard",
      "btn-log-toggle": "btnLogToggle",
      "btn-log-clear": "btnLogClear",
    };

    const missing = [];
    for (const [id, key] of Object.entries(mapping)) {
      const el = document.getElementById(id);
      if (!el) missing.push(id);
      elements[key] = el;
    }

    if (missing.length > 0) {
      console.warn("Missing DOM elements:", missing);
    }
  }

  /**
   * Setup MQTT event callbacks
   */
  function setupMQTTEvents() {
    MQTTModule.onEvents(
      // onPumpStateChange callback
      (state) => {
        setPumpState(state);
      },
      // onValveStateChange callback
      (mode) => {
        setValveMode(mode);
      },
      // onConnected callback
      () => {
        connectUI();
      },
      // onDisconnected callback
      () => {
        disconnectUI();
      },
      // onWiFiEvent callback (NEW!)
      (event) => {
        LogModule.append(`[WiFi] ${event}`);
      },
      // onWiFiStateChange callback
      (wifiState) => {
        updateWiFiStatus(wifiState);
      }
    );
  }

  /**
   * Wire up UI event listeners
   */
  function wireUIEvents() {
    // Connect button
    if (elements.btnConnect) {
      elements.btnConnect.addEventListener("click", () => {
        const u = elements.userInput.value.trim();
        const p = elements.passInput.value;
        if (!u || !p) {
          LogModule.append("Completá username y password");
          return;
        }
        saveStoredCredentials(u, p);
        connectMQTT(u, p, window.APP_CONFIG.MQTT_WSS_URL);
      });
    }

    // Pump toggle button
    if (elements.btnPump) {
      elements.btnPump.addEventListener("click", () => {
        const newState = pumpState === "ON" ? "OFF" : "ON";
        const action = newState === "ON" ? "Encendiendo" : "Apagando";
        LogModule.append(`${action} bomba...`);
        MQTTModule.publish(
          newState,
          window.APP_CONFIG.TOPIC_PUMP_CMD,
          (msg) => LogModule.append(msg)
        );
      });
    }

    // Valve mode 1 button (Cascada)
    if (elements.btnValve1) {
      elements.btnValve1.addEventListener("click", () => {
        if (valveMode === "1") return; // Already in mode 1
        LogModule.append(`Cambiando válvulas a modo 1 (Cascada)...`);
        MQTTModule.publish(
          "1",
          window.APP_CONFIG.TOPIC_VALVE_CMD,
          (msg) => LogModule.append(msg)
        );
      });
    }

    // Valve mode 2 button (Eyectores)
    if (elements.btnValve2) {
      elements.btnValve2.addEventListener("click", () => {
        if (valveMode === "2") return; // Already in mode 2
        LogModule.append(`Cambiando válvulas a modo 2 (Eyectores)...`);
        MQTTModule.publish(
          "2",
          window.APP_CONFIG.TOPIC_VALVE_CMD,
          (msg) => LogModule.append(msg)
        );
      });
    }

    // Timer button (placeholder)
    if (elements.btnTimer) {
      elements.btnTimer.addEventListener("click", () => {
        LogModule.append("Timer: Funcionalidad próximamente");
      });
    }

    // Programas button (placeholder)
    if (elements.btnProgramas) {
      elements.btnProgramas.addEventListener("click", () => {
        LogModule.append("Programas: Funcionalidad próximamente");
      });
    }
  }

  /**
   * Connect to MQTT broker
   */
  function connectMQTT(username, password, brokerUrl) {
    MQTTModule.connect(
      brokerUrl,
      username,
      password,
      {
        pumpState: window.APP_CONFIG.TOPIC_PUMP_STATE,
        valveState: window.APP_CONFIG.TOPIC_VALVE_STATE,
        wifiState: window.APP_CONFIG.TOPIC_WIFI_STATE
      },
      window.APP_CONFIG.DEVICE_ID,
      (msg) => LogModule.append(msg)
    );
  }

  /**
   * Update pump state display
   */
  function setPumpState(state) {
    pumpState = state;

    if (elements.pumpLabel) {
      if (state === "ON") {
        elements.pumpLabel.textContent = "Bomba ON";
      } else if (state === "OFF") {
        elements.pumpLabel.textContent = "Bomba OFF";
      } else {
        elements.pumpLabel.textContent = "Bomba ?";
      }
    }

    // Update pump ring animation
    if (elements.pumpRing) {
      if (state === "ON") {
        elements.pumpRing.className = "animate-ping absolute inline-flex h-12 w-12 rounded-full bg-white opacity-20";
      } else {
        elements.pumpRing.className = "absolute inline-flex h-12 w-12 rounded-full bg-white opacity-20";
      }
    }

    updateButtonStates();
  }

  /**
   * Update valve mode display
   */
  function setValveMode(mode) {
    valveMode = mode;

    // Update button styles based on active mode
    if (elements.btnValve1 && elements.btnValve2) {
      if (mode === "1") {
        // Cascada active
        elements.btnValve1.className = "bg-primary hover:bg-primary-hover text-white font-bold text-base py-6 px-4 rounded-2xl border-2 border-primary shadow-lg transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-2";
        elements.btnValve2.className = "bg-white hover:bg-slate-50 text-slate-900 font-bold text-base py-6 px-4 rounded-2xl border-2 border-slate-300 shadow-sm transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-2";
      } else if (mode === "2") {
        // Eyectores active
        elements.btnValve1.className = "bg-white hover:bg-slate-50 text-slate-900 font-bold text-base py-6 px-4 rounded-2xl border-2 border-slate-300 shadow-sm transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-2";
        elements.btnValve2.className = "bg-primary hover:bg-primary-hover text-white font-bold text-base py-6 px-4 rounded-2xl border-2 border-primary shadow-lg transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-2";
      } else {
        // Unknown state
        elements.btnValve1.className = "bg-white hover:bg-slate-50 text-slate-900 font-bold text-base py-6 px-4 rounded-2xl border-2 border-slate-300 shadow-sm transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
        elements.btnValve2.className = "bg-white hover:bg-slate-50 text-slate-900 font-bold text-base py-6 px-4 rounded-2xl border-2 border-slate-300 shadow-sm transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
      }
    }

    updateButtonStates();
  }

  /**
   * Update button enabled/disabled states based on connection
   */
  function updateButtonStates() {
    const connected = MQTTModule.isConnected();

    if (elements.btnPump) {
      elements.btnPump.disabled = !connected;
    }
    if (elements.btnValve1) {
      elements.btnValve1.disabled = !connected;
    }
    if (elements.btnValve2) {
      elements.btnValve2.disabled = !connected;
    }
  }

  /**
   * Update UI for connected state
   */
  function connectUI() {
    if (elements.connText) elements.connText.textContent = "Conectado";
    
    // Update connection indicator with animated ping (green)
    if (elements.connIndicator) {
      elements.connIndicator.innerHTML = `
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-green-600"></span>
      `;
    }
    
    updateButtonStates();
    if (elements.loginCard) elements.loginCard.style.display = "none";
    LogModule.append("✓ Conectado al broker MQTT");
  }

  /**
   * Update UI for disconnected state
   */
  function disconnectUI() {
    if (elements.connText) elements.connText.textContent = "Desconectado";
    
    // Update connection indicator to red
    if (elements.connIndicator) {
      elements.connIndicator.innerHTML = `
        <span class="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
      `;
    }
    
    updateButtonStates();
    if (elements.loginCard) elements.loginCard.style.display = "";
  }

  /**
   * Update WiFi status display
   */
  function updateWiFiStatus(wifiState) {
    if (!wifiState || wifiState.status !== "connected") {
      // Disconnected state - red
      if (elements.wifiIcon) elements.wifiIcon.textContent = "wifi_off";
      if (elements.wifiIcon) elements.wifiIcon.className = "material-icons-round text-red-600 text-lg";
      if (elements.wifiSsid) elements.wifiSsid.textContent = "Sin WiFi";
      return;
    }

    // Connected state
    const { ssid, ip, rssi, quality } = wifiState;
    
    // Update icon based on signal quality
    let icon = "wifi";
    let iconColor = "text-slate-400";
    
    if (quality === "excellent") {
      icon = "wifi";
      iconColor = "text-green-600";
    } else if (quality === "good") {
      icon = "wifi";
      iconColor = "text-blue-400";
    } else if (quality === "fair") {
      icon = "network_wifi_3_bar";
      iconColor = "text-yellow-500";
    } else {
      icon = "network_wifi_1_bar";
      iconColor = "text-orange-600";
    }
    
    if (elements.wifiIcon) {
      elements.wifiIcon.textContent = icon;
      elements.wifiIcon.className = `material-icons-round ${iconColor} text-lg`;
    }
    
    if (elements.wifiSsid) elements.wifiSsid.textContent = ssid || "WiFi";
  }

  /**
   * Load credentials from localStorage
   */
  function loadStoredCredentials() {
    const LS_USER = "mqtt_user";
    const LS_PASS = "mqtt_pass";
    if (elements.userInput) elements.userInput.value = localStorage.getItem(LS_USER) || "";
    if (elements.passInput) elements.passInput.value = localStorage.getItem(LS_PASS) || "";
  }

  /**
   * Save credentials to localStorage
   */
  function saveStoredCredentials(user, pass) {
    const LS_USER = "mqtt_user";
    const LS_PASS = "mqtt_pass";
    localStorage.setItem(LS_USER, user);
    localStorage.setItem(LS_PASS, pass);
  }

  return {
    init,
  };
})();

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  AppModule.init().catch((err) => {
    console.error("App initialization failed:", err);
  });
});
