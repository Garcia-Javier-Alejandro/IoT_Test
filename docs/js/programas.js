/**
 * Programas (Schedules) Module
 * Manages up to 3 programs with day/mode/time configurations
 */

const ProgramasModule = (() => {
  // Program storage (max 3 programs)
  let programs = [null, null, null]; // Array of program objects
  
  // Current editing state
  let currentSlot = null; // Which slot is being edited (0, 1, or 2)
  let scheduleData = {}; // Temporary schedule data during creation
  
  // DOM elements
  let elements = {};

  /**
   * Initialize the Programas module
   */
  function init() {
    cacheElements();
    setupEventListeners();
    loadPrograms();
  }

  /**
   * Cache DOM elements
   */
  function cacheElements() {
    // Screens
    elements.programasScreen = document.getElementById('programas-screen');
    elements.createProgramScreen = document.getElementById('create-program-screen');
    
    // Header elements (from main app)
    elements.btnBack = document.getElementById('btn-back');
    elements.headerTitle = document.getElementById('header-title');
    elements.mainScreen = document.getElementById('main-screen');
    
    // Program slots
    for (let i = 1; i <= 3; i++) {
      elements[`btnCreateProgram${i}`] = document.getElementById(`btn-create-program-${i}`);
      elements[`programCard${i}`] = document.getElementById(`program-card-${i}`);
      elements[`programName${i}`] = document.getElementById(`program-name-${i}`);
      elements[`programSummary${i}`] = document.getElementById(`program-summary-${i}`);
      elements[`btnToggleProgram${i}`] = document.getElementById(`btn-toggle-program-${i}`);
      elements[`btnDeleteProgram${i}`] = document.getElementById(`btn-delete-program-${i}`);
    }
    
    // Create program screen elements
    elements.scheduleTableBody = document.getElementById('schedule-table-body');
    elements.btnCreateCancel = document.getElementById('btn-create-cancel');
    elements.btnCreateSave = document.getElementById('btn-create-save');
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Create program buttons
    for (let i = 1; i <= 3; i++) {
      if (elements[`btnCreateProgram${i}`]) {
        elements[`btnCreateProgram${i}`].addEventListener('click', () => {
          openCreateProgram(i - 1); // 0-indexed
        });
      }
      
      if (elements[`btnToggleProgram${i}`]) {
        elements[`btnToggleProgram${i}`].addEventListener('click', () => {
          toggleProgram(i - 1);
        });
      }
      
      if (elements[`btnDeleteProgram${i}`]) {
        elements[`btnDeleteProgram${i}`].addEventListener('click', () => {
          deleteProgram(i - 1);
        });
      }
    }
    
    // Create program screen
    if (elements.btnCreateCancel) {
      elements.btnCreateCancel.addEventListener('click', hideCreateScreen);
    }
    if (elements.btnCreateSave) {
      elements.btnCreateSave.addEventListener('click', saveProgram);
    }
    
    // Schedule table interactions
    setupScheduleTable();
  }

  /**
   * Setup schedule table interactions
   */
  function setupScheduleTable() {
    const rows = elements.scheduleTableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
      const day = row.getAttribute('data-day');
      const dayToggle = row.querySelector('.day-toggle');
      const modeBtns = row.querySelectorAll('.mode-btn');
      const startTime = row.querySelector('.start-time');
      const stopTime = row.querySelector('.stop-time');
      
      // Day toggle
      dayToggle.addEventListener('click', () => {
        const isActive = dayToggle.classList.contains('active');
        
        if (isActive) {
          // Deactivate
          dayToggle.classList.remove('active', 'bg-primary', 'text-white', 'border-primary');
          dayToggle.classList.add('text-slate-400');
          modeBtns.forEach(btn => btn.disabled = true);
          startTime.disabled = true;
          stopTime.disabled = true;
          
          // Remove from schedule data
          delete scheduleData[day];
        } else {
          // Activate
          dayToggle.classList.add('active', 'bg-primary', 'text-white', 'border-primary');
          dayToggle.classList.remove('text-slate-400');
          modeBtns.forEach(btn => btn.disabled = false);
          startTime.disabled = false;
          stopTime.disabled = false;
          
          // Initialize schedule data for this day
          scheduleData[day] = {
            mode: null,
            start: '',
            stop: ''
          };
        }
        
        validateForm();
      });
      
      // Mode buttons
      modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          
          // Remove active state from all mode buttons in this row
          modeBtns.forEach(b => {
            b.classList.remove('bg-primary', 'text-white', 'border-primary');
          });
          
          // Activate selected button
          btn.classList.add('bg-primary', 'text-white', 'border-primary');
          
          // Update schedule data
          if (scheduleData[day]) {
            scheduleData[day].mode = parseInt(mode);
          }
          
          validateForm();
        });
      });
      
      // Time inputs
      startTime.addEventListener('change', () => {
        if (scheduleData[day]) {
          scheduleData[day].start = startTime.value;
        }
        validateForm();
      });
      
      stopTime.addEventListener('change', () => {
        if (scheduleData[day]) {
          scheduleData[day].stop = stopTime.value;
        }
        validateForm();
      });
    });
  }

  /**
   * Validate the create program form
   */
  function validateForm() {
    const hasAtLeastOneDay = Object.keys(scheduleData).length > 0;
    let allDaysComplete = true;
    
    for (const day in scheduleData) {
      const data = scheduleData[day];
      if (!data.mode || !data.start || !data.stop) {
        allDaysComplete = false;
        break;
      }
    }
    
    elements.btnCreateSave.disabled = !(hasAtLeastOneDay && allDaysComplete);
  }

  /**
   * Open create program screen
   */
  function openCreateProgram(slot) {
    currentSlot = slot;
    scheduleData = {};
    
    // Reset form
    resetCreateForm();
    
    // Show create screen
    elements.createProgramScreen.classList.remove('translate-x-full');
    elements.createProgramScreen.classList.add('translate-x-0');
    
    // Update header title
    if (elements.headerTitle) {
      elements.headerTitle.textContent = 'Crear Programa';
    }
  }

  /**
   * Reset the create program form
   */
  function resetCreateForm() {
    const rows = elements.scheduleTableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
      const dayToggle = row.querySelector('.day-toggle');
      const modeBtns = row.querySelectorAll('.mode-btn');
      const startTime = row.querySelector('.start-time');
      const stopTime = row.querySelector('.stop-time');
      
      // Deactivate day
      dayToggle.classList.remove('active', 'bg-primary', 'text-white', 'border-primary');
      dayToggle.classList.add('text-slate-400');
      
      // Deactivate mode buttons
      modeBtns.forEach(btn => {
        btn.classList.remove('bg-primary', 'text-white', 'border-primary');
        btn.disabled = true;
      });
      
      // Reset time inputs
      startTime.value = '';
      startTime.disabled = true;
      stopTime.value = '';
      stopTime.disabled = true;
    });
    
    elements.btnCreateSave.disabled = true;
  }

  /**
   * Hide create program screen
   */
  function hideCreateScreen() {
    elements.createProgramScreen.classList.remove('translate-x-0');
    elements.createProgramScreen.classList.add('translate-x-full');
    currentSlot = null;
    
    // Restore header title to Programas
    if (elements.headerTitle) {
      elements.headerTitle.textContent = 'Programas';
    }
  }

  /**
   * Save program
   */
  function saveProgram() {
    // Prompt for program name
    const name = prompt('Nombre del programa:');
    
    if (!name || name.trim() === '') {
      alert('Debes ingresar un nombre para el programa');
      return;
    }
    
    // Create program object
    const program = {
      name: name.trim(),
      enabled: true,
      schedule: { ...scheduleData }
    };
    
    // Save to slot
    programs[currentSlot] = program;
    
    // Update UI
    updateProgramSlot(currentSlot);
    
    // Save to localStorage
    savePrograms();
    
    // Hide create screen
    hideCreateScreen();
    
    // Log
    if (window.LogModule) {
      LogModule.append(`✅ Programa "${program.name}" creado`);
    }
  }

  /**
   * Update program slot display
   */
  function updateProgramSlot(slot) {
    const program = programs[slot];
    const index = slot + 1;
    
    if (program) {
      // Hide create button, show program card
      elements[`btnCreateProgram${index}`].classList.add('hidden');
      elements[`programCard${index}`].classList.remove('hidden');
      
      // Update name
      elements[`programName${index}`].textContent = program.name;
      
      // Update toggle button
      const toggleBtn = elements[`btnToggleProgram${index}`];
      const toggleIcon = toggleBtn.querySelector('.material-icons-round');
      
      if (program.enabled) {
        toggleBtn.classList.remove('bg-slate-400', 'hover:bg-slate-500');
        toggleBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        toggleIcon.textContent = 'toggle_on';
      } else {
        toggleBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
        toggleBtn.classList.add('bg-slate-400', 'hover:bg-slate-500');
        toggleIcon.textContent = 'toggle_off';
      }
      
      // Update summary
      const days = Object.keys(program.schedule).map(d => {
        const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
        return dayNames[parseInt(d)];
      }).join(', ');
      
      const modes = [...new Set(Object.values(program.schedule).map(s => s.mode))];
      const modeStr = modes.map(m => m === 1 ? 'Cascada' : 'Eyectores').join(', ');
      
      const times = Object.values(program.schedule).map(s => `${s.start}-${s.stop}`);
      const timeStr = [...new Set(times)].join(', ');
      
      elements[`programSummary${index}`].innerHTML = `
        <div>Días: <span class="font-medium">${days}</span></div>
        <div>Modo: <span class="font-medium">${modeStr}</span></div>
        <div>Horario: <span class="font-medium">${timeStr}</span></div>
      `;
    } else {
      // Show create button, hide program card
      elements[`btnCreateProgram${index}`].classList.remove('hidden');
      elements[`programCard${index}`].classList.add('hidden');
    }
  }

  /**
   * Toggle program enabled/disabled
   */
  function toggleProgram(slot) {
    const program = programs[slot];
    if (!program) return;
    
    program.enabled = !program.enabled;
    updateProgramSlot(slot);
    savePrograms();
    
    if (window.LogModule) {
      const status = program.enabled ? 'activado' : 'desactivado';
      LogModule.append(`🔄 Programa "${program.name}" ${status}`);
    }
  }

  /**
   * Delete program
   */
  function deleteProgram(slot) {
    const program = programs[slot];
    if (!program) return;
    
    if (confirm(`¿Eliminar programa "${program.name}"?`)) {
      programs[slot] = null;
      updateProgramSlot(slot);
      savePrograms();
      
      if (window.LogModule) {
        LogModule.append(`🗑️ Programa "${program.name}" eliminado`);
      }
    }
  }

  /**
   * Save programs to localStorage
   */
  function savePrograms() {
    localStorage.setItem('poolPrograms', JSON.stringify(programs));
  }

  /**
   * Load programs from localStorage
   */
  function loadPrograms() {
    const saved = localStorage.getItem('poolPrograms');
    if (saved) {
      try {
        programs = JSON.parse(saved);
        // Update all slots
        programs.forEach((_, slot) => updateProgramSlot(slot));
      } catch (e) {
        console.error('Error loading programs:', e);
      }
    }
  }

  /**
   * Show programas screen
   */
  function showScreen() {
    // Animate screen transition
    if (elements.mainScreen) {
      elements.mainScreen.classList.add('slide-left');
    }
    elements.programasScreen.classList.remove('translate-x-full');
    elements.programasScreen.classList.add('translate-x-0');
    
    // Update header
    if (elements.btnBack) {
      elements.btnBack.classList.remove('opacity-0', 'pointer-events-none');
    }
    if (elements.headerTitle) {
      elements.headerTitle.textContent = 'Programas';
    }
  }

  /**
   * Hide programas screen
   */
  function hideScreen() {
    // Animate screen transition
    if (elements.mainScreen) {
      elements.mainScreen.classList.remove('slide-left');
    }
    elements.programasScreen.classList.remove('translate-x-0');
    elements.programasScreen.classList.add('translate-x-full');
    
    // Reset header
    if (elements.btnBack) {
      elements.btnBack.classList.add('opacity-0', 'pointer-events-none');
    }
    if (elements.headerTitle) {
      elements.headerTitle.textContent = 'Smart Pool';
    }
  }

  /**
   * Get active program name for display
   */
  function getActiveProgramName() {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Check programs in order (first one takes precedence)
    for (const program of programs) {
      if (!program || !program.enabled) continue;
      
      const daySchedule = program.schedule[currentDay];
      if (!daySchedule) continue;
      
      // Check if current time is within this schedule
      if (currentTime >= daySchedule.start && currentTime < daySchedule.stop) {
        return program.name;
      }
    }
    
    return null;
  }

  /**
   * Get all programs
   */
  function getPrograms() {
    return programs;
  }

  // Public API
  return {
    init,
    showScreen,
    hideScreen,
    getActiveProgramName,
    getPrograms
  };
})();
