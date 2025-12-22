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
    
    logBuffer.unshift({ msg, time, level });

    // Maintain max buffer size
    if (logBuffer.length > MAX_LINES) {
      logBuffer = logBuffer.slice(0, MAX_LINES);
    }

    // Update UI if log box exists
    if (logBox) {
      renderLog();
    }
  }

  /**
   * Render the log entries in the UI
   */
  function renderLog() {
    if (!logBox) return;

    logBox.innerHTML = logBuffer.map(entry => {
      const colorClass = entry.level === "error" ? "text-red-600" : 
                        entry.level === "warn" ? "text-amber-600" : 
                        "text-slate-600";
      
      return `<div class="${colorClass} hover:bg-slate-50 px-2 py-1 rounded transition-colors">
        <span class="text-slate-400">[${entry.time}]</span> ${entry.msg}
      </div>`;
    }).join("");
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
      logBox.innerHTML = "";
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
