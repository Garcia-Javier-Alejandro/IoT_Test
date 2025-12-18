/**
 * Logging Module
 * Manages a bounded log buffer and UI interactions.
 * Provides centralized logging for the dashboard.
 */

const LogModule = (() => {
  const MAX_LINES = 500;
  let logBuffer = []; // Array of log entries
  let logBox = null;
  let isVisible = true;

  /**
   * Initialize the logging module with DOM elements
   * @param {HTMLElement} logBoxEl - The log display container
   * @param {HTMLElement} toggleBtn - Button to toggle log visibility
   * @param {HTMLElement} clearBtn - Button to clear the log
   */
  function init(logBoxEl, toggleBtn, clearBtn) {
    logBox = logBoxEl;

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => toggleVisibility());
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => clear());
    }
  }

  /**
   * Add a message to the log with timestamp
   * @param {string} msg - Message to log
   * @param {string} level - Log level (info, warn, error) - optional
   */
  function append(msg, level = "info") {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;

    logBuffer.unshift(entry);

    // Maintain max buffer size
    if (logBuffer.length > MAX_LINES) {
      logBuffer = logBuffer.slice(0, MAX_LINES);
    }

    // Update UI if log box exists and is visible
    if (logBox) {
      logBox.textContent = logBuffer.join("\n");
    }
  }

  /**
   * Toggle log panel visibility
   */
  function toggleVisibility() {
    const logPanel = document.getElementById("log-panel");
    if (!logPanel) return;

    isVisible = !isVisible;
    if (isVisible) {
      logPanel.classList.remove("hidden");
    } else {
      logPanel.classList.add("hidden");
    }
  }

  /**
   * Clear the log buffer and UI
   */
  function clear() {
    logBuffer = [];
    if (logBox) {
      logBox.textContent = "";
    }
    append("Log limpiado");
  }

  /**
   * Get current log entries
   * @returns {Array} Array of log entries
   */
  function getBuffer() {
    return [...logBuffer];
  }

  return {
    init,
    append,
    toggleVisibility,
    clear,
    getBuffer,
  };
})();
