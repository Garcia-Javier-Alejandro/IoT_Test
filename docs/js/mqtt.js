/**
 * MQTT Module
 * Handles MQTT connection, subscription, publishing, and event management.
 * Requires mqtt.js library (global mqtt object)
 */

const MQTTModule = (() => {
  let client = null;
  let lastState = "UNKNOWN"; // "ON" | "OFF" | "UNKNOWN"
  let onStateChange = null; // Callback when state changes
  let onConnected = null; // Callback when connected
  let onDisconnected = null; // Callback when disconnected

  /**
   * Register callbacks for MQTT events
   * @param {Function} stateChangeCb - Callback(state) when LED state changes
   * @param {Function} connectedCb - Callback() when connected
   * @param {Function} disconnectedCb - Callback() when disconnected
   */
  function onEvents(stateChangeCb, connectedCb, disconnectedCb) {
    onStateChange = stateChangeCb;
    onConnected = connectedCb;
    onDisconnected = disconnectedCb;
  }

  /**
   * Connect to MQTT broker
   * @param {string} brokerUrl - WSS URL of MQTT broker
   * @param {string} username - MQTT username
   * @param {string} password - MQTT password
   * @param {Object} topics - { cmd: string, state: string }
   * @param {string} deviceId - Device ID for logging
   * @param {Object} config - { HIVEMQ_HOST }
   * @param {Function} logFn - Function to call for logging
   */
  function connect(brokerUrl, username, password, topics, deviceId, config, logFn) {
    if (client) {
      try {
        client.end(true);
      } catch (_) {}
      client = null;
    }

    const clientId = "dashboard-" + Math.random().toString(16).slice(2, 10);

    logFn(`Broker: ${config.HIVEMQ_HOST || "(host)"}${deviceId ? " | " + deviceId : ""}`);
    logFn(`WSS: ${brokerUrl}`);
    logFn(`Topics: set=${topics.cmd} | state=${topics.state}`);
    logFn("Conectando…");

    client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      clean: true,
      reconnectPeriod: 2000,
      connectTimeout: 8000,
    });

    // Connect event
    client.on("connect", () => {
      logFn("Conectado al broker como " + clientId);

      client.subscribe(topics.state, { qos: 0 }, (err) => {
        if (!err) {
          logFn("Suscripto a " + topics.state);
        } else {
          logFn("Error al suscribirse: " + err.message);
        }
      });

      if (onConnected) onConnected();
    });

    // Reconnect event
    client.on("reconnect", () => {
      logFn("Intentando reconectar...");
    });

    // Close event
    client.on("close", () => {
      logFn("Conexión cerrada");
      if (onDisconnected) onDisconnected();
    });

    // Offline event
    client.on("offline", () => {
      logFn("Cliente offline");
      if (onDisconnected) onDisconnected();
    });

    // Error event
    client.on("error", (err) => {
      logFn("Error MQTT: " + err.message);
    });

    // Message received
    client.on("message", (topic, payload) => {
      const msg = payload.toString().trim().toUpperCase();
      if (topic === topics.state) {
        logFn("Estado recibido: " + msg);
        if (msg === "ON" || msg === "OFF") {
          lastState = msg;
          if (onStateChange) onStateChange(msg);
        }
      }
    });
  }

  /**
   * Disconnect from MQTT broker
   */
  function disconnect() {
    if (client) {
      try {
        client.end(true);
      } catch (_) {}
      client = null;
    }
  }

  /**
   * Publish a command to MQTT
   * @param {string} command - "ON" or "OFF"
   * @param {string} topic - Topic to publish to
   * @param {Function} logFn - Function to call for logging
   */
  function publish(command, topic, logFn) {
    if (!client || !client.connected) {
      logFn("No conectado al broker, no se envía comando");
      return;
    }

    client.publish(topic, command, { qos: 0 }, (err) => {
      if (err) {
        logFn("Error al publicar comando: " + err.message);
      } else {
        logFn("Comando enviado: " + command);
      }
    });
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  function isConnected() {
    return !!(client && client.connected);
  }

  /**
   * Get last known LED state
   * @returns {string} "ON" | "OFF" | "UNKNOWN"
   */
  function getLastState() {
    return lastState;
  }

  return {
    onEvents,
    connect,
    disconnect,
    publish,
    isConnected,
    getLastState,
  };
})();
