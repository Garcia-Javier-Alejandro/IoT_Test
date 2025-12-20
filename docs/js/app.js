/**
 * Main Application Module
 * Orchestrates all components: UI state, MQTT, history, and logging.
 * This is the entry point for the dashboard.
 */

const AppModule = (() => {
  // UI state
  let lastState = "UNKNOWN"; // "ON" | "OFF" | "UNKNOWN"

  // Cached DOM elements
  let elements = {};

  /**
   * Initialize the entire application
   * Requires APP_CONFIG to be available from config.js
   */
  async function init() {
    // Validate APP_CONFIG
    if (!window.APP_CONFIG) {
      alert("APP_CONFIG no está definido. ¿Incluiste config.js?");
      throw new Error("APP_CONFIG no definido");
    }

    const { MQTT_WSS_URL, TOPIC_CMD, TOPIC_STATE, HIVEMQ_HOST, DEVICE_ID } =
      window.APP_CONFIG;
    if (!MQTT_WSS_URL || !TOPIC_CMD || !TOPIC_STATE) {
      alert("APP_CONFIG incompleto: falta MQTT_WSS_URL, TOPIC_CMD o TOPIC_STATE");
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

    // Initialize history module
    HistoryModule.init(
      elements.historyChart,
      elements.historyHint,
      elements.btnHistoryRefresh,
      elements.historyLast
    );

    // Setup MQTT event callbacks
    setupMQTTEvents();

    // Wire up UI event listeners
    wireUIEvents(TOPIC_CMD);

    // Load stored credentials
    loadStoredCredentials();

    // Initialize UI state
    setValveState("UNKNOWN");
    disconnectUI();

    // Load initial history
    await HistoryModule.load(
      "24h",
      DEVICE_ID || "esp32-01",
      (msg) => LogModule.append(msg)
    );

    // Auto-connect if credentials are available
    if (elements.userInput.value && elements.passInput.value) {
      connectMQTT(
        elements.userInput.value.trim(),
        elements.passInput.value,
        MQTT_WSS_URL,
        TOPIC_STATE,
        { HIVEMQ_HOST, DEVICE_ID }
      );
    } else {
      LogModule.append("Ingresá credenciales MQTT y presioná Conectar");
    }

    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      HistoryModule.cleanup();
      MQTTModule.disconnect();
    });
  }

  /**
   * Cache all required DOM elements at startup
   * Maps HTML IDs to camelCase properties
   */
  function cacheElements() {
    const mapping = {
      "led-dot": "ledDot",
      "led-status": "ledStatus",
      "conn-text": "connText",
      "btn-on": "btnOn",
      "btn-off": "btnOff",
      "log-box": "logBox",
      "mqtt-user": "userInput",
      "mqtt-pass": "passInput",
      "btn-connect": "btnConnect",
      "login-card": "loginCard",
      "btn-log-toggle": "btnLogToggle",
      "btn-log-clear": "btnLogClear",
      "history-box": "historyBox",
      "btn-history-refresh": "btnHistoryRefresh",
      "history-last": "historyLast",
      "historyChart": "historyChart",
      "historyHint": "historyHint",
    };

    const missing = [];
    for (const [id, key] of Object.entries(mapping)) {
      const el = document.getElementById(id);
      if (!el) missing.push(id);
      elements[key] = el;
    }

    // Cache range buttons (NodeList)
    elements.rangeButtons = document.querySelectorAll(".range-btn");

    if (missing.length > 0) {
      console.warn("Missing DOM elements:", missing);
    }
  }

  /**
   * Setup MQTT event callbacks
   */
  function setupMQTTEvents() {
    MQTTModule.onEvents(
      // onStateChange callback
      (state) => {
        setValveState(state);
        // Schedule debounced history refresh on state change
        HistoryModule.scheduleRefresh(800);
      },
      // onConnected callback
      () => {
        connectUI();
      },
      // onDisconnected callback
      () => {
        disconnectUI();
      }
    );
  }

  /**
   * Wire up UI event listeners
   * @param {string} topicCmd - MQTT topic for commands
   */
  function wireUIEvents(topicCmd) {
    // Time range selector buttons
    if (elements.rangeButtons) {
      elements.rangeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const range = btn.getAttribute("data-range");
          elements.rangeButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          HistoryModule.load(
            range,
            window.APP_CONFIG.DEVICE_ID || "esp32-01",
            LogModule.append
          );
        });
      });
    }

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
        connectMQTT(
          u,
          p,
          window.APP_CONFIG.MQTT_WSS_URL,
          window.APP_CONFIG.TOPIC_STATE,
          {
            HIVEMQ_HOST: window.APP_CONFIG.HIVEMQ_HOST,
            DEVICE_ID: window.APP_CONFIG.DEVICE_ID,
          }
        );
      });
    }

    // ON button
    if (elements.btnOn) {
      elements.btnOn.addEventListener("click", () => {
        MQTTModule.publish(
          "ON",
          topicCmd,
          (msg) => LogModule.append(msg)
        );
      });
    }

    // OFF button
    if (elements.btnOff) {
      elements.btnOff.addEventListener("click", () => {
        MQTTModule.publish(
          "OFF",
          topicCmd,
          (msg) => LogModule.append(msg)
        );
      });
    }
  }

  /**
   * Connect to MQTT broker
   */
  function connectMQTT(username, password, brokerUrl, topicState, config) {
    MQTTModule.connect(
      brokerUrl,
      username,
      password,
      { cmd: window.APP_CONFIG.TOPIC_CMD, state: topicState },
      config.DEVICE_ID,
      config,
      (msg) => LogModule.append(msg)
    );
  }

  /**
   * Update valve state display and button states
   */
  function setValveState(state) {
    lastState = state;

    if (elements.ledDot) {
      if (state === "ON") {
        elements.ledDot.className = "dot on";
      } else if (state === "OFF") {
        elements.ledDot.className = "dot off";
      } else {
        elements.ledDot.className = "dot";
      }
    }

    if (elements.ledStatus) {
      if (state === "ON") {
        elements.ledStatus.textContent = "ABIERTA";
      } else if (state === "OFF") {
        elements.ledStatus.textContent = "CERRADA";
      } else {
        elements.ledStatus.textContent = "DESCONOCIDO";
      }
    }

    updateButtonStates();
  }

  /**
   * Update button enabled/disabled states based on connection and LED state
   */
  function updateButtonStates() {
    const connected = MQTTModule.isConnected();

    if (!connected) {
      if (elements.btnOn) elements.btnOn.disabled = true;
      if (elements.btnOff) elements.btnOff.disabled = true;
      return;
    }

    if (lastState === "ON") {
      if (elements.btnOn) elements.btnOn.disabled = true;
      if (elements.btnOff) elements.btnOff.disabled = false;
    } else if (lastState === "OFF") {
      if (elements.btnOn) elements.btnOn.disabled = false;
      if (elements.btnOff) elements.btnOff.disabled = true;
    } else {
      if (elements.btnOn) elements.btnOn.disabled = false;
      if (elements.btnOff) elements.btnOff.disabled = false;
    }
  }

  /**
   * Update UI for connected state
   */
  function connectUI() {
    if (elements.connText) elements.connText.textContent = "Conectado";
    updateButtonStates();
    if (elements.loginCard) elements.loginCard.style.display = "none";

    // Start auto-refresh and load history
    HistoryModule.startAutoRefresh();
    const deviceId = window.APP_CONFIG && window.APP_CONFIG.DEVICE_ID
      ? window.APP_CONFIG.DEVICE_ID
      : "esp32-01";
    HistoryModule.load(
      "24h",
      deviceId,
      (msg) => LogModule.append(msg)
    );
  }

  /**
   * Update UI for disconnected state
   */
  function disconnectUI() {
    if (elements.connText) elements.connText.textContent = "Desconectado";
    updateButtonStates();
    if (elements.loginCard) elements.loginCard.style.display = "";

    // Stop auto-refresh
    HistoryModule.stopAutoRefresh();
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
