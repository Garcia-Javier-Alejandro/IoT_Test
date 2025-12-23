/**
 * Pool Control Application Module
 * Simplified dashboard for pump + valve control (no timeline feature)
 */

const AppModule = (() => {
  // UI state
  let pumpState = "UNKNOWN";   // "ON" | "OFF" | "UNKNOWN"
  let valveMode = "UNKNOWN";   // "1" | "2" | "UNKNOWN"
  
  // Timer state
  let timerState = {
    active: false,
    mode: 1, // 1 = Cascada, 2 = Eyectores
    duration: 3600, // seconds
    remaining: 0,
    interval: null
  };

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

    // Initialize Programas module
    if (window.ProgramasModule) {
      ProgramasModule.init();
    }

    // Setup MQTT event callbacks
    setupMQTTEvents();

    // Wire up UI event listeners
    wireUIEvents();

    // Start interval to update programas button
    setInterval(updateProgramasButton, 60000); // Update every minute
    updateProgramasButton(); // Initial update

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
      "main-screen": "mainScreen",
      "timer-screen": "timerScreen",
      "btn-back": "btnBack",
      "header-title": "headerTitle",
      "timer-mode-1": "timerMode1",
      "timer-mode-2": "timerMode2",
      "timer-hours": "timerHours",
      "timer-minutes": "timerMinutes",
      "btn-timer-start": "btnTimerStart",
      "btn-timer-cancel": "btnTimerCancel",
      "btn-timer-stop": "btnTimerStop",
      "active-timer-card": "activeTimerCard",
      "timer-countdown": "timerCountdown",
      "timer-mode-display": "timerModeDisplay",
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
      // onWiFiEvent callback
      (event) => {
        LogModule.append(`[WiFi] ${event}`);
      },
      // onWiFiStateChange callback
      (wifiState) => {
        updateWiFiStatus(wifiState);
      },
      // onTimerStateChange callback
      (timerStateUpdate) => {
        handleTimerStateUpdate(timerStateUpdate);
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
        // Check if a program is active
        if (window.ProgramasModule) {
          const activeProgramName = ProgramasModule.getActiveProgramName();
          if (activeProgramName) {
            alert("⚠️ Conflicto con programa activo - Se retomará la tarea al día siguiente");
            LogModule.append(`⚠️ Control manual - Programa "${activeProgramName}" en espera`);
          }
        }
        
        // Toggle based on current known state
        const newState = pumpState === "ON" ? "OFF" : "ON";
        const action = newState === "ON" ? "Encendiendo" : "Apagando";
        LogModule.append(`${action} bomba...`);
        
        // Temporarily disable button to prevent rapid clicking
        elements.btnPump.disabled = true;
        setTimeout(() => {
          if (MQTTModule.isConnected()) {
            elements.btnPump.disabled = false;
          }
        }, 1000);
        
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
        
        // Check if timer is active
        if (timerState.active) {
          alert("⚠️ Timer cancelado - Cambiando a modo Cascada");
          LogModule.append("⚠️ Timer cancelado");
          stopTimer();
        }
        
        // Check if a program is active
        if (window.ProgramasModule) {
          const activeProgramName = ProgramasModule.getActiveProgramName();
          if (activeProgramName) {
            alert("⚠️ Conflicto con programa activo - Se retomará la tarea al día siguiente");
            LogModule.append(`⚠️ Control manual - Programa "${activeProgramName}" en espera`);
          }
        }
        
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
        
        // Check if timer is active
        if (timerState.active) {
          alert("⚠️ Timer cancelado - Cambiando a modo Eyectores");
          LogModule.append("⚠️ Timer cancelado");
          stopTimer();
        }
        
        // Check if a program is active
        if (window.ProgramasModule) {
          const activeProgramName = ProgramasModule.getActiveProgramName();
          if (activeProgramName) {
            alert("⚠️ Conflicto con programa activo - Se retomará la tarea al día siguiente");
            LogModule.append(`⚠️ Control manual - Programa "${activeProgramName}" en espera`);
          }
        }
        
        LogModule.append(`Cambiando válvulas a modo 2 (Eyectores)...`);
        MQTTModule.publish(
          "2",
          window.APP_CONFIG.TOPIC_VALVE_CMD,
          (msg) => LogModule.append(msg)
        );
      });
    }

    // Timer button
    if (elements.btnTimer) {
      elements.btnTimer.addEventListener("click", () => {
        showTimerScreen();
      });
    }

    // Programas button
    if (elements.btnProgramas) {
      elements.btnProgramas.addEventListener("click", () => {
        if (window.ProgramasModule) {
          ProgramasModule.showScreen();
        }
      });
    }

    // Timer screen navigation
    if (elements.btnBack) {
      elements.btnBack.addEventListener("click", () => {
        // Check which screen is active
        const timerActive = elements.timerScreen.classList.contains('translate-x-0');
        const programasActive = document.getElementById('programas-screen')?.classList.contains('translate-x-0');
        const createProgramActive = document.getElementById('create-program-screen')?.classList.contains('translate-x-0');
        
        if (createProgramActive && window.ProgramasModule) {
          // Hide create program screen, show programas list
          document.getElementById('create-program-screen').classList.remove('translate-x-0');
          document.getElementById('create-program-screen').classList.add('translate-x-full');
        } else if (programasActive && window.ProgramasModule) {
          ProgramasModule.hideScreen();
        } else if (timerActive) {
          hideTimerScreen();
        }
      });
    }

    if (elements.btnTimerCancel) {
      elements.btnTimerCancel.addEventListener("click", () => {
        hideTimerScreen();
      });
    }

    // Timer mode selection
    if (elements.timerMode1) {
      elements.timerMode1.addEventListener("click", () => {
        selectTimerMode(1);
      });
    }

    if (elements.timerMode2) {
      elements.timerMode2.addEventListener("click", () => {
        selectTimerMode(2);
      });
    }

    // Timer start button
    if (elements.btnTimerStart) {
      elements.btnTimerStart.addEventListener("click", () => {
        startTimer();
      });
    }

    // Timer stop button
    if (elements.btnTimerStop) {
      elements.btnTimerStop.addEventListener("click", () => {
        stopTimer();
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
        wifiState: window.APP_CONFIG.TOPIC_WIFI_STATE,
        timerState: window.APP_CONFIG.TOPIC_TIMER_STATE
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

  /**
   * Show timer screen with slide animation
   */
  function showTimerScreen() {
    if (!MQTTModule.isConnected()) {
      LogModule.append("Conectá MQTT primero");
      return;
    }

    // Reset timer form
    selectTimerMode(timerState.mode);
    if (elements.timerHours) elements.timerHours.value = 1;
    if (elements.timerMinutes) elements.timerMinutes.value = 0;

    // Animate screen transition
    elements.mainScreen.classList.add('slide-left');
    elements.timerScreen.classList.add('slide-in');
    elements.btnBack.classList.remove('opacity-0', 'pointer-events-none');
    elements.headerTitle.textContent = 'Timer';
  }

  /**
   * Hide timer screen and return to main
   */
  function hideTimerScreen() {
    elements.mainScreen.classList.remove('slide-left');
    elements.timerScreen.classList.remove('slide-in');
    elements.btnBack.classList.add('opacity-0', 'pointer-events-none');
    elements.headerTitle.textContent = 'Smart Pool';
  }

  /**
   * Select timer mode (1 = Cascada, 2 = Eyectores)
   */
  function selectTimerMode(mode) {
    timerState.mode = mode;
    
    // Update UI
    if (mode === 1) {
      elements.timerMode1.classList.add('selected');
      elements.timerMode2.classList.remove('selected');
    } else {
      elements.timerMode1.classList.remove('selected');
      elements.timerMode2.classList.add('selected');
    }
  }

  /**
   * Start timer with selected settings
   */
  function startTimer() {
    const hours = parseInt(elements.timerHours.value) || 0;
    const minutes = parseInt(elements.timerMinutes.value) || 0;
    const totalSeconds = (hours * 3600) + (minutes * 60);

    if (totalSeconds === 0) {
      LogModule.append("⚠️ Configurá una duración válida");
      return;
    }

    // Set timer state
    timerState.active = true;
    timerState.duration = totalSeconds;
    timerState.remaining = totalSeconds;

    // Turn on pump
    LogModule.append(`🕐 Timer iniciado: ${hours}h ${minutes}m (Modo ${timerState.mode})`);
    
    // Set valve mode first
    MQTTModule.publish(
      timerState.mode.toString(),
      window.APP_CONFIG.TOPIC_VALVE_CMD,
      (msg) => LogModule.append(msg)
    );

    // Then turn on pump
    setTimeout(() => {
      MQTTModule.publish(
        "ON",
        window.APP_CONFIG.TOPIC_PUMP_CMD,
        (msg) => LogModule.append(msg)
      );
    }, 500);

    // Show active timer display
    elements.activeTimerCard.classList.remove('hidden');
    updateTimerDisplay();
    updateTimerButton();

    // Start countdown
    if (timerState.interval) clearInterval(timerState.interval);
    timerState.interval = setInterval(() => {
      timerState.remaining--;
      updateTimerDisplay();
      updateTimerButton();

      if (timerState.remaining <= 0) {
        stopTimer(true);
      }
    }, 1000);

    // Return to main screen after 0.5s delay
    setTimeout(() => {
      hideTimerScreen();
    }, 500);
  }

  /**
   * Stop active timer
   */
  function stopTimer(autoStop = false) {
    if (!timerState.active) return;

    // Clear interval
    if (timerState.interval) {
      clearInterval(timerState.interval);
      timerState.interval = null;
    }

    // Turn off pump
    if (autoStop) {
      LogModule.append("⏰ Timer finalizado - Apagando bomba");
    } else {
      LogModule.append("🛑 Timer detenido manualmente");
    }

    MQTTModule.publish(
      "OFF",
      window.APP_CONFIG.TOPIC_PUMP_CMD,
      (msg) => LogModule.append(msg)
    );

    // Reset state
    timerState.active = false;
    timerState.remaining = 0;

    // Hide timer display
    elements.activeTimerCard.classList.add('hidden');
    
    // Reset timer button text
    updateTimerButton();
  }

  /**
   * Update timer button text with countdown
   */
  function updateTimerButton() {
    if (!elements.btnTimer) return;
    
    const timerText = elements.btnTimer.querySelector('span:last-child');
    if (!timerText) return;
    
    if (timerState.active && timerState.remaining > 0) {
      const hours = Math.floor(timerState.remaining / 3600);
      const minutes = Math.floor((timerState.remaining % 3600) / 60);
      const seconds = timerState.remaining % 60;
      
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      timerText.textContent = timeStr;
    } else {
      timerText.textContent = 'Timer';
    }
  }

  /**
   * Update Programas button text with active program name
   */
  function updateProgramasButton() {
    if (!window.ProgramasModule || !elements.btnProgramas) return;
    
    const activeProgramName = ProgramasModule.getActiveProgramName();
    const programasText = elements.btnProgramas.querySelector('span:last-child');
    
    if (activeProgramName) {
      // Truncate name if too long (max 12 characters)
      const displayName = activeProgramName.length > 12 
        ? activeProgramName.substring(0, 12) + '...' 
        : activeProgramName;
      programasText.textContent = displayName;
      
      // Highlight button to indicate active program
      if (!elements.btnProgramas.classList.contains('ring-2')) {
        elements.btnProgramas.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      }
    } else {
      programasText.textContent = 'Programas';
      elements.btnProgramas.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
    }
  }

  /**
   * Update timer countdown display
   */
  function updateTimerDisplay() {
    const hours = Math.floor(timerState.remaining / 3600);
    const minutes = Math.floor((timerState.remaining % 3600) / 60);
    const seconds = timerState.remaining % 60;

    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    elements.timerCountdown.textContent = timeStr;

    const modeName = timerState.mode === 1 ? 'Cascada' : 'Eyectores';
    elements.timerModeDisplay.textContent = `Modo: ${modeName}`;
  }

  /**
   * Handle timer state updates from MQTT
   */
  function handleTimerStateUpdate(stateUpdate) {
    if (stateUpdate.active) {
      // Sync local timer with remote state
      timerState.active = true;
      timerState.mode = stateUpdate.mode;
      timerState.remaining = stateUpdate.remaining;
      timerState.duration = stateUpdate.duration || timerState.remaining;

      // Show active timer card
      elements.activeTimerCard.classList.remove('hidden');
      updateTimerDisplay();

      // Start local countdown if not already running
      if (!timerState.interval) {
        timerState.interval = setInterval(() => {
          if (timerState.remaining > 0) {
            timerState.remaining--;
            updateTimerDisplay();
          }
        }, 1000);
      }
    } else {
      // Timer stopped remotely
      if (timerState.interval) {
        clearInterval(timerState.interval);
        timerState.interval = null;
      }
      timerState.active = false;
      timerState.remaining = 0;
      elements.activeTimerCard.classList.add('hidden');
    }
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
