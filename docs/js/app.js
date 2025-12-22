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
        valveState: window.APP_CONFIG.TOPIC_VALVE_STATE
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
    
    // Update connection indicator with animated ping
    if (elements.connIndicator) {
      elements.connIndicator.innerHTML = `
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
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
        <span class="relative inline-flex rounded-full h-3 w-3 bg-slate-400"></span>
      `;
    }
    
    updateButtonStates();
    if (elements.loginCard) elements.loginCard.style.display = "";
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
