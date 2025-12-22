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
      "pump-dot": "pumpDot",
      "pump-status": "pumpStatus",
      "valve-dot": "valveDot",
      "valve-status": "valveStatus",
      "conn-text": "connText",
      "btn-pump": "btnPump",
      "btn-valve": "btnValve",
      "log-box": "logBox",
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

    if (elements.pumpDot) {
      if (state === "ON") {
        elements.pumpDot.className = "dot on";
      } else if (state === "OFF") {
        elements.pumpDot.className = "dot off";
      } else {
        elements.pumpDot.className = "dot";
      }
    }

    if (elements.pumpStatus) {
      if (state === "ON") {
        elements.pumpStatus.textContent = "ON";
      } else if (state === "OFF") {
        elements.pumpStatus.textContent = "OFF";
      } else {
        elements.pumpStatus.textContent = "?";
      }
    }

    // Update button text based on state
    if (elements.btnPump) {
      if (state === "ON") {
        elements.btnPump.classList.remove("btn-on");
        elements.btnPump.classList.add("btn-off");
        elements.btnPump.textContent = "Apagar bomba";
      } else {
        elements.btnPump.classList.remove("btn-off");
        elements.btnPump.classList.add("btn-on");
        elements.btnPump.textContent = "Encender bomba";
      }
    }

    updateButtonStates();
  }

  /**
   * Update valve mode display
   */
  function setValveMode(mode) {
    valveMode = mode;

    if (elements.valveDot) {
      if (mode === "1" || mode === "2") {
        elements.valveDot.className = "dot on";
      } else {
        elements.valveDot.className = "dot";
      }
    }

    if (elements.valveStatus) {
      if (mode === "1") {
        elements.valveStatus.textContent = "1";
      } else if (mode === "2") {
        elements.valveStatus.textContent = "2";
      } else {
        elements.valveStatus.textContent = "?";
      }
    }

    // Update button text based on mode
    if (elements.btnValve) {
      if (mode === "1") {
        elements.btnValve.textContent = "Cambiar a modo 2";
      } else if (mode === "2") {
        elements.btnValve.textContent = "Cambiar a modo 1";
      } else {
        elements.btnValve.textContent = "Cambiar modo";
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
    updateButtonStates();
    if (elements.loginCard) elements.loginCard.style.display = "none";
    LogModule.append("✓ Conectado al broker MQTT");
  }

  /**
   * Update UI for disconnected state
   */
  function disconnectUI() {
    if (elements.connText) elements.connText.textContent = "Desconectado";
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
