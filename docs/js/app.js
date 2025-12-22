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
      null, // No toggle button in new design
      elements.btnLogClear
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
      "pump-status-badge": "pumpStatusBadge",
      "pump-icon": "pumpIcon",
      "valve-mode-label": "valveModeLabel",
      "conn-text": "connText",
      "conn-indicator": "connIndicator",
      "wifi-icon": "wifiIcon",
      "wifi-ssid": "wifiSsid",
      "btn-pump": "btnPump",
      "btn-valve": "btnValve",
      "log-box": "logBox",
      "mqtt-user": "userInput",
      "mqtt-pass": "passInput",
      "btn-connect": "btnConnect",
      "login-card": "loginCard",
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

    // Valve toggle button (switches between mode 1 and mode 2)
    if (elements.btnValve) {
      elements.btnValve.addEventListener("click", () => {
        const newMode = valveMode === "1" ? "2" : "1";
        LogModule.append(`Cambiando válvulas a modo ${newMode}...`);
        MQTTModule.publish(
          newMode,
          window.APP_CONFIG.TOPIC_VALVE_CMD,
          (msg) => LogModule.append(msg)
        );
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

    // Update button colors based on state
    if (elements.btnPump) {
      if (state === "ON") {
        // Blue when ON
        elements.btnPump.className = "w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xl py-5 px-6 rounded-2xl shadow-xl shadow-blue-700/20 transition-all active:scale-[0.98] flex items-center justify-between group border border-blue-800/10";
      } else if (state === "OFF") {
        // Dull grey-blue when OFF
        elements.btnPump.className = "w-full bg-slate-400 hover:bg-slate-500 text-white font-extrabold text-xl py-5 px-6 rounded-2xl shadow-xl shadow-slate-400/20 transition-all active:scale-[0.98] flex items-center justify-between group border border-slate-500/10";
      } else {
        // Default primary blue for unknown state
        elements.btnPump.className = "w-full bg-primary hover:bg-primary-hover text-white font-extrabold text-xl py-5 px-6 rounded-2xl shadow-xl shadow-blue-700/20 transition-all active:scale-[0.98] flex items-center justify-between group border border-blue-800/10 disabled:opacity-50 disabled:cursor-not-allowed";
      }
    }

    if (elements.pumpLabel) {
      if (state === "ON") {
        elements.pumpLabel.textContent = "Apagar bomba";
      } else if (state === "OFF") {
        elements.pumpLabel.textContent = "Encender bomba";
      } else {
        elements.pumpLabel.textContent = "Estado desconocido";
      }
    }

    if (elements.pumpStatusBadge) {
      if (state === "ON") {
        elements.pumpStatusBadge.textContent = "ON";
      } else if (state === "OFF") {
        elements.pumpStatusBadge.textContent = "OFF";
      } else {
        elements.pumpStatusBadge.textContent = "?";
      }
    }

    updateButtonStates();
  }

  /**
   * Update valve mode display
   */
  function setValveMode(mode) {
    valveMode = mode;

    if (elements.valveModeLabel) {
      if (mode === "1") {
        elements.valveModeLabel.textContent = "Modo 1: Cascada";
      } else if (mode === "2") {
        elements.valveModeLabel.textContent = "Modo 2: Eyectores";
      } else {
        elements.valveModeLabel.textContent = "Modo ?";
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
    if (elements.btnValve) {
      elements.btnValve.disabled = !connected;
    }
  }

  /**
   * Update UI for connected state
   */
  function connectUI() {
    if (elements.connText) elements.connText.textContent = "Conectado";
    
    // Update connection indicator with animated ping (blue instead of green)
    if (elements.connIndicator) {
      elements.connIndicator.innerHTML = `
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
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
    
    // Update connection indicator to gray
    if (elements.connIndicator) {
      elements.connIndicator.innerHTML = `
        <span class="relative inline-flex rounded-full h-2 w-2 bg-slate-400"></span>
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
      // Disconnected state
      if (elements.wifiIcon) elements.wifiIcon.textContent = "wifi_off";
      if (elements.wifiIcon) elements.wifiIcon.className = "material-icons-round text-slate-400 text-lg";
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
      iconColor = "text-blue-600";
    } else if (quality === "fair") {
      icon = "network_wifi_3_bar";
      iconColor = "text-yellow-600";
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
