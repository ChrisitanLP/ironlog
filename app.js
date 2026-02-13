/**
 * IRONLOG — app.js
 * Strava para Gymrats — Prototype v1.0
 * Phases 1-3: Tracking + Profile + Social Feed
 *
 * Architecture:
 *  - DataStore: localStorage persistence layer
 *  - Models: User, Workout, Exercise, Set, Post
 *  - Engines: PR Detection, Volume Calc, Level Calc
 *  - Renderers: Feed, Profile, Stats, Session
 *  - Controllers: Navigation, Modal, Timer, Toast
 */

/* ============================================================
   DATA MODELS
   ============================================================ */

/** Default user state */
const DEFAULT_USER = {
  id: 'user_1',
  username: 'IRONUSER',
  initials: 'IU',
  avatarColor: 'linear-gradient(135deg, #ff3c3c, #ff6b1a)',
  bio: 'No days off. 🔥',
  joinedAt: new Date().toISOString(),
};

/** Tipos de serie */
const SET_TYPES = {
  WARMUP: 'warmup',
  APPROACH: 'approach',
  EFFECTIVE: 'effective'
};

/** Tipos de equipo */
const EQUIPMENT_TYPES = {
  MACHINE: 'machine',
  BARBELL: 'barbell',
  DUMBBELL: 'dumbbell'
};

/** Tipos de barra */
const BARBELL_TYPES = [
  { name: 'Barra Olímpica', weight: 20 },
  { name: 'Barra EZ', weight: 10 },
  { name: 'Barra Hexagonal', weight: 25 },
  { name: 'Barra Fija', weight: 15 },
  { name: 'Personalizada', weight: 0 }
];

/** Exercise database — muscle groups + common lifts */
const EXERCISE_DB = [
  { name: 'Press Banca', muscle: 'Pecho' },
  { name: 'Press Inclinado', muscle: 'Pecho' },
  { name: 'Fondos (Dips)', muscle: 'Pecho' },
  { name: 'Press Hombro', muscle: 'Hombros' },
  { name: 'Elevaciones Laterales', muscle: 'Hombros' },
  { name: 'Press Militar', muscle: 'Hombros' },
  { name: 'Sentadilla', muscle: 'Piernas' },
  { name: 'Peso Muerto', muscle: 'Espalda' },
  { name: 'Peso Muerto Rumano', muscle: 'Piernas' },
  { name: 'Prensa', muscle: 'Piernas' },
  { name: 'Curl Femoral', muscle: 'Piernas' },
  { name: 'Dominadas', muscle: 'Espalda' },
  { name: 'Remo Barra', muscle: 'Espalda' },
  { name: 'Remo Mancuerna', muscle: 'Espalda' },
  { name: 'Jalón al Pecho', muscle: 'Espalda' },
  { name: 'Curl Bíceps', muscle: 'Bíceps' },
  { name: 'Curl Martillo', muscle: 'Bíceps' },
  { name: 'Extensión Tríceps', muscle: 'Tríceps' },
  { name: 'Press Francés', muscle: 'Tríceps' },
  { name: 'Fondos Tríceps', muscle: 'Tríceps' },
  { name: 'Hip Thrust', muscle: 'Glúteos' },
  { name: 'Plancha', muscle: 'Core' },
  { name: 'Crunch', muscle: 'Core' },
  { name: 'Face Pull', muscle: 'Hombros' },
  { name: 'Pull-over', muscle: 'Pecho' },
];

/** Mock users for social feed */
const MOCK_USERS = [
  { id: 'u2', username: 'ALEX_IRON', initials: 'AI', avatarColor: 'linear-gradient(135deg, #2979ff, #00b0ff)' },
  { id: 'u3', username: 'SARA_LIFTS', initials: 'SL', avatarColor: 'linear-gradient(135deg, #e040fb, #aa00ff)' },
  { id: 'u4', username: 'BEAST_MODE', initials: 'BM', avatarColor: 'linear-gradient(135deg, #00e676, #1de9b6)' },
  { id: 'u5', username: 'CARLOS_FIT', initials: 'CF', avatarColor: 'linear-gradient(135deg, #ff6d00, #ffab00)' },
];

const WORKOUT_TYPES = ['Push Day', 'Pull Day', 'Leg Day', 'Upper Body', 'Full Body', 'Back & Bi', 'Chest & Tri', 'Shoulders & Arms'];

/* ============================================================
   DATA STORE — localStorage wrapper
   ============================================================ */
const DataStore = {
  _prefix: 'ironlog_',

  get(key) {
    try {
      const raw = localStorage.getItem(this._prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  set(key, value) {
    try {
      localStorage.setItem(this._prefix + key, JSON.stringify(value));
      return true;
    } catch { return false; }
  },

  getUser()       { return this.get('user')     || DEFAULT_USER; },
  getWorkouts()   { return this.get('workouts') || []; },
  getPosts()      { return this.get('posts')    || []; },
  getPRs()        { return this.get('prs')      || {}; },

  saveUser(u)     { return this.set('user', u); },
  saveWorkouts(w) { return this.set('workouts', w); },
  savePosts(p)    { return this.set('posts', p); },
  savePRs(prs)    { return this.set('prs', prs); },

  addWorkout(w) {
    const workouts = this.getWorkouts();
    workouts.unshift(w);
    this.saveWorkouts(workouts);
  },

  addPost(p) {
    const posts = this.getPosts();
    posts.unshift(p);
    this.savePosts(posts);
  },

  updatePost(id, updates) {
    const posts = this.getPosts();
    const idx = posts.findIndex(p => p.id === id);
    if (idx !== -1) {
      posts[idx] = { ...posts[idx], ...updates };
      this.savePosts(posts);
    }
  }
};

const DataStoreExtensions = {
  getTemplates()  { return this.get('templates') || []; },
  saveTemplates(t) { return this.set('templates', t); },
  
  addTemplate(template) {
    const templates = this.getTemplates();
    templates.unshift(template);
    this.saveTemplates(templates);
  },
  
  deleteTemplate(id) {
    const templates = this.getTemplates();
    const filtered = templates.filter(t => t.id !== id);
    this.saveTemplates(filtered);
  },
  
  getTemplate(id) {
    const templates = this.getTemplates();
    return templates.find(t => t.id === id);
  }
};

// Fusionar con DataStore existente:
Object.assign(DataStore, DataStoreExtensions);

/* ============================================================
   ENGINES
   ============================================================ */

/** Calculate total volume (kg × reps × sets) */
function calcVolumeV2(sets) {
  return sets.reduce((acc, s) => {
    const w = parseFloat(s.realWeight || s.weight) || 0;
    const r = parseInt(s.reps) || 0;
    // Solo contar series efectivas para algunos cálculos
    const isEffective = !s.setType || s.setType === SET_TYPES.EFFECTIVE;
    return acc + (w * r);
  }, 0);
}

function calcEffectiveVolume(sets) {
  return sets.reduce((acc, s) => {
    if (s.setType && s.setType !== SET_TYPES.EFFECTIVE) return acc;
    const w = parseFloat(s.realWeight || s.weight) || 0;
    const r = parseInt(s.reps) || 0;
    return acc + (w * r);
  }, 0);
}

/** Detect PR: returns true if this weight is a new record for the exercise */
function detectPRV2(exerciseName, weight, prs, setType = SET_TYPES.EFFECTIVE) {
  if (setType !== SET_TYPES.EFFECTIVE) return false;
  const key = exerciseName.toLowerCase().trim();
  const prev = prs[key] || 0;
  return parseFloat(weight) > prev;
}

function updatePRsV2(exercises) {
  const prs = DataStore.getPRs();
  const newPRs = [];

  exercises.forEach(ex => {
    const key = ex.name.toLowerCase().trim();
    const effectiveSets = ex.sets.filter(s => !s.setType || s.setType === SET_TYPES.EFFECTIVE);
    const maxWeight = Math.max(...effectiveSets.map(s => parseFloat(s.realWeight || s.weight) || 0));
    
    if (maxWeight > 0 && maxWeight > (prs[key] || 0)) {
      prs[key] = maxWeight;
      newPRs.push({ exercise: ex.name, weight: maxWeight });
    }
  });

  DataStore.savePRs(prs);
  return newPRs;
}

/** Calculate user level based on workouts */
function calcLevel(workoutCount) {
  if (workoutCount >= 100) return { level: 'ELITE', tier: 5 };
  if (workoutCount >= 50)  return { level: 'ADVANCED', tier: 4 };
  if (workoutCount >= 20)  return { level: 'INTERMEDIATE', tier: 3 };
  if (workoutCount >= 8)   return { level: 'NOVICE', tier: 2 };
  return { level: 'BEGINNER', tier: 1 };
}

/** Calculate weekly streak */
function calcStreak(workouts) {
  const days = ['L','M','X','J','V','S','D'];
  const today = new Date();
  const result = days.map((d, i) => {
    const day = new Date(today);
    const diff = (today.getDay() + 6) % 7; // monday = 0
    day.setDate(today.getDate() - diff + i);
    const dayStr = day.toISOString().split('T')[0];
    const trained = workouts.some(w => w.date && w.date.startsWith(dayStr));
    return { label: d, done: trained };
  });
  return result;
}

/** Format volume nicely */
function fmtVolume(v) {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k kg';
  return Math.round(v) + ' kg';
}

/** Format duration from seconds */
function fmtDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${s.toString().padStart(2,'0')}s`;
}

/** Format relative time */
function fmtRelTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Ahora mismo';
  if (m < 60) return `Hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Hace ${d}d`;
  return new Date(isoStr).toLocaleDateString('es-ES', { day:'numeric', month:'short' });
}

/** Unique ID generator */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2,5);
}

// Handler: Modo de uso (ahora / planificar)
function handleWorkoutModeSelection() {
  Modal.open('modal-workout-mode');
}

function selectWorkoutMode(mode) {
  Session.reset();
  Session.mode = mode;
  Modal.close('modal-workout-mode');
  
  if (mode === 'plan') {
    // Modo planificación - Solo estructura, sin timers
    document.getElementById('config-name').value = '';
    renderConfigViewV2();
    showTrainView('train-config');
    showToast('Modo planificación: crea tu rutina sin cronómetros activos 📋');
    setTimeout(() => document.getElementById('config-name').focus(), 100);
  } else {
    // Modo "usar ahora" - Entrenamiento en tiempo real
    document.getElementById('config-name').value = '';
    document.getElementById('session-timer').textContent = '00:00';
    renderConfigViewV2();
    showTrainView('train-config');
    setTimeout(() => document.getElementById('config-name').focus(), 100);
  }
}

// Handler: Configurar modo compañero
function handleCompanionToggle() {
  const checkbox = document.getElementById('companion-mode-check');
  const nameInput = document.getElementById('companion-name-input');
  
  if (checkbox && checkbox.checked) {
    if (nameInput) nameInput.classList.remove('hidden');
  } else {
    if (nameInput) nameInput.classList.add('hidden');
  }
}

function applyCompanionSettings() {
  const checkbox = document.getElementById('companion-mode-check');
  const nameInput = document.getElementById('companion-name');
  
  Session.companionMode = checkbox ? checkbox.checked : false;
  Session.companionName = nameInput && checkbox.checked ? nameInput.value.trim() : '';
}

// Handler: Cambiar turno de compañero
function toggleCompanionTurn() {
  Session.setCompanionTurn(!Session.isCompanionTurn);
  updateCompanionUI();
}

function updateCompanionUI() {
  const btn = document.getElementById('btn-companion-turn');
  if (!btn) return;
  
  if (Session.isCompanionTurn) {
    btn.textContent = '👤 Es mi turno';
    btn.classList.add('active');
  } else {
    btn.textContent = '⏸ Turno de compañero';
    btn.classList.remove('active');
  }
}

// Handler: Pausar/reanudar serie
function toggleSetPause() {
  if (Session.setIsPaused) {
    Session.resumeSetTimer();
  } else {
    Session.pauseSetTimer();
  }
}

// Handler: Pausar/reanudar descanso
function toggleRestPause() {
  if (Session.restIsPaused) {
    Session.resumeRestTimer();
  } else {
    Session.pauseRestTimer();
  }
}

// Handler: Abrir modal de tipo de equipo

function openEquipmentModal() {
  Modal.open('modal-equipment-type');
  
  // Pre-seleccionar el tipo actual
  setTimeout(() => {
    updateEquipmentUI();
    
    // Si es barra, mostrar config y pre-seleccionar
    if (Session.equipmentType === EQUIPMENT_TYPES.BARBELL) {
      document.getElementById('barbell-config').classList.remove('hidden');
      
      // Pre-seleccionar tipo de barra si ya está configurado
      if (Session.barbellType) {
        const barbellIndex = BARBELL_TYPES.findIndex(b => b.name === Session.barbellType);
        if (barbellIndex !== -1) {
          document.querySelectorAll('.barbell-option').forEach((btn, i) => {
            btn.classList.toggle('active', i === barbellIndex);
          });
          
          // Si es personalizada, habilitar input
          if (barbellIndex === 4) {
            document.getElementById('barbell-custom-weight').disabled = false;
            document.getElementById('barbell-custom-weight').value = Session.barbellWeight || '';
          } else {
            document.getElementById('barbell-custom-weight').value = Session.barbellWeight || '';
          }
        }
      }
    } else {
      document.getElementById('barbell-config').classList.add('hidden');
    }
    
    // Si es máquina, mostrar config
    if (Session.equipmentType === EQUIPMENT_TYPES.MACHINE) {
      document.getElementById('machine-config').classList.remove('hidden');
    } else {
      document.getElementById('machine-config').classList.add('hidden');
    }
  }, 50);
}

// Handler: Seleccionar tipo de equipo
function selectEquipmentType(type) {
  Session.equipmentType = type;
  
  // Ocultar todas las configs primero
  document.getElementById('barbell-config').classList.add('hidden');
  document.getElementById('machine-config').classList.add('hidden');
  
  // Mostrar config específica
  if (type === EQUIPMENT_TYPES.BARBELL) {
    document.getElementById('barbell-config').classList.remove('hidden');
    
    // Si no hay barra configurada, pre-seleccionar Olímpica por defecto
    if (!Session.barbellType) {
      selectBarbellType(0); // Barra Olímpica por defecto
    }
  } else if (type === EQUIPMENT_TYPES.MACHINE) {
    document.getElementById('machine-config').classList.remove('hidden');
  } else if (type === EQUIPMENT_TYPES.DUMBBELL) {
    // Mancuernas no necesita config adicional
    Session.barbellType = null;
    Session.barbellWeight = 0;
  }
  
  updateEquipmentUI();
}

function updateEquipmentUI() {
  document.querySelectorAll('.equipment-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === Session.equipmentType);
  });
}

// Handler: Seleccionar tipo de barra
function selectBarbellType(index) {
  const barbell = BARBELL_TYPES[index];
  Session.barbellType = barbell.name;
  
  const customWeightInput = document.getElementById('barbell-custom-weight');
  
  if (barbell.weight > 0) {
    // Barra con peso predefinido
    Session.barbellWeight = barbell.weight;
    customWeightInput.value = barbell.weight;
    customWeightInput.disabled = true;
  } else {
    // Barra personalizada
    customWeightInput.disabled = false;
    if (!customWeightInput.value) {
      customWeightInput.value = Session.barbellWeight || '';
      customWeightInput.focus();
    }
  }
  
  // Actualizar UI de botones
  document.querySelectorAll('.barbell-option').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
}

// Handler: Peso personalizado de barra
function handleCustomBarbellWeight() {
  const input = document.getElementById('barbell-custom-weight');
  Session.barbellWeight = parseFloat(input.value) || 0;
}

// Handler: Confirmar tipo de equipo
function confirmEquipmentType() {
  // Validar que si es barra, tenga peso configurado
  if (Session.equipmentType === EQUIPMENT_TYPES.BARBELL) {
    if (!Session.barbellWeight || Session.barbellWeight <= 0) {
      showToast('Configura el peso de la barra antes de continuar ✋');
      return;
    }
  }
  
  Modal.close('modal-equipment-type');
  
  // Actualizar UI del ejercicio actual
  updateCurrentEquipmentLabel();
  
  showToast('Equipo configurado correctamente ✓');
}

function updateCurrentEquipmentLabel() {
  const equipmentLabel = document.getElementById('current-equipment-label');
  if (!equipmentLabel) return;
  
  let text = '';
  if (Session.equipmentType === EQUIPMENT_TYPES.BARBELL) {
    text = `🏋️ ${Session.barbellType} (${Session.barbellWeight}kg)`;
  } else if (Session.equipmentType === EQUIPMENT_TYPES.DUMBBELL) {
    text = '🏋️ Mancuernas';
  } else {
    text = '🔧 Máquina';
  }
  
  equipmentLabel.textContent = text;
}

// Handler: Seleccionar tipo de serie
function selectSetType(type) {
  document.querySelectorAll('.set-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
}


/* ============================================================
   MOCK DATA GENERATOR — seed feed on first run
   ============================================================ */
function seedMockData() {
  if (DataStore.get('seeded')) return;

  const now = Date.now();
  const mockPosts = [
    {
      id: uid(), userId: 'u2', username: 'ALEX_IRON', initials: 'AI',
      avatarColor: MOCK_USERS[0].avatarColor,
      sessionName: 'Push Day 🔥', type: 'Push Day',
      totalVolume: 14800, totalSets: 18,
      duration: 3840, exerciseCount: 5,
      prs: [{ exercise: 'Press Banca', weight: 120 }],
      exercises: [
        { name: 'Press Banca', sets: [{weight:'120',reps:'5'},{weight:'115',reps:'6'},{weight:'110',reps:'8'}] },
        { name: 'Press Inclinado', sets: [{weight:'90',reps:'8'},{weight:'85',reps:'10'}] },
        { name: 'Press Hombro', sets: [{weight:'75',reps:'8'},{weight:'70',reps:'10'},{weight:'70',reps:'10'}] },
      ],
      likes: 12, likedBy: [], comments: [
        { username: 'SARA_LIFTS', text: '¡Animal! 120kg en banca 🔥', avatarColor: MOCK_USERS[1].avatarColor, initials: 'SL' },
        { username: 'BEAST_MODE', text: 'PR maduro 💪', avatarColor: MOCK_USERS[2].avatarColor, initials: 'BM' },
      ],
      createdAt: new Date(now - 2 * 3600000).toISOString()
    },
    {
      id: uid(), userId: 'u3', username: 'SARA_LIFTS', initials: 'SL',
      avatarColor: MOCK_USERS[1].avatarColor,
      sessionName: 'Leg Day 🦵', type: 'Leg Day',
      totalVolume: 22400, totalSets: 20,
      duration: 4500, exerciseCount: 5,
      prs: [{ exercise: 'Sentadilla', weight: 100 }, { exercise: 'Hip Thrust', weight: 130 }],
      exercises: [
        { name: 'Sentadilla', sets: [{weight:'100',reps:'5'},{weight:'95',reps:'6'},{weight:'90',reps:'8'}] },
        { name: 'Prensa', sets: [{weight:'200',reps:'10'},{weight:'180',reps:'12'}] },
        { name: 'Hip Thrust', sets: [{weight:'130',reps:'8'},{weight:'120',reps:'10'},{weight:'110',reps:'12'}] },
      ],
      likes: 24, likedBy: [], comments: [
        { username: 'CARLOS_FIT', text: 'Bestia 🐐', avatarColor: MOCK_USERS[3].avatarColor, initials: 'CF' },
        { username: 'ALEX_IRON', text: '100kg sentadilla 👑', avatarColor: MOCK_USERS[0].avatarColor, initials: 'AI' },
      ],
      createdAt: new Date(now - 5 * 3600000).toISOString()
    },
    {
      id: uid(), userId: 'u4', username: 'BEAST_MODE', initials: 'BM',
      avatarColor: MOCK_USERS[2].avatarColor,
      sessionName: 'Back & Bi 💪', type: 'Pull Day',
      totalVolume: 11200, totalSets: 16,
      duration: 3300, exerciseCount: 4,
      prs: [],
      exercises: [
        { name: 'Peso Muerto', sets: [{weight:'160',reps:'4'},{weight:'150',reps:'5'},{weight:'140',reps:'6'}] },
        { name: 'Dominadas', sets: [{weight:'20',reps:'8'},{weight:'15',reps:'10'},{weight:'10',reps:'12'}] },
        { name: 'Remo Barra', sets: [{weight:'80',reps:'10'},{weight:'75',reps:'10'}] },
        { name: 'Curl Bíceps', sets: [{weight:'30',reps:'12'},{weight:'27.5',reps:'12'}] },
      ],
      likes: 8, likedBy: [], comments: [
        { username: 'SARA_LIFTS', text: 'Pull days del 10 🔝', avatarColor: MOCK_USERS[1].avatarColor, initials: 'SL' },
      ],
      createdAt: new Date(now - 22 * 3600000).toISOString()
    },
    {
      id: uid(), userId: 'u5', username: 'CARLOS_FIT', initials: 'CF',
      avatarColor: MOCK_USERS[3].avatarColor,
      sessionName: 'Full Body', type: 'Full Body',
      totalVolume: 8600, totalSets: 14,
      duration: 2700, exerciseCount: 4,
      prs: [{ exercise: 'Press Militar', weight: 85 }],
      exercises: [
        { name: 'Press Militar', sets: [{weight:'85',reps:'5'},{weight:'80',reps:'6'},{weight:'75',reps:'8'}] },
        { name: 'Sentadilla', sets: [{weight:'90',reps:'8'},{weight:'85',reps:'10'}] },
        { name: 'Remo Mancuerna', sets: [{weight:'40',reps:'10'},{weight:'37.5',reps:'12'}] },
      ],
      likes: 6, likedBy: [], comments: [],
      createdAt: new Date(now - 30 * 3600000).toISOString()
    },
  ];

  DataStore.savePosts(mockPosts);
  DataStore.set('seeded', true);
}

/* ============================================================
   SESSION STATE v2 — multi-timer, step-by-step flow
   ============================================================
   States:
     'idle'        — nada activo
     'config'      — configurando rutina
     'preview'     — viendo preview del ejercicio
     'set-running' — serie en ejecución
     'rest'        — descanso entre series
   ============================================================ */

const SessionV3 = {
  // ── Workout-level data ──
  active: false,
  mode: 'now', // 'now' o 'plan'
  workoutName: '',
  workoutType: '',
  restSeconds: 90,
  startTime: null,
  workoutTimerInterval: null,
  totalWorkoutSeconds: 0,
  isPaused: false,
  pauseStartTime: null,
  totalPausedTime: 0,

  // ── Modo compañero ──
  companionMode: false,
  companionName: '',
  isCompanionTurn: false,
  companionWaitTime: 0,

  // ── Per-workout accumulators ──
  completedExercises: [],
  totalSeriesTime: 0,
  totalRestTime: 0,
  totalSkippedRestTime: 0,

  // ── Active exercise ──
  currentExercise: null,
  completedSets: [],
  equipmentType: null,
  barbellType: null,
  barbellWeight: 0,
  machineLoadEstimate: 0,

  // ── Timers ──
  setTimerInterval: null,
  setStartTime: null,
  setPausedTime: 0,
  setIsPaused: false,
  
  restTimerInterval: null,
  restRemaining: 0,
  restTotal: 0,
  restIsPaused: false,
  restPausedAt: null,
  
  nextWeight: 0,
  lastReminder: 0,

  // ── Reset ──
  reset() {
    this.stopAllTimers();
    this.active = false;
    this.mode = 'now';
    this.workoutName = '';
    this.workoutType = '';
    this.restSeconds = 90;
    this.startTime = null;
    this.totalWorkoutSeconds = 0;
    this.isPaused = false;
    this.pauseStartTime = null;
    this.totalPausedTime = 0;
    
    this.companionMode = false;
    this.companionName = '';
    this.isCompanionTurn = false;
    this.companionWaitTime = 0;
    
    this.completedExercises = [];
    this.totalSeriesTime = 0;
    this.totalRestTime = 0;
    this.totalSkippedRestTime = 0;
    
    this.currentExercise = null;
    this.completedSets = [];
    this.equipmentType = null;
    this.barbellType = null;
    this.barbellWeight = 0;
    this.machineLoadEstimate = 0;
    
    this.setPausedTime = 0;
    this.setIsPaused = false;
    this.nextWeight = 0;
    this.lastReminder = 0;
  },

  // ── Workout timer con pausa ──
  startWorkoutTimer() {
    if (this.mode === 'plan') return;
    if (this.workoutTimerInterval) return;
    this.startTime = this.startTime || Date.now();
    this.workoutTimerInterval = setInterval(() => {
      if (!this.isPaused) {
        const elapsed = Math.floor((Date.now() - this.startTime - this.totalPausedTime) / 1000);
        const m = Math.floor(elapsed / 60).toString().padStart(2,'0');
        const s = (elapsed % 60).toString().padStart(2,'0');
        const el = document.getElementById('session-timer');
        if (el) el.textContent = `${m}:${s}`;
      }
    }, 1000);
  },

  pauseWorkoutTimer() {
    if (!this.isPaused) {
      this.isPaused = true;
      this.pauseStartTime = Date.now();
      const el = document.getElementById('session-timer');
      if (el) el.classList.add('paused');
    }
  },

  resumeWorkoutTimer() {
    if (this.isPaused && this.pauseStartTime) {
      this.totalPausedTime += Date.now() - this.pauseStartTime;
      this.isPaused = false;
      this.pauseStartTime = null;
      const el = document.getElementById('session-timer');
      if (el) el.classList.remove('paused');
    }
  },

  stopWorkoutTimer() {
    if (this.workoutTimerInterval) {
      clearInterval(this.workoutTimerInterval);
      this.workoutTimerInterval = null;
    }
    if (this.startTime) {
      this.totalWorkoutSeconds = Math.floor((Date.now() - this.startTime - this.totalPausedTime) / 1000);
    }
  },

  // ── Set timer con pausa ──
  startSetTimer() {
    if (this.mode === 'plan') {
      // En modo planificación, solo mostrar 0:00
      const el = document.getElementById('set-running-timer');
      if (el) el.textContent = '0:00';
      return;
    } 

    this.setStartTime = Date.now();
    this.setPausedTime = 0;
    this.setIsPaused = false;
    const el = document.getElementById('set-running-timer');
    const pauseBtn = document.getElementById('btn-pause-set');
    if (pauseBtn) {
      pauseBtn.textContent = '⏸';
      pauseBtn.classList.remove('resumed');
    }
    
    this.setTimerInterval = setInterval(() => {
      if (!this.setIsPaused) {
        const secs = Math.floor((Date.now() - this.setStartTime - this.setPausedTime) / 1000);
        const m = Math.floor(secs / 60);
        const s = (secs % 60).toString().padStart(2,'0');
        if (el) el.textContent = `${m}:${s}`;
        
        // Recordatorios cada 30s
        if (secs > 0 && secs % 30 === 0 && secs !== this.lastReminder) {
          this.lastReminder = secs;
          showReminder();
        }
      }
    }, 1000);
  },

  pauseSetTimer() {
    if (!this.setIsPaused) {
      this.setIsPaused = true;
      this.setPauseStart = Date.now();
      const pauseBtn = document.getElementById('btn-pause-set');
      if (pauseBtn) {
        pauseBtn.textContent = '▶';
        pauseBtn.classList.add('resumed');
      }
    }
  },

  resumeSetTimer() {
    if (this.setIsPaused && this.setPauseStart) {
      this.setPausedTime += Date.now() - this.setPauseStart;
      this.setIsPaused = false;
      this.setPauseStart = null;
      const pauseBtn = document.getElementById('btn-pause-set');
      if (pauseBtn) {
        pauseBtn.textContent = '⏸';
        pauseBtn.classList.remove('resumed');
      }
    }
  },

  stopSetTimer() {
    if (this.setTimerInterval) {
      clearInterval(this.setTimerInterval);
      this.setTimerInterval = null;
    }
    const duration = this.setStartTime
      ? Math.floor((Date.now() - this.setStartTime - this.setPausedTime) / 1000) : 0;
    this.setStartTime = null;
    this.setPausedTime = 0;
    this.setIsPaused = false;
    return duration;
  },

  // ── Rest timer con pausa ──
  startRestTimer(onDone) {
    this.restRemaining = this.restSeconds;
    this.restTotal = this.restSeconds;
    this.restIsPaused = false;
    this.restPausedAt = null;
    
    const countEl = document.getElementById('rest-countdown');
    const barEl = document.getElementById('rest-progress-bar');
    const pauseBtn = document.getElementById('btn-pause-rest');
    
    if (countEl) countEl.textContent = this.restRemaining;
    if (barEl) barEl.style.width = '100%';
    if (pauseBtn) {
      pauseBtn.textContent = '⏸ Pausar';
      pauseBtn.classList.remove('resumed');
    }

    this.restTimerInterval = setInterval(() => {
      if (!this.restIsPaused) {
        this.restRemaining--;
        this.totalRestTime++;
        
        if (countEl) countEl.textContent = this.restRemaining;
        const pct = (this.restRemaining / this.restTotal) * 100;
        if (barEl) barEl.style.width = pct + '%';
        
        // Recordatorios durante descanso
        if (this.restRemaining > 0 && this.restRemaining % 30 === 0) {
          showReminder();
        }
        
        if (this.restRemaining <= 0) {
          this.stopRestTimer();
          onDone();
        }
      }
    }, 1000);
  },

  pauseRestTimer() {
    if (!this.restIsPaused) {
      this.restIsPaused = true;
      this.restPausedAt = Date.now();
      const pauseBtn = document.getElementById('btn-pause-rest');
      if (pauseBtn) {
        pauseBtn.textContent = '▶ Reanudar';
        pauseBtn.classList.add('resumed');
      }
    }
  },

  resumeRestTimer() {
    if (this.restIsPaused) {
      this.restIsPaused = false;
      this.restPausedAt = null;
      const pauseBtn = document.getElementById('btn-pause-rest');
      if (pauseBtn) {
        pauseBtn.textContent = '⏸ Pausar';
        pauseBtn.classList.remove('resumed');
      }
    }
  },

  stopRestTimer() {
    if (this.restTimerInterval) {
      clearInterval(this.restTimerInterval);
      this.restTimerInterval = null;
    }
    this.restIsPaused = false;
    this.restPausedAt = null;
  },

  stopAllTimers() {
    this.stopWorkoutTimer();
    this.stopSetTimer();
    this.stopRestTimer();
  },

  // ── Begin exercise con tipo de equipo ──
  beginExercise(name, muscle, equipmentType = null, barbellType = null, barbellWeight = 0) {
    this.currentExercise = { 
      id: uid(), 
      name, 
      muscle, 
      sets: [],
      equipmentType: equipmentType || EQUIPMENT_TYPES.MACHINE,
      barbellType: barbellType,
      barbellWeight: barbellWeight || 0
    };
    this.completedSets = [];
    this.equipmentType = equipmentType || EQUIPMENT_TYPES.MACHINE;
    this.barbellType = barbellType;
    this.barbellWeight = barbellWeight || 0;
    this.nextWeight = 0;
    
    // Si estamos en modo planificación, no activar workout timer
    if (this.mode === 'plan') {
      this.active = false; // No activar timers
    }
  },

  // ── Finish set con tipo de serie ──
  finishSet(weight, reps, setType = SET_TYPES.EFFECTIVE) {
    const duration = this.stopSetTimer();
    this.totalSeriesTime += duration;
    this.startWorkoutTimer();

    // Calcular peso real incluyendo barra si aplica
    let realWeight = parseFloat(weight) || 0;
    if (this.equipmentType === EQUIPMENT_TYPES.BARBELL && this.barbellWeight > 0) {
      realWeight += this.barbellWeight;
    }

    const set = {
      id: uid(),
      weight: String(weight),
      realWeight: String(realWeight),
      reps: String(reps),
      duration,
      setType: setType,
      equipmentType: this.equipmentType
    };
    
    this.completedSets.push(set);
    this.nextWeight = parseFloat(weight) || 0;
    return set;
  },

  // ── Close exercise ──
  closeExercise() {
    if (!this.currentExercise) return;
    const ex = {
      ...this.currentExercise,
      sets: [...this.completedSets],
      // Asegurar que se preserva la info de equipo
      equipmentType: this.equipmentType || EQUIPMENT_TYPES.MACHINE,
      barbellType: this.barbellType,
      barbellWeight: this.barbellWeight || 0
    };
    this.completedExercises.push(ex);
    this.currentExercise = null;
    this.completedSets = [];
    
    // NO resetear equipo aquí, se hace en startExercise
    return ex;
  },

  // ── Companion mode ──
  setCompanionTurn(isCompanion) {
    this.isCompanionTurn = isCompanion;
    if (isCompanion) {
      this.pauseWorkoutTimer();
      const companionWaitStart = Date.now();
      // Guardar timestamp para calcular tiempo de espera
      this.companionWaitStart = companionWaitStart;
    } else {
      if (this.companionWaitStart) {
        this.companionWaitTime += Math.floor((Date.now() - this.companionWaitStart) / 1000);
        this.companionWaitStart = null;
      }
      this.resumeWorkoutTimer();
    }
  },

  // ── Get totals ──
  getTotals() {
    this.stopAllTimers();
    const allExercises = [...this.completedExercises];
    
    // Calcular volumen usando peso real
    const totalVolume = allExercises.reduce((t, ex) => {
      return t + ex.sets.reduce((s, set) => {
        const w = parseFloat(set.realWeight || set.weight) || 0;
        const r = parseInt(set.reps) || 0;
        return s + (w * r);
      }, 0);
    }, 0);
    
    const totalSets = allExercises.reduce((t, ex) => t + ex.sets.length, 0);
    
    return {
      name: this.workoutName || 'Entrenamiento',
      type: this.workoutType,
      duration: this.totalWorkoutSeconds,
      exercises: allExercises,
      totalVolume,
      totalSets,
      exerciseCount: allExercises.length,
      seriesTime: this.totalSeriesTime,
      restTime: this.totalRestTime,
      skippedRestTime: this.totalSkippedRestTime,
      companionMode: this.companionMode,
      companionName: this.companionName,
      companionWaitTime: this.companionWaitTime
    };
  },

  // ── Crear plantilla ──
  saveAsTemplate() {
    if (this.completedExercises.length === 0 && !this.currentExercise) {
      showToast('No hay ejercicios para guardar como plantilla ✋');
      return null;
    }

    const exercises = [...this.completedExercises];
    if (this.currentExercise && this.completedSets.length > 0) {
      exercises.push({
        ...this.currentExercise,
        sets: [...this.completedSets]
      });
    }

    const template = {
      id: uid(),
      name: this.workoutName || 'Rutina sin nombre',
      type: this.workoutType,
      exercises: exercises.map(ex => ({
        name: ex.name,
        muscle: ex.muscle,
        equipmentType: ex.equipmentType || EQUIPMENT_TYPES.MACHINE,
        barbellType: ex.barbellType,
        barbellWeight: ex.barbellWeight || 0,
        estimatedSets: ex.sets.length,
        estimatedWeight: ex.sets.length > 0 ? parseFloat(ex.sets[0].weight) || 0 : 0
      })),
      restSeconds: this.restSeconds,
      createdAt: new Date().toISOString()
    };

    DataStore.addTemplate(template);
    return template;
  },

  // ── Cargar desde plantilla ──
  loadFromTemplate(templateId) {
    const template = DataStore.getTemplate(templateId);
    if (!template) return false;

    this.workoutName = template.name;
    this.workoutType = template.type;
    this.restSeconds = template.restSeconds || 90;
    
    return template;
  }
};

// Reemplazar Session con SessionV3 en el código principal
const Session = SessionV3;

/* ============================================================
   RECORDATORIOS INTELIGENTES
   ============================================================ */

const REMINDERS = [
  '💧 Recuerda hidratarte',
  '🫁 Controla la respiración',
  '🎯 Mantén la técnica',
  '⚠️ No bloquees articulaciones',
  '🧘 Concéntrate en el músculo',
  '💪 Mantén la tensión',
  '🔥 Explosivo en la subida',
  '⏱️ Controla la bajada',
  '🎯 Rango completo de movimiento'
];

let lastReminderIndex = -1;

function showReminder() {
  let index;
  do {
    index = Math.floor(Math.random() * REMINDERS.length);
  } while (index === lastReminderIndex && REMINDERS.length > 1);
  
  lastReminderIndex = index;
  
  const reminderEl = document.getElementById('training-reminder');
  if (reminderEl) {
    reminderEl.textContent = REMINDERS[index];
    reminderEl.classList.remove('hidden');
    reminderEl.classList.add('show');
    
    setTimeout(() => {
      reminderEl.classList.remove('show');
      setTimeout(() => reminderEl.classList.add('hidden'), 300);
    }, 4000);
  }
}

/* ============================================================
   MODAL CONTROLLER
   ============================================================ */
const Modal = {
  _currentPostId: null,

  open(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  },

  close(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      document.body.style.overflow = '';
    }
  },

  openComments(postId) {
    this._currentPostId = postId;
    this.open('modal-comments');
    renderComments(postId);
  }
};

/* ============================================================
   TOAST NOTIFICATION
   ============================================================ */
function showToast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, duration);
}

/* ============================================================
   NAVIGATION CONTROLLER
   ============================================================ */
const Nav = {
  current: 'feed',

  goto(sectionId) {
    // Handle train sub-views
    if (sectionId === 'train' && this.current === 'train') return;

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    const section = document.getElementById(`section-${sectionId}`);
    const btn = document.querySelector(`.nav-item[data-section="${sectionId}"]`);

    if (section) section.classList.add('active');
    if (btn) btn.classList.add('active');

    this.current = sectionId;

    // Lazy-render sections on visit
    if (sectionId === 'feed') renderFeed();
    if (sectionId === 'stats') renderStats();
    if (sectionId === 'profile') renderProfile();
    if (sectionId === 'train') renderTrainHome();
  }
};

/* ============================================================
   RENDERER: FEED
   ============================================================ */
function renderFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  const posts = DataStore.getPosts();

  if (posts.length === 0) {
    container.innerHTML = `
      <div class="empty-feed">
        <div class="empty-icon">🏋️</div>
        <h3>El feed está vacío</h3>
        <p>Completa tu primer entrenamiento<br>para aparecer en el feed.</p>
      </div>`;
    return;
  }

  container.innerHTML = posts.map(post => renderFeedCard(post)).join('');

  // Bind events
  container.querySelectorAll('.feed-like-btn').forEach(btn => {
    btn.addEventListener('click', () => handleLike(btn.dataset.postId));
  });
  container.querySelectorAll('.feed-comment-btn').forEach(btn => {
    btn.addEventListener('click', () => Modal.openComments(btn.dataset.postId));
  });
  container.querySelectorAll('.feed-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => openWorkoutDetail(btn.dataset.postId));
  });
}

function renderFeedCard(post) {
  const userId = DataStore.getUser().id;
  const isLiked = post.likedBy && post.likedBy.includes(userId);
  const prHtml = post.prs && post.prs.length > 0
    ? `<div class="feed-pr-row">${post.prs.map(pr =>
        `<div class="pr-chip"><span class="pr-chip-icon">👑</span> PR: ${pr.exercise} ${pr.weight}kg</div>`
      ).join('')}</div>`
    : '';

  return `
    <div class="feed-card">
      <div class="feed-card-header">
        <div class="feed-avatar" style="background:${post.avatarColor}">${post.initials}</div>
        <div class="feed-user-info">
          <div class="feed-username">${post.username}</div>
          <div class="feed-meta">${fmtRelTime(post.createdAt)}</div>
        </div>
        <div class="feed-type-badge">${post.type || 'Gym Session'}</div>
      </div>
      <div class="feed-card-body">
        <div class="feed-session-name">${post.sessionName}</div>
        <div class="feed-stats-row">
          <div class="feed-stat-pill">
            <span class="stat-icon">⚡</span>
            <span>${fmtVolume(post.totalVolume)}</span>
          </div>
          <div class="feed-stat-pill">
            <span class="stat-icon">🔁</span>
            <span>${post.totalSets} series</span>
          </div>
          <div class="feed-stat-pill">
            <span class="stat-icon">⏱</span>
            <span>${fmtDuration(post.duration)}</span>
          </div>
          <div class="feed-stat-pill">
            <span class="stat-icon">💪</span>
            <span>${post.exerciseCount} ejercicios</span>
          </div>
        </div>
        ${prHtml}
      </div>
      <div class="feed-card-actions">
        <button class="feed-action-btn feed-like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
          <span class="action-icon">${isLiked ? '❤️' : '🤍'}</span>
          <span>${post.likes}</span>
        </button>
        <button class="feed-action-btn feed-comment-btn" data-post-id="${post.id}">
          <span class="action-icon">💬</span>
          <span>${post.comments ? post.comments.length : 0}</span>
        </button>
        <button class="feed-action-btn feed-detail-btn" data-post-id="${post.id}">
          <span class="action-icon">📋</span>
          <span>Ver</span>
        </button>
      </div>
    </div>`;
}

function handleLike(postId) {
  const userId = DataStore.getUser().id;
  const posts = DataStore.getPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return;

  if (!post.likedBy) post.likedBy = [];
  const idx = post.likedBy.indexOf(userId);
  if (idx === -1) {
    post.likedBy.push(userId);
    post.likes = (post.likes || 0) + 1;
  } else {
    post.likedBy.splice(idx, 1);
    post.likes = Math.max(0, (post.likes || 0) - 1);
  }
  DataStore.savePosts(posts);
  renderFeed();
}

function openWorkoutDetail(postId) {
  const posts = DataStore.getPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return;

  document.getElementById('detail-modal-title').textContent = post.sessionName;
  const content = document.getElementById('detail-modal-content');

  const statsHtml = `
    <div class="summary-stats-grid" style="padding:0; margin-bottom:16px;">
      <div class="summary-stat-card">
        <div class="summary-stat-value orange">${fmtVolume(post.totalVolume)}</div>
        <div class="summary-stat-label">Volumen total</div>
      </div>
      <div class="summary-stat-card">
        <div class="summary-stat-value">${fmtDuration(post.duration)}</div>
        <div class="summary-stat-label">Duración</div>
      </div>
    </div>`;

  const prHtml = post.prs && post.prs.length > 0 ? `
    <div class="summary-prs" style="padding:0; margin-bottom:16px;">
      <div class="summary-prs-title">👑 Personal Records</div>
      ${post.prs.map(pr => `
        <div class="summary-pr-item">
          <span class="pr-icon">🏆</span>
          <span class="pr-text">${pr.exercise} — ${pr.weight}kg</span>
        </div>`).join('')}
    </div>` : '';
  
  const exHtml = (post.exercises || []).map(ex => {
    let equipmentInfo = '';
    if (ex.equipmentType === EQUIPMENT_TYPES.BARBELL && ex.barbellWeight > 0) {
      equipmentInfo = `<div class="detail-equipment">🏋️ ${ex.barbellType} (${ex.barbellWeight}kg)</div>`;
    } else if (ex.equipmentType === EQUIPMENT_TYPES.DUMBBELL) {
      equipmentInfo = `<div class="detail-equipment">🏋️ Mancuernas</div>`;
    } else if (ex.equipmentType) {
      equipmentInfo = `<div class="detail-equipment">🔧 Máquina</div>`;
    }
    
    const sets = ex.sets.map((s, i) => {
      const displayWeight = s.realWeight || s.weight;
      return `
        <div class="detail-set-row">
          <div class="detail-set-num">${i+1}</div>
          <div class="detail-set-info">${s.weight}kg × ${s.reps} reps ${s.realWeight && s.realWeight !== s.weight ? `(${s.realWeight}kg total)` : ''}</div>
          <div class="detail-set-vol">${Math.round(parseFloat(displayWeight)*parseInt(s.reps))} kg-vol</div>
        </div>`;
    }).join('');
    
    return `
      <div class="detail-exercise-item">
        <div class="detail-exercise-name">${ex.name}</div>
        ${equipmentInfo}
        ${sets}
      </div>`;
  }).join('');

  content.innerHTML = statsHtml + prHtml + exHtml;
  Modal.open('modal-workout-detail');
}

/* ============================================================
   RENDERER: COMMENTS
   ============================================================ */
function renderComments(postId) {
  const posts = DataStore.getPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return;

  const list = document.getElementById('comments-list');
  const comments = post.comments || [];

  if (comments.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:13px;">Sin comentarios aún. ¡Sé el primero!</div>`;
    return;
  }

  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-avatar" style="background:${c.avatarColor || 'linear-gradient(135deg,#555,#777)'}">${c.initials || c.username[0]}</div>
      <div class="comment-body">
        <div class="comment-username">${c.username}</div>
        <div class="comment-text">${c.text}</div>
      </div>
    </div>`).join('');
}

function handleSendComment() {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text || !Modal._currentPostId) return;

  const user = DataStore.getUser();
  const posts = DataStore.getPosts();
  const post = posts.find(p => p.id === Modal._currentPostId);
  if (!post) return;

  if (!post.comments) post.comments = [];
  post.comments.push({
    username: user.username,
    initials: user.initials,
    avatarColor: user.avatarColor,
    text,
    createdAt: new Date().toISOString()
  });
  DataStore.savePosts(posts);

  input.value = '';
  renderComments(Modal._currentPostId);
  renderFeed();
  showToast('Comentario publicado ✓');
}

/* ============================================================
   RENDERER: TRAIN HOME
   ============================================================ */
function renderTrainHome() {
  const workouts = DataStore.getWorkouts().slice(0, 5);
  const list = document.getElementById('recent-workouts-list');
  if (!list) return;

  if (workouts.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:30px 0;color:var(--text-secondary);font-size:13px;">Sin entrenamientos recientes. ¡Empieza ahora!</div>`;
    return;
  }

  const icons = ['🔥','💪','⚡','🏋️','🦾'];
  list.innerHTML = workouts.map((w, i) => `
    <div class="recent-workout-card">
      <div class="recent-workout-icon">${icons[i % icons.length]}</div>
      <div class="recent-workout-info">
        <div class="recent-workout-name">${w.name}</div>
        <div class="recent-workout-meta">${fmtRelTime(w.date)} · ${w.totalSets} series · ${w.exerciseCount} ejercicios</div>
      </div>
      <div class="recent-workout-vol">${fmtVolume(w.totalVolume)}</div>
    </div>`).join('');
}

/* ============================================================
   TRAIN CONFIG VIEW
   ============================================================ */

// Renderizar vista de configuración (modificada)
function renderConfigViewV2() {
  const typeContainer = document.getElementById('type-options');
  if (typeContainer && typeContainer.childElementCount === 0) {
    typeContainer.innerHTML = WORKOUT_TYPES.map((t, i) =>
      `<button class="type-btn ${i === 0 ? 'active' : ''}" data-type="${t}">${t}</button>`
    ).join('');

    typeContainer.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        typeContainer.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Session.workoutType = btn.dataset.type;
      });
    });

    Session.workoutType = WORKOUT_TYPES[0];
  }

  document.querySelectorAll('.rest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rest-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Session.restSeconds = parseInt(btn.dataset.secs);
    });
  });
  
  // Configurar modo compañero
  const companionCheck = document.getElementById('companion-mode-check');
  if (companionCheck) {
    companionCheck.addEventListener('change', handleCompanionToggle);
  }
}

/* ============================================================
   RENDERER: ACTIVE SESSION
   ============================================================ */
function showExState(stateId) {
  ['state-preview','state-set-running','state-rest'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== stateId);
  });
}

// Renderizar preview del ejercicio (modificado)

function renderExercisePreviewV2(name, muscle) {
  const INFO = {
    'Press Banca': {
      desc: 'Empuje horizontal de pecho. Controla la bajada en 2-3s y explota en la subida.',
      errors: 'Levantar la espalda del banco. No bajar la barra al pecho.'
    },
    'Sentadilla': {
      desc: 'Ejercicio rey del tren inferior. Mantén el torso erguido y rodillas alineadas con los pies.',
      errors: 'Rodillas hacia adentro (valgo). Talones levantados.'
    },
    'Peso Muerto': {
      desc: 'Tracción del suelo al hip. Espalda neutra en todo momento, barra pegada al cuerpo.',
      errors: 'Redondear la zona lumbar. Barra separada del cuerpo.'
    },
    'Press Militar': {
      desc: 'Empuje vertical de hombros. Core braceado, no arquees la zona lumbar.',
      errors: 'Arquear excesivamente la espalda. Codos muy abiertos.'
    },
    'Dominadas': {
      desc: 'Tracción vertical. Escápulas retraídas al inicio, pecho buscando la barra.',
      errors: 'Balanceo del cuerpo. No completar el rango de movimiento.'
    },
    'Remo Barra': {
      desc: 'Tracción horizontal de espalda. Torso a ~45°, codos cerca del cuerpo.',
      errors: 'Usar impulso del torso. Barra demasiado alta o baja.'
    },
    'Hip Thrust': {
      desc: 'Empuje de cadera. Espalda alta sobre el banco, contrae glúteos en el tope.',
      errors: 'Hiperextender la zona lumbar. No alcanzar extensión completa de cadera.'
    },
    'default': {
      desc: 'Mantén la técnica correcta durante todo el rango de movimiento. Controla el peso en todo momento.',
      errors: 'Usar peso excesivo sacrificando la técnica.'
    }
  };

  const info = INFO[name] || INFO['default'];
  document.getElementById('active-ex-name').textContent = name;
  document.getElementById('active-ex-muscle').textContent = muscle.toUpperCase();
  document.getElementById('active-exercise-panel').classList.remove('hidden');

  // Inicializar equipo con valor por defecto si no está configurado
  if (!Session.equipmentType) {
    Session.equipmentType = EQUIPMENT_TYPES.MACHINE;
  }

  // Determinar texto del label de equipo
  let equipmentText = '🔧 Máquina';
  if (Session.equipmentType === EQUIPMENT_TYPES.BARBELL) {
    if (Session.barbellType && Session.barbellWeight > 0) {
      equipmentText = `🏋️ ${Session.barbellType} (${Session.barbellWeight}kg)`;
    } else {
      equipmentText = '🏋️ Barra Libre (configurar peso)';
    }
  } else if (Session.equipmentType === EQUIPMENT_TYPES.DUMBBELL) {
    equipmentText = '🏋️ Mancuernas';
  }

  document.getElementById('ex-preview-body').innerHTML = `
    <div class="ex-preview-muscle-row">
      <span class="muscle-chip">💪 ${muscle}</span>
      <button class="btn-equipment-config" onclick="openEquipmentModal()">
        ⚙️ Configurar equipo
      </button>
    </div>
    <div id="current-equipment-label" class="current-equipment-label">${equipmentText}</div>
    <div class="ex-preview-desc">${info.desc}</div>
    <div class="ex-preview-errors">
      <strong>⚠ Errores comunes</strong>
      ${info.errors}
    </div>`;

  showExState('state-preview');
  renderCompletedSetsV2();
}

// Renderizar sets completados (modificado)
function renderCompletedSetsV2() {
  const sets = Session.completedSets;
  const prs = DataStore.getPRs();
  const titleEl = document.getElementById('completed-sets-title');
  const listEl = document.getElementById('completed-sets-list');
  if (!titleEl || !listEl) return;

  if (sets.length === 0) {
    titleEl.textContent = '';
    listEl.innerHTML = '';
    return;
  }

  titleEl.textContent = `${sets.length} serie${sets.length > 1 ? 's' : ''} completada${sets.length > 1 ? 's' : ''}`;
  const exName = Session.currentExercise?.name || '';
  
  listEl.innerHTML = sets.map((s, i) => {
    const isPR = detectPRV2(exName, s.realWeight || s.weight, prs, s.setType);
    const vol = Math.round(parseFloat(s.realWeight || s.weight) * parseInt(s.reps));
    
    const typeLabel = s.setType === SET_TYPES.WARMUP ? '🔥' : 
                      s.setType === SET_TYPES.APPROACH ? '📊' : '💪';
    const typeTooltip = s.setType === SET_TYPES.WARMUP ? 'Calentamiento' : 
                        s.setType === SET_TYPES.APPROACH ? 'Aproximación' : 'Efectiva';
    
    return `
      <div class="done-set-row">
        <div class="done-set-num ${isPR ? 'pr-set' : ''}" title="${typeTooltip}">
          ${isPR ? '👑' : typeLabel}
        </div>
        <div class="done-set-info">
          ${s.weight}kg × ${s.reps} reps
          ${s.equipmentType === EQUIPMENT_TYPES.BARBELL && s.realWeight !== s.weight 
            ? `<span class="real-weight-note">(${s.realWeight}kg con barra)</span>` 
            : ''}
          ${s.equipmentType === EQUIPMENT_TYPES.DUMBBELL 
            ? `<span class="equipment-note">🏋️</span>` 
            : ''}
        </div>
        <div class="done-set-time">⏱ ${fmtDuration(s.duration)}</div>
        <div class="done-set-vol">${vol > 0 ? vol + 'kg' : ''}</div>
      </div>`;
  }).join('');
}

function renderCompletedExercises() {
  const listEl = document.getElementById('completed-exercises-list');
  if (!listEl) return;
  listEl.innerHTML = Session.completedExercises.map(ex => {
    const vol = calcVolumeV2(ex.sets);
    return `
      <div class="completed-ex-row">
        <div>
          <div class="completed-ex-row-name">${ex.name}</div>
          <div class="completed-ex-row-meta">${ex.sets.length} series · ${fmtDuration(ex.sets.reduce((t,s)=>t+(s.duration||0),0))} activo</div>
        </div>
        <div class="completed-ex-row-vol">${fmtVolume(vol)}</div>
      </div>`;
  }).join('');
}

// Renderizar inicio de siguiente serie (modificado)
function beginNextSetV2() {
  const setNumber = Session.completedSets.length + 1;
  const badge = document.getElementById('set-running-badge');
  if (badge) badge.textContent = `SERIE ${setNumber}`;

  const weightInput = document.getElementById('set-weight-input');
  const repsInput = document.getElementById('set-reps-input');
  if (weightInput) weightInput.value = Session.nextWeight > 0 ? Session.nextWeight : '';
  
  // Agregar placeholder dinámico según equipo
  if (weightInput) {
    if (Session.equipmentType === EQUIPMENT_TYPES.BARBELL && Session.barbellWeight > 0) {
      weightInput.placeholder = `Peso sin barra (barra: ${Session.barbellWeight}kg)`;
    } else if (Session.equipmentType === EQUIPMENT_TYPES.DUMBBELL) {
      weightInput.placeholder = 'Peso por mancuerna';
    } else {
      weightInput.placeholder = 'Peso en máquina';
    }
  }

  if (repsInput) repsInput.value = '';

  const timerEl = document.getElementById('set-running-timer');
  if (timerEl) timerEl.textContent = '0:00';
  
  // Resetear selección de tipo de serie a "efectiva"
  document.querySelectorAll('.set-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === SET_TYPES.EFFECTIVE);
  });

  showExState('state-set-running');
  Session.startSetTimer();

  setTimeout(() => {
    if (weightInput && !weightInput.value) weightInput.focus();
    else if (repsInput) repsInput.focus();
  }, 80);
}

// Handler: Finalizar serie (mejorado)

function handleFinishSetV2() {
  const weight = parseFloat(document.getElementById('set-weight-input').value) || 0;
  const reps = parseInt(document.getElementById('set-reps-input').value) || 0;
  
  if (weight === 0 && reps === 0) {
    showToast('Registra al menos peso o repeticiones ✋');
    return;
  }
  
  const setTypeBtn = document.querySelector('.set-type-btn.active');
  const setType = setTypeBtn ? setTypeBtn.dataset.type : SET_TYPES.EFFECTIVE;
  
  // En modo planificación, no hay duración real
  let set;
  if (Session.mode === 'plan') {
    // Calcular peso real incluyendo barra si aplica
    let realWeight = parseFloat(weight) || 0;
    if (Session.equipmentType === EQUIPMENT_TYPES.BARBELL && Session.barbellWeight > 0) {
      realWeight += Session.barbellWeight;
    }
    
    set = {
      id: uid(),
      weight: String(weight),
      realWeight: String(realWeight),
      reps: String(reps),
      duration: 0, // Sin duración en planificación
      setType: setType,
      equipmentType: Session.equipmentType
    };
    
    Session.completedSets.push(set);
    Session.nextWeight = parseFloat(weight) || 0;
    
    // Ir directo a la siguiente serie sin descanso
    document.getElementById('rest-weight-val').textContent = weight;
    renderCompletedSetsV2();
    
    // Preguntar si quiere otra serie o finalizar
    if (confirm('¿Agregar otra serie a este ejercicio?')) {
      beginNextSetV2();
    } else {
      handleFinishExercise();
    }
  } else {
    // Modo normal con timer
    set = Session.finishSet(weight, reps, setType);
    
    const lastSetEl = document.getElementById('rest-last-set');
    if (lastSetEl) {
      const typeLabel = setType === SET_TYPES.WARMUP ? 'Calentamiento' : 
                        setType === SET_TYPES.APPROACH ? 'Aproximación' : 'Efectiva';
      
      let equipmentInfo = '';
      if (Session.equipmentType === EQUIPMENT_TYPES.BARBELL && Session.barbellWeight > 0) {
        equipmentInfo = ` (${set.realWeight}kg con ${Session.barbellType})`;
      } else if (Session.equipmentType === EQUIPMENT_TYPES.DUMBBELL) {
        equipmentInfo = ' (Mancuernas)';
      } else {
        equipmentInfo = ' (Máquina)';
      }
      
      let text = `Serie ${Session.completedSets.length} (${typeLabel}): ${weight}kg × ${reps} reps${equipmentInfo} · ${fmtDuration(set.duration)}`;
      
      lastSetEl.textContent = text;
    }

    document.getElementById('rest-weight-val').textContent = weight;
    Session.nextWeight = weight;

    showExState('state-rest');
    renderCompletedSetsV2();

    Session.startRestTimer(() => {
      showToast('¡Descanso terminado! A por la siguiente serie 💪');
      beginNextSetV2();
    });
  }
}

// Handler: Guardar como plantilla
function handleSaveAsTemplate() {
  const template = Session.saveAsTemplate();
  if (template) {
    showToast(`Plantilla "${template.name}" guardada ✓`);
    renderTemplatesList();
  }
}

function handleSaveTemplateFromConfig() {
  const name = document.getElementById('config-name').value.trim();
  if (!name) {
    showToast('Ingresa un nombre para la plantilla ✋');
    return;
  }
  
  // Crear plantilla vacía que se llenará después
  const template = {
    id: uid(),
    name: name,
    type: Session.workoutType,
    exercises: [], // Vacío por ahora
    restSeconds: Session.restSeconds,
    createdAt: new Date().toISOString(),
    isPlanTemplate: true // Marca que es plantilla de planificación
  };
  
  DataStore.addTemplate(template);
  showToast(`Plantilla "${name}" creada. Agrégale ejercicios ✓`);
  
  // Continuar a agregar ejercicios
  Session.workoutName = name;
  document.getElementById('session-name-display').textContent = name;
  document.getElementById('active-exercise-panel').classList.add('hidden');
  document.getElementById('completed-exercises-list').innerHTML = '';
  showTrainView('train-session');
  openAddExerciseModal();
}


// Handler: Cargar plantilla
function handleLoadTemplate(templateId) {
  const template = Session.loadFromTemplate(templateId);
  if (!template) return;
  
  Session.active = true;
  document.getElementById('config-name').value = template.name;
  document.getElementById('session-name-display').textContent = template.name;
  
  // Establecer tipo y descanso
  const typeBtn = document.querySelector(`.type-btn[data-type="${template.type}"]`);
  if (typeBtn) typeBtn.click();
  
  const restBtn = document.querySelector(`.rest-btn[data-secs="${template.restSeconds}"]`);
  if (restBtn) restBtn.click();
  
  Modal.close('modal-templates');
  showTrainView('train-session');
  
  // Auto-cargar primer ejercicio
  if (template.exercises.length > 0) {
    const firstEx = template.exercises[0];
    startExerciseFromTemplate(firstEx);
  }
}

// Handler: Iniciar ejercicio desde plantilla
function startExerciseFromTemplate(templateExercise) {
  Session.beginExercise(
    templateExercise.name,
    templateExercise.muscle,
    templateExercise.equipmentType || EQUIPMENT_TYPES.MACHINE,
    templateExercise.barbellType,
    templateExercise.barbellWeight || 0
  );
  
  Session.nextWeight = templateExercise.estimatedWeight || 0;
  
  renderExercisePreviewV2(templateExercise.name, templateExercise.muscle);
  renderCompletedSetsV2();
  
  // Actualizar UI de equipo se hace automáticamente en renderExercisePreviewV2
}

// Handler: Eliminar plantilla
function handleDeleteTemplate(templateId) {
  if (confirm('¿Eliminar esta plantilla?')) {
    DataStore.deleteTemplate(templateId);
    renderTemplatesList();
    showToast('Plantilla eliminada ✓');
  }
}

// Handler: Omitir descanso (mejorado)
function handleSkipRestV2() {
  const elapsed = Session.restTotal - Session.restRemaining;
  const skipped = Session.restRemaining;
  Session.totalRestTime += elapsed;
  Session.totalSkippedRestTime += skipped;
  Session.stopRestTimer();
  beginNextSetV2();
}

function handleFinishExercise() {
  if (Session.completedSets.length === 0) {
    showToast('Completa al menos una serie antes de finalizar ✋');
    return;
  }
  Session.stopSetTimer();
  Session.stopRestTimer();
  const ex = Session.closeExercise();
  renderCompletedExercises();
  document.getElementById('active-exercise-panel').classList.add('hidden');
  showExState('state-preview');

  // Si estamos en modo planificación, actualizar la plantilla
  if (Session.mode === 'plan') {
    updatePlanTemplate();
  }

  showToast(`${ex.name} completado — ${fmtVolume(calcVolumeV2(ex.sets))} 🔥`);
}

function updatePlanTemplate() {
  const templates = DataStore.getTemplates();
  const currentTemplate = templates.find(t => 
    t.name === Session.workoutName && t.isPlanTemplate
  );
  
  if (currentTemplate) {
    // Actualizar ejercicios en la plantilla
    currentTemplate.exercises = Session.completedExercises.map(ex => ({
      name: ex.name,
      muscle: ex.muscle,
      equipmentType: ex.equipmentType || EQUIPMENT_TYPES.MACHINE,
      barbellType: ex.barbellType,
      barbellWeight: ex.barbellWeight || 0,
      estimatedSets: ex.sets.length,
      estimatedWeight: ex.sets.length > 0 ? parseFloat(ex.sets[0].weight) || 0 : 0
    }));
    
    DataStore.saveTemplates(templates);
  }
}

/* ============================================================
   RENDERER: SESSION (ACTIVE WORKOUT)
   ============================================================ */
// Renderizar lista de plantillas
function renderTemplatesList() {
  const list = document.getElementById('templates-list');
  if (!list) return;
  
  const templates = DataStore.getTemplates();
  
  if (templates.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;padding:30px 0;color:var(--text-secondary);font-size:13px;">
        Sin plantillas guardadas. Crea tu primera rutina y guárdala como plantilla.
      </div>`;
    return;
  }
  
  list.innerHTML = templates.map(t => `
    <div class="template-card">
      <div class="template-header">
        <div>
          <div class="template-name">${t.name}</div>
          <div class="template-meta">${t.exercises.length} ejercicios · ${fmtRelTime(t.createdAt)}</div>
        </div>
        <button class="btn-delete-template" onclick="handleDeleteTemplate('${t.id}')">✕</button>
      </div>
      <div class="template-type-badge">${t.type}</div>
      <button class="btn-use-template" onclick="handleLoadTemplate('${t.id}')">
        Usar plantilla →
      </button>
    </div>
  `).join('');
}

   function renderSession() {
  const list = document.getElementById('exercises-list');
  if (!list) return;

  const prs = DataStore.getPRs();

  list.innerHTML = Session.exercises.map(ex => {
    const vol = calcVolumeV2(ex.sets);
    const setsHtml = ex.sets.map((set, idx) => {
      const weight = parseFloat(set.weight) || 0;
      const isPR = weight > 0 && detectPR(ex.name, weight, prs);
      return `
        <div class="set-row" data-set-id="${set.id}">
          <div class="set-number ${isPR ? 'pr' : ''}">${isPR ? '👑' : idx+1}</div>
          <div class="set-input-group">
            <span class="set-label">KG</span>
            <input type="number" class="set-input set-weight" inputmode="decimal"
              placeholder="0" value="${set.weight}"
              data-exercise-id="${ex.id}" data-set-id="${set.id}" data-field="weight" />
            <span class="set-divider">×</span>
            <span class="set-label">REPS</span>
            <input type="number" class="set-input set-reps" inputmode="numeric"
              placeholder="0" value="${set.reps}"
              data-exercise-id="${ex.id}" data-set-id="${set.id}" data-field="reps" />
          </div>
          <button class="btn-remove-set" data-exercise-id="${ex.id}" data-set-id="${set.id}">✕</button>
        </div>`;
    }).join('');

    return `
      <div class="exercise-card" data-exercise-id="${ex.id}">
        <div class="exercise-header">
          <div>
            <div class="exercise-name">${ex.name}</div>
            <div class="exercise-volume">Volumen: ${fmtVolume(vol)}</div>
          </div>
          <button class="btn-remove-exercise" data-exercise-id="${ex.id}">✕</button>
        </div>
        <div class="sets-list">${setsHtml}</div>
        <button class="btn-add-set" data-exercise-id="${ex.id}">+ Agregar Serie</button>
      </div>`;
  }).join('');

  // Bind set inputs
  list.querySelectorAll('.set-input').forEach(input => {
    input.addEventListener('input', () => {
      Session.updateSet(input.dataset.exerciseId, input.dataset.setId, input.dataset.field, input.value);
      updateExerciseVolume(input.dataset.exerciseId);
    });
    input.addEventListener('focus', () => input.select());
  });

  // Bind add set buttons
  list.querySelectorAll('.btn-add-set').forEach(btn => {
    btn.addEventListener('click', () => {
      Session.addSet(btn.dataset.exerciseId);
      renderSession();
      // Focus last set weight input for this exercise
      setTimeout(() => {
        const card = list.querySelector(`[data-exercise-id="${btn.dataset.exerciseId}"]`);
        if (card) {
          const inputs = card.querySelectorAll('.set-weight');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
      }, 50);
    });
  });

  // Bind remove set
  list.querySelectorAll('.btn-remove-set').forEach(btn => {
    btn.addEventListener('click', () => {
      Session.removeSet(btn.dataset.exerciseId, btn.dataset.setId);
      renderSession();
    });
  });

  // Bind remove exercise
  list.querySelectorAll('.btn-remove-exercise').forEach(btn => {
    btn.addEventListener('click', () => {
      Session.removeExercise(btn.dataset.exerciseId);
      renderSession();
    });
  });
}

function updateExerciseVolume(exerciseId) {
  const ex = Session.exercises.find(e => e.id === exerciseId);
  if (!ex) return;
  const card = document.querySelector(`.exercise-card[data-exercise-id="${exerciseId}"]`);
  if (card) {
    const volEl = card.querySelector('.exercise-volume');
    if (volEl) volEl.textContent = `Volumen: ${fmtVolume(calcVolumeV2(ex.sets))}`;
  }
}

/* ============================================================
   RENDERER: SUMMARY
   ============================================================ */
function renderSummary(workout) {
  document.getElementById('summary-name').textContent = workout.name;
  document.getElementById('summary-duration').textContent = `Duración total: ${fmtDuration(workout.duration)}`;

  document.getElementById('summary-stats-grid').innerHTML = `
    <div class="summary-stat-card accent">
      <div class="summary-stat-value orange">${fmtVolume(workout.totalVolume)}</div>
      <div class="summary-stat-label">Volumen total</div>
    </div>
    <div class="summary-stat-card">
      <div class="summary-stat-value">${workout.exerciseCount}</div>
      <div class="summary-stat-label">Ejercicios</div>
    </div>
    <div class="summary-stat-card">
      <div class="summary-stat-value green">${workout.totalSets}</div>
      <div class="summary-stat-label">Series totales</div>
    </div>
    <div class="summary-stat-card">
      <div class="summary-stat-value">${workout.prs.length}</div>
      <div class="summary-stat-label">PRs nuevos 👑</div>
    </div>`;

  document.getElementById('summary-time-breakdown').innerHTML = `
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text-secondary);padding-bottom:8px;">⏱ DESGLOSE DE TIEMPO</div>
    <div class="time-breakdown-row">
      <div class="tbd-label"><div class="tbd-dot" style="background:var(--accent-green)"></div>Tiempo en series</div>
      <div class="tbd-val">${fmtDuration(workout.seriesTime || 0)}</div>
    </div>
    <div class="time-breakdown-row">
      <div class="tbd-label"><div class="tbd-dot" style="background:var(--accent-orange)"></div>Tiempo en descanso</div>
      <div class="tbd-val">${fmtDuration(workout.restTime || 0)}</div>
    </div>
    <div class="time-breakdown-row">
      <div class="tbd-label"><div class="tbd-dot" style="background:var(--accent-blue)"></div>Total entrenamiento</div>
      <div class="tbd-val">${fmtDuration(workout.duration)}</div>
    </div>`;

    // Rellenar el desglose extendido
    const seriesTimeEl = document.getElementById('summary-series-time');
    const restTimeEl = document.getElementById('summary-rest-time');
    const skippedTimeEl = document.getElementById('summary-skipped-time');
    const totalTimeEl = document.getElementById('summary-total-time');

    if (seriesTimeEl) seriesTimeEl.textContent = fmtDuration(workout.seriesTime || 0);
    if (restTimeEl) restTimeEl.textContent = fmtDuration(workout.restTime || 0);
    if (skippedTimeEl) skippedTimeEl.textContent = fmtDuration(workout.skippedRestTime || 0);
    if (totalTimeEl) totalTimeEl.textContent = fmtDuration(workout.duration);

    // Si hay compañero, mostrar tiempo de espera
    if (workout.companionMode && workout.companionWaitTime > 0) {
      const companionRow = document.querySelector('.companion-wait-row');
      const companionTimeEl = document.getElementById('summary-companion-time');
      if (companionRow) companionRow.classList.remove('hidden');
      if (companionTimeEl) companionTimeEl.textContent = fmtDuration(workout.companionWaitTime);
    }

  const prsEl = document.getElementById('summary-prs');
  prsEl.innerHTML = workout.prs.length > 0 ? `
    <div class="summary-prs-title">👑 PERSONAL RECORDS NUEVOS</div>
    ${workout.prs.map(pr => `
      <div class="summary-pr-item">
        <span class="pr-icon">🏆</span>
        <span class="pr-text">${pr.exercise} — ${pr.weight}kg (nuevo máximo)</span>
      </div>`).join('')}` : '';

  document.getElementById('summary-exercises').innerHTML = `
    <div style="padding:0 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text-secondary);">EJERCICIOS</div>
    ${workout.exercises.map(ex => {
      let equipmentBadge = '';
      if (ex.equipmentType === EQUIPMENT_TYPES.BARBELL && ex.barbellWeight > 0) {
        equipmentBadge = `<span class="equipment-badge barbell">🏋️ ${ex.barbellType} (${ex.barbellWeight}kg)</span>`;
      } else if (ex.equipmentType === EQUIPMENT_TYPES.DUMBBELL) {
        equipmentBadge = `<span class="equipment-badge dumbbell">🏋️ Mancuernas</span>`;
      } else {
        equipmentBadge = `<span class="equipment-badge machine">🔧 Máquina</span>`;
      }
      
      return `
        <div class="summary-exercise-item">
          <div>
            <div class="summary-exercise-name">${ex.name}</div>
            ${equipmentBadge}
            <div class="summary-exercise-sets">${ex.sets.length} series · ${fmtDuration(ex.sets.reduce((t,s)=>t+(s.duration||0),0))} activo</div>
          </div>
          <div class="summary-exercise-vol">${fmtVolume(calcVolumeV2(ex.sets))}</div>
        </div>`;
    }).join('')}`;
}

/* ============================================================
   RENDERER: STATS
   ============================================================ */
function renderStats() {
  const container = document.getElementById('stats-content');
  if (!container) return;

  const workouts = DataStore.getWorkouts();

  if (workouts.length === 0) {
    container.innerHTML = `
      <div class="stats-empty">
        <div class="empty-icon">📊</div>
        <p>Completa al menos un entrenamiento<br>para ver tus estadísticas.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <!-- Volume per week -->
    <div class="stats-card">
      <div class="stats-card-header">
        <div class="stats-card-title">Volumen Semanal</div>
        <div class="stats-card-badge">Últimas 6 semanas</div>
      </div>
      <div class="chart-wrap">
        <canvas id="chart-volume" height="160"></canvas>
      </div>
    </div>

    <!-- Exercise progress -->
    <div class="stats-card">
      <div class="stats-card-header">
        <div class="stats-card-title">PRs Actuales</div>
        <div class="stats-card-badge">Máximos registrados</div>
      </div>
      <div class="pr-list" id="pr-list"></div>
    </div>

    <!-- Frequency -->
    <div class="stats-card">
      <div class="stats-card-header">
        <div class="stats-card-title">Frecuencia</div>
        <div class="stats-card-badge">Últimas 4 semanas</div>
      </div>
      <div class="freq-labels" id="freq-labels"></div>
      <div class="frequency-grid" id="freq-grid"></div>
      <div class="chart-legend">
        <div class="legend-item">
          <div class="legend-dot" style="background:var(--accent)"></div>
          Entrenado
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background:var(--bg-elevated)"></div>
          Descanso
        </div>
      </div>
    </div>

    <!-- Workout count chart -->
    <div class="stats-card">
      <div class="stats-card-header">
        <div class="stats-card-title">Progreso del Ejercicio</div>
        <div class="stats-card-badge">Top lift histórico</div>
      </div>
      <div class="chart-wrap">
        <canvas id="chart-exercise" height="160"></canvas>
      </div>
    </div>`;

  renderVolumeChart(workouts);
  renderPRList();
  renderFrequencyGrid(workouts);
  renderExerciseChart(workouts);
}

function renderVolumeChart(workouts) {
  const canvas = document.getElementById('chart-volume');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 28;
  canvas.height = 160;

  // Build weekly volumes (last 6 weeks)
  const weeks = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - i * 7 - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const vol = workouts
      .filter(w => {
        const d = new Date(w.date);
        return d >= weekStart && d < weekEnd;
      })
      .reduce((sum, w) => sum + (w.totalVolume || 0), 0);

    weeks.push({
      label: `S${6 - i}`,
      vol
    });
  }

  const maxVol = Math.max(...weeks.map(w => w.vol), 1);
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 20, right: 16, bottom: 30, left: 50 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    // Y labels
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px Barlow, sans-serif';
    ctx.textAlign = 'right';
    const val = maxVol * (1 - i / 4);
    ctx.fillText(val >= 1000 ? (val/1000).toFixed(1)+'k' : Math.round(val).toString(), pad.left - 5, y + 4);
  }

  // Bars
  const barW = Math.max(8, (chartW / weeks.length) * 0.55);
  const gap = chartW / weeks.length;

  weeks.forEach((w, i) => {
    const x = pad.left + gap * i + gap / 2 - barW / 2;
    const barH = w.vol > 0 ? Math.max(3, (w.vol / maxVol) * chartH) : 2;
    const y = pad.top + chartH - barH;

    // Bar gradient
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#ff3c3c');
    grad.addColorStop(1, '#ff6b1a');

    ctx.fillStyle = w.vol > 0 ? grad : 'rgba(255,255,255,0.05)';
    const radius = 4;
    roundRect(ctx, x, y, barW, barH, radius);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 10px Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w.label, x + barW / 2, H - 8);
  });
}

function renderExerciseChart(workouts) {
  const canvas = document.getElementById('chart-exercise');
  if (!canvas) return;

  // Find top exercise by frequency
  const freq = {};
  workouts.forEach(w => {
    (w.exercises || []).forEach(ex => {
      freq[ex.name] = (freq[ex.name] || 0) + 1;
    });
  });
  const topExercise = Object.entries(freq).sort((a,b) => b[1]-a[1])[0];
  if (!topExercise) return;

  const exName = topExercise[0];

  // Get max weight per workout session for this exercise
  const dataPoints = [];
  [...workouts].reverse().slice(0, 10).forEach(w => {
    const ex = (w.exercises || []).find(e => e.name.toLowerCase() === exName.toLowerCase());
    if (ex) {
      const maxW = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0));
      if (maxW > 0) {
        dataPoints.push({ label: fmtRelTime(w.date).replace('Hace ',''), val: maxW });
      }
    }
  });

  if (dataPoints.length < 2) return;

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 28;
  canvas.height = 160;

  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 24, right: 16, bottom: 30, left: 50 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const maxVal = Math.max(...dataPoints.map(d => d.val));
  const minVal = Math.min(...dataPoints.map(d => d.val)) * 0.9;
  const range = maxVal - minVal || 1;

  ctx.clearRect(0, 0, W, H);

  // Title
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 11px Barlow Condensed, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(exName.toUpperCase(), pad.left, 14);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = pad.top + (chartH / 3) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const val = maxVal - (range * i / 3);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px Barlow, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(val) + 'kg', pad.left - 5, y + 4);
  }

  // Line
  const points = dataPoints.map((d, i) => ({
    x: pad.left + (i / (dataPoints.length - 1)) * chartW,
    y: pad.top + chartH - ((d.val - minVal) / range) * chartH
  }));

  // Area fill
  const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  areaGrad.addColorStop(0, 'rgba(255,214,0,0.2)');
  areaGrad.addColorStop(1, 'rgba(255,214,0,0.01)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, pad.top + chartH);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length-1].x, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Line stroke
  ctx.beginPath();
  ctx.strokeStyle = '#ffd600';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Dots
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd600';
    ctx.fill();
    ctx.strokeStyle = '#0a0a0c';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function renderPRList() {
  const el = document.getElementById('pr-list');
  if (!el) return;
  const prs = DataStore.getPRs();
  const entries = Object.entries(prs).sort((a,b) => b[1]-a[1]).slice(0, 8);

  if (entries.length === 0) {
    el.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:13px;">Sin PRs registrados aún.</div>`;
    return;
  }

  el.innerHTML = entries.map(([name, weight]) => `
    <div class="pr-list-item">
      <div class="pr-exercise-name">${name.charAt(0).toUpperCase() + name.slice(1)}</div>
      <div class="pr-weight">${weight}kg</div>
    </div>`).join('');
}

function renderFrequencyGrid(workouts) {
  const grid = document.getElementById('freq-grid');
  const labels = document.getElementById('freq-labels');
  if (!grid || !labels) return;

  const dayLabels = ['L','M','X','J','V','S','D'];
  labels.innerHTML = dayLabels.map(d =>
    `<div class="freq-label">${d}</div>`).join('');

  // Last 4 weeks × 7 days = 28 cells
  const cells = [];
  const today = new Date();
  const startDay = new Date(today);
  startDay.setDate(today.getDate() - 27);

  const trainedDays = new Set(
    workouts.map(w => w.date ? w.date.split('T')[0] : null).filter(Boolean)
  );

  for (let i = 0; i < 28; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    const active = trainedDays.has(ds);
    cells.push(`<div class="freq-day ${active ? 'active' : ''}"></div>`);
  }

  grid.innerHTML = cells.join('');
}

function roundRect(ctx, x, y, w, h, r) {
  if (h < r * 2) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ============================================================
   RENDERER: PROFILE
   ============================================================ */
function renderProfile() {
  const container = document.getElementById('profile-content');
  if (!container) return;

  const user = DataStore.getUser();
  const workouts = DataStore.getWorkouts();
  const prs = DataStore.getPRs();
  const totalVolume = workouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
  const level = calcLevel(workouts.length);
  const streak = calcStreak(workouts);
  const prCount = Object.keys(prs).length;

  // Weekly streak row
  const streakHtml = streak.map(d => `
    <div class="streak-day ${d.done ? 'done' : ''}">
      <div class="streak-day-letter">${d.label}</div>
      <div class="streak-day-dot"></div>
    </div>`).join('');

  // Top PRs
  const topPRs = Object.entries(prs).sort((a,b)=>b[1]-a[1]).slice(0, 4);
  const prsHtml = topPRs.length > 0
    ? topPRs.map(([name, weight]) => `
        <div class="pr-list-item">
          <div class="pr-exercise-name">${name.charAt(0).toUpperCase()+name.slice(1)}</div>
          <div class="pr-weight">${weight}kg</div>
        </div>`).join('')
    : `<div style="padding:12px 0;color:var(--text-secondary);font-size:13px;">Sin PRs registrados.</div>`;

  container.innerHTML = `
    <div class="profile-hero">
      <div class="profile-top">
        <div class="profile-avatar" style="background:${user.avatarColor}">${user.initials}</div>
        <div class="profile-info">
          <div class="profile-username">${user.username}</div>
          <div class="profile-level">⚡ ${level.level}</div>
          <div class="profile-bio">${user.bio}</div>
        </div>
      </div>
      <div class="profile-stats-row">
        <div class="profile-stat">
          <div class="profile-stat-value">${workouts.length}</div>
          <div class="profile-stat-label">Sesiones</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-value">${fmtVolume(totalVolume)}</div>
          <div class="profile-stat-label">Volumen total</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-value">${prCount}</div>
          <div class="profile-stat-label">PRs</div>
        </div>
      </div>
    </div>

    <div class="profile-sections">
      <!-- Streak -->
      <div>
        <div class="profile-section-title">🔥 Racha Semanal</div>
        <div class="streak-row">${streakHtml}</div>
      </div>

      <!-- PRs -->
      <div>
        <div class="profile-section-title">👑 Mis PRs</div>
        <div class="pr-list" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:4px 12px;">
          ${prsHtml}
        </div>
      </div>
    </div>`;

  // Update header
  document.getElementById('header-avatar').textContent = user.initials;
  document.getElementById('header-avatar').style.background = user.avatarColor;
  document.getElementById('header-streak-count').textContent =
    streak.filter(d => d.done).length;
}

/* ============================================================
   WORKOUT: FINISH & SAVE
   ============================================================ */

function finishWorkout() {
  if (Session.currentExercise && Session.completedSets.length > 0) {
    Session.closeExercise();
  }
  if (Session.completedExercises.length === 0) {
    showToast('Completa al menos un ejercicio antes de finalizar ✋');
    return;
  }

  // Si estamos en modo planificación, guardar como plantilla y salir
  if (Session.mode === 'plan') {
    updatePlanTemplate();
    showToast('Plantilla guardada correctamente ✓');
    showTrainView('train-home');
    Nav.goto('train');
    renderTrainHome();
    return;
  }

  // Modo normal - guardar workout
  const totals = Session.getTotals();
  const newPRs = updatePRsV2(totals.exercises);

  const workout = {
    id: uid(), name: totals.name, type: totals.type,
    date: new Date().toISOString(), duration: totals.duration,
    exercises: totals.exercises, totalVolume: totals.totalVolume,
    totalSets: totals.totalSets, exerciseCount: totals.exerciseCount,
    seriesTime: totals.seriesTime, restTime: totals.restTime, 
    skippedRestTime: totals.skippedRestTime,
    prs: newPRs,
  };

  DataStore.addWorkout(workout);

  const user = DataStore.getUser();
  DataStore.addPost({
    id: uid(), userId: user.id, username: user.username,
    initials: user.initials, avatarColor: user.avatarColor,
    sessionName: totals.name, type: totals.type,
    totalVolume: totals.totalVolume, totalSets: totals.totalSets,
    duration: totals.duration, exerciseCount: totals.exerciseCount,
    exercises: totals.exercises, prs: newPRs,
    likes: 0, likedBy: [], comments: [],
    createdAt: new Date().toISOString()
  });

  renderSummary(workout);
  showTrainView('train-summary');

  const streak = calcStreak(DataStore.getWorkouts());
  document.getElementById('header-streak-count').textContent =
    streak.filter(d => d.done).length;
}

/* ============================================================
   EXERCISE MODAL
   ============================================================ */
function openAddExerciseModal() {
  const searchInput = document.getElementById('exercise-search');
  const customInput = document.getElementById('exercise-custom');
  searchInput.value = '';
  customInput.value = '';
  renderExerciseSuggestions('');
  Modal.open('modal-add-exercise');
  setTimeout(() => searchInput.focus(), 100);
}

function renderExerciseSuggestions(query) {
  const list = document.getElementById('exercise-suggestions');
  const filtered = query
    ? EXERCISE_DB.filter(e =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.muscle.toLowerCase().includes(query.toLowerCase()))
    : EXERCISE_DB.slice(0, 12);

  list.innerHTML = filtered.map(e => `
    <button class="exercise-suggestion-item" data-name="${e.name}" data-muscle="${e.muscle}">
      ${e.name}
      <span class="suggestion-muscle">${e.muscle}</span>
    </button>`).join('');

  list.querySelectorAll('.exercise-suggestion-item').forEach(btn => {
    btn.addEventListener('click', () => {
      startExercise(btn.dataset.name, btn.dataset.muscle);
      Modal.close('modal-add-exercise');
    });
  });
}

function confirmAddExercise() {
  const custom = document.getElementById('exercise-custom').value.trim();
  if (custom) {
    startExercise(custom, 'General');
    Modal.close('modal-add-exercise');
  } else {
    showToast('Selecciona un ejercicio o escribe uno ✋');
  }
}

function startExercise(name, muscle) {
  if (Session.currentExercise && Session.completedSets.length > 0) {
    Session.stopSetTimer();
    Session.stopRestTimer();
    Session.closeExercise();
    renderCompletedExercises();
  }
  
  // Resetear configuración de equipo para nuevo ejercicio
  Session.equipmentType = EQUIPMENT_TYPES.MACHINE;
  Session.barbellType = null;
  Session.barbellWeight = 0;
  
  Session.beginExercise(name, muscle || 'General');
  renderExercisePreviewV2(name, muscle || 'General');
  renderCompletedSetsV2();

  setTimeout(() => {
    const panel = document.getElementById('active-exercise-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

/* ============================================================
   EXERCISE DETAIL MODAL
   ============================================================ */
function openExerciseDetailModal(name, muscle) {
  const FULL_INFO = {
    'Press Banca': {
      steps: ['Agarra la barra con agarre ligeramente más ancho que el hombro.','Desciende la barra al pecho inferior de forma controlada (2-3s).','Empuja explosivamente hasta extensión sin bloquear los codos.','Mantén los pies en el suelo y la espalda baja en contacto con el banco.'],
      tips: 'Retrae las escápulas antes de descolgar la barra. La barra debe tocar o casi tocar el pecho en cada rep.'
    },
    'Sentadilla': {
      steps: ['Barra en trapecio alto o bajo, pies a anchura de hombros.','Inicia el movimiento sacando las caderas hacia atrás.','Baja hasta paralelo o por debajo — rodillas alineadas con los pies.','Sube empujando el suelo, manteniendo el torso erguido.'],
      tips: 'Braceado fuerte antes de bajar. Respira profundo y cierra el diafragma.'
    },
    'default': {
      steps: ['Posición inicial: cuerpo estable, core activado.','Ejecuta el movimiento en el rango completo.','Controla la fase excéntrica (bajada).','Explota en la fase concéntrica (subida).'],
      tips: 'Prioriza la técnica sobre el peso. La progresión correcta evita lesiones.'
    }
  };
  const info = FULL_INFO[name] || FULL_INFO['default'];
  document.getElementById('detail-modal-title').textContent = name;
  document.getElementById('detail-modal-content').innerHTML = `
    <div style="margin-bottom:12px;"><span class="muscle-chip">💪 ${muscle}</span></div>
    <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:8px;">EJECUCIÓN</div>
    ${info.steps.map((s, i) => `
      <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="width:22px;height:22px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;">${i+1}</div>
        <div style="font-size:13px;color:var(--text-primary);line-height:1.5;">${s}</div>
      </div>`).join('')}
    <div style="margin-top:14px;background:rgba(255,214,0,0.06);border:1px solid rgba(255,214,0,0.2);border-radius:var(--radius-sm);padding:12px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--pr-color);margin-bottom:5px;">💡 TIP PRO</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">${info.tips}</div>
    </div>`;
  Modal.open('modal-workout-detail');
}

/* ============================================================
   TRAIN VIEWS
   ============================================================ */
function showTrainView(viewId) {
  document.querySelectorAll('.train-view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(viewId);
  if (el) el.classList.add('active');
}

/* ============================================================
   INICIALIZACIÓN Y BINDINGS ADICIONALES
   ============================================================ */

function initTrainingImprovements() {
  // Botón de modo de entrenamiento
  const btnStartWorkout = document.getElementById('btn-start-workout');
  if (btnStartWorkout) {
    btnStartWorkout.removeEventListener('click', handleWorkoutModeSelection);
    btnStartWorkout.addEventListener('click', handleWorkoutModeSelection);
  }
  
  // Pausar/reanudar serie
  const btnPauseSet = document.getElementById('btn-pause-set');
  if (btnPauseSet) {
    btnPauseSet.addEventListener('click', toggleSetPause);
  }
  
  // Pausar/reanudar descanso
  const btnPauseRest = document.getElementById('btn-pause-rest');
  if (btnPauseRest) {
    btnPauseRest.addEventListener('click', toggleRestPause);
  }
  
  // Turno de compañero
  const btnCompanionTurn = document.getElementById('btn-companion-turn');
  if (btnCompanionTurn) {
    btnCompanionTurn.addEventListener('click', toggleCompanionTurn);
  }
  
  // Guardar como plantilla
  const btnSaveTemplate = document.getElementById('btn-save-template');
  if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener('click', handleSaveAsTemplate);
  }
  
  // Ver plantillas
  const btnViewTemplates = document.getElementById('btn-view-templates');
  if (btnViewTemplates) {
    btnViewTemplates.addEventListener('click', () => {
      renderTemplatesList();
      Modal.open('modal-templates');
    });
  }
  
  // Peso personalizado de barra
  const barbellWeightInput = document.getElementById('barbell-custom-weight');
  if (barbellWeightInput) {
    barbellWeightInput.addEventListener('input', handleCustomBarbellWeight);
  }
  
  // Confirmar equipo
  const btnConfirmEquipment = document.getElementById('btn-confirm-equipment');
  if (btnConfirmEquipment) {
    btnConfirmEquipment.addEventListener('click', confirmEquipmentType);
  }
  
  // Reemplazar handlers existentes
  const btnFinishSet = document.getElementById('btn-finish-set');
  if (btnFinishSet) {
    //btnFinishSet.removeEventListener('click', handleFinishSetV2);
    btnFinishSet.addEventListener('click', handleFinishSetV2);
  }
  
  const btnSkipRest = document.getElementById('btn-skip-rest');
  if (btnSkipRest) {
    //btnSkipRest.removeEventListener('click', handleSkipRest);
    btnSkipRest.addEventListener('click', handleSkipRestV2);
  }
  
  const btnStartSet = document.getElementById('btn-start-set');
  if (btnStartSet) {
    //btnStartSet.removeEventListener('click', beginNextSet);
    btnStartSet.addEventListener('click', () => {
      Session.startWorkoutTimer();
      beginNextSetV2();
    });
  }
}

/* ============================================================
   INIT & EVENT BINDINGS
   ============================================================ */
function init() {
  seedMockData();

  // Splash → App
  setTimeout(() => {
    const app = document.getElementById('app');
    app.classList.remove('hidden');
    Nav.goto('feed');
  }, 2200);

  // Nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => Nav.goto(btn.dataset.section));
  });

  // ---- TRAIN ----
  // 1. Home → Config
  document.getElementById('btn-start-workout').addEventListener('click', () => {
    handleWorkoutModeSelection(); // Esto abre el modal de selección
  });

  // 2. Config back
  document.getElementById('btn-back-config').addEventListener('click', () => {
    showTrainView('train-home');
  });

  // 3. Config → Session
  document.getElementById('btn-config-continue').addEventListener('click', () => {
    const name = document.getElementById('config-name').value.trim() || 'Entrenamiento';
    Session.workoutName = name;
    
    // Aplicar modo compañero
    applyCompanionSettings();
    
    // Mostrar botón de turno si está activo
    const btnCompanionTurn = document.getElementById('btn-companion-turn');
    if (btnCompanionTurn) {
      if (Session.companionMode) {
        btnCompanionTurn.classList.remove('hidden');
        btnCompanionTurn.textContent = `⏸ Turno de ${Session.companionName || 'compañero'}`;
      } else {
        btnCompanionTurn.classList.add('hidden');
      }
    }
    
    document.getElementById('session-name-display').textContent = name;
    document.getElementById('active-exercise-panel').classList.add('hidden');
    document.getElementById('completed-exercises-list').innerHTML = '';
    showTrainView('train-session');
    openAddExerciseModal();
  });

  const btnSaveTemplateConfig = document.getElementById('btn-save-template-config');
  if (btnSaveTemplateConfig) {
    btnSaveTemplateConfig.addEventListener('click', handleSaveTemplateFromConfig);
  }

  // 4. Session back
  document.getElementById('btn-back-session').addEventListener('click', () => {
    if (confirm('¿Cancelar el entrenamiento? Se perderán los datos.')) {
      Session.reset();
      showTrainView('train-home');
      renderTrainHome();
    }
  });

  // 5. Finish set
  document.getElementById('btn-finish-set').addEventListener('click', handleFinishSetV2);

  // 6. Skip rest
  document.getElementById('btn-skip-rest').addEventListener('click', handleSkipRestV2);

  // 7. Rest weight controls
  document.getElementById('rest-weight-minus').addEventListener('click', () => {
    const val = Math.max(0, (parseFloat(document.getElementById('rest-weight-val').textContent) || 0) - 2.5);
    document.getElementById('rest-weight-val').textContent = val;
    Session.nextWeight = val;
  });
  document.getElementById('rest-weight-plus').addEventListener('click', () => {
    const val = (parseFloat(document.getElementById('rest-weight-val').textContent) || 0) + 2.5;
    document.getElementById('rest-weight-val').textContent = val;
    Session.nextWeight = val;
  });

  // 8. Finish exercise
  document.getElementById('btn-finish-exercise').addEventListener('click', handleFinishExercise);

  // 9. Add exercise (mid-session)
  document.getElementById('btn-add-exercise').addEventListener('click', () => {
    if (Session.currentExercise && Session.completedSets.length === 0) {
      showToast('Completa al menos una serie del ejercicio actual ✋');
      return;
    }
    openAddExerciseModal();
  });

  // 10. Finish workout
  document.getElementById('btn-finish-workout').addEventListener('click', finishWorkout);

  // 11. Start first set from preview
  document.getElementById('btn-start-set').addEventListener('click', () => {
    Session.startWorkoutTimer();
    beginNextSetV2();
  });

  // 12. See full exercise explanation
  document.getElementById('btn-see-full').addEventListener('click', () => {
    openExerciseDetailModal(
      Session.currentExercise?.name   || '',
      Session.currentExercise?.muscle || ''
    );
  });

  // 13. Summary → Feed
  document.getElementById('btn-to-feed').addEventListener('click', () => {
    showTrainView('train-home');
    Nav.goto('feed');
  });

  // ── MODALS ──
  document.getElementById('modal-close-exercise').addEventListener('click', () =>
    Modal.close('modal-add-exercise'));
  document.getElementById('exercise-search').addEventListener('input', (e) =>
    renderExerciseSuggestions(e.target.value));
  document.getElementById('btn-confirm-exercise').addEventListener('click', confirmAddExercise);
  document.getElementById('modal-close-detail').addEventListener('click', () =>
    Modal.close('modal-workout-detail'));
  document.getElementById('modal-close-comments').addEventListener('click', () =>
    Modal.close('modal-comments'));
  document.getElementById('btn-send-comment').addEventListener('click', handleSendComment);
  document.getElementById('comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendComment();
  });

  // Backdrop clicks
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      document.body.style.overflow = '';
    });
  });

  // Header avatar → profile
  document.getElementById('header-avatar').addEventListener('click', () => Nav.goto('profile'));

  // Update header avatar on load
  const user = DataStore.getUser();
  const avatarEl = document.getElementById('header-avatar');
  avatarEl.textContent = user.initials;
  avatarEl.style.background = user.avatarColor;

  initTrainingImprovements();
}

// Boot
document.addEventListener('DOMContentLoaded', init);
