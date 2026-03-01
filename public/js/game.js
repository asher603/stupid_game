// ═══════════════════════════════════════════════════════════
//  SpongeBob Run! — 3D Chase Game with Levels
//  Three.js third-person survival game
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─────────────────────────────────────
  //  CONSTANTS
  // ─────────────────────────────────────

  const WORLD_SIZE  = 120;
  const HALF_WORLD  = WORLD_SIZE / 2;

  const PLAYER_SPEED  = 12;
  const SPRINT_SPEED  = 20;
  const JUMP_FORCE    = 14;
  const GRAVITY       = 32;
  const STAMINA_MAX   = 100;
  const STAMINA_DRAIN = 30;
  const STAMINA_REGEN = 20;

  const PATRICK_BASE_SPEED     = 4;
  const MR_KRABS_BASE_SPEED   = 6;
  const ENEMY_CATCH_DIST     = 0.8;
  const ENEMY_SPAWN_INTERVAL = 12;
  const MAX_ENEMIES          = 15;

  const KRABS_JUMP_FORCE = 12;
  const KRABS_JUMP_PAUSE = 0.15;
  const KRABS_COIN_PAUSE = 1.0;
  const KRABS_GRAVITY    = 32;

  const COIN_SCORE      = 50;
  const COIN_THROW_DIST = 3;
  const COIN_RESPAWN_MS = 5000;

  const CAMERA_HEIGHT_DEFAULT = 10;
  const CAMERA_HEIGHT_MIN     = 3;
  const CAMERA_HEIGHT_MAX     = 30;
  const CAMERA_HEIGHT_SPEED   = 12;
  const CAMERA_DIST           = 16;
  const CAMERA_LERP           = 4;

  const SHOUT_RANGE    = 6.0;
  const SHOUT_COOLDOWN = 2.0;

  const LOW_BLOCK_HEIGHT = 1.2;   // Height of jumpable blocks

  // Player boost per level (stacks)
  const PLAYER_SPEED_BOOST  = 0.08;   // +8% speed per level
  const PLAYER_JUMP_BOOST   = 0.06;   // +6% jump per level

  // ─────────────────────────────────────
  //  LEVEL DEFINITIONS
  // ─────────────────────────────────────

  const LEVEL_ICONS = ['🌃', '🪼', '🪨', '🗑️', '👻'];

  const LEVELS = [
    {
      name: 'Bikini Bottom — Night',
      scoreTarget: 500,
      initialEnemies: 2,
      maxEnemies: 8,
      coinCount: 12,
      buildingCount: 20,
      treeCount: 25,
      lowBlockCount: 8,
      spawnInterval: 14,
      sky: 0x1a1a2e,
      fog: 0x1a1a2e,
      fogDensity: 0.012,
      groundColor: 0x1a3a1a,
      gridColor1: 0x224422,
      gridColor2: 0x1a2a1a,
      buildingColors: [0x334455, 0x3a3a4e, 0x2b3555, 0x443344, 0x2a4a4a],
      treeLeafColor: 0x226633,
      wallColor: 0x2244cc,
      lowBlockColor: 0x445566,
      lowBlockGlow: 0x00aaff,
      ambientColor: 0x334466,
      ambientIntensity: 0.6,
      dirColor: 0xffeedd,
      accentLight1: 0x0066ff,
      accentLight2: 0xff2244,
      lampColor: 0xffee88,
      starCount: 800,
    },
    {
      name: 'Jellyfish Fields',
      scoreTarget: 1200,
      initialEnemies: 3,
      maxEnemies: 10,
      coinCount: 15,
      buildingCount: 15,
      treeCount: 40,
      lowBlockCount: 12,
      spawnInterval: 11,
      sky: 0x0d1b2a,
      fog: 0x0d1b2a,
      fogDensity: 0.010,
      groundColor: 0x1a4020,
      gridColor1: 0x2a5533,
      gridColor2: 0x1a3a1a,
      buildingColors: [0x3a5544, 0x4a6644, 0x2a4a3a, 0x3a5a3a, 0x446644],
      treeLeafColor: 0x33aa44,
      wallColor: 0x228844,
      lowBlockColor: 0x557744,
      lowBlockGlow: 0x44ff88,
      ambientColor: 0x335544,
      ambientIntensity: 0.7,
      dirColor: 0xddeeff,
      accentLight1: 0x22ff88,
      accentLight2: 0xffaa22,
      lampColor: 0xaaffaa,
      starCount: 600,
    },
    {
      name: 'Rock Bottom',
      scoreTarget: 2000,
      initialEnemies: 4,
      maxEnemies: 12,
      coinCount: 18,
      buildingCount: 30,
      treeCount: 10,
      lowBlockCount: 15,
      spawnInterval: 9,
      sky: 0x0a0a14,
      fog: 0x0a0a14,
      fogDensity: 0.018,
      groundColor: 0x121225,
      gridColor1: 0x1a1a33,
      gridColor2: 0x0f0f22,
      buildingColors: [0x222244, 0x2a2a55, 0x1a1a3a, 0x333366, 0x2a2a4e],
      treeLeafColor: 0x334466,
      wallColor: 0x3333aa,
      lowBlockColor: 0x333355,
      lowBlockGlow: 0x6644ff,
      ambientColor: 0x222244,
      ambientIntensity: 0.4,
      dirColor: 0xaabbff,
      accentLight1: 0x4422ff,
      accentLight2: 0xff2266,
      lampColor: 0x8888ff,
      starCount: 1200,
    },
    {
      name: 'The Dump',
      scoreTarget: 3000,
      initialEnemies: 5,
      maxEnemies: 14,
      coinCount: 20,
      buildingCount: 28,
      treeCount: 15,
      lowBlockCount: 18,
      spawnInterval: 8,
      sky: 0x1a1008,
      fog: 0x1a1008,
      fogDensity: 0.014,
      groundColor: 0x2a2010,
      gridColor1: 0x3a3020,
      gridColor2: 0x2a2015,
      buildingColors: [0x554433, 0x665544, 0x443322, 0x554422, 0x665533],
      treeLeafColor: 0x556633,
      wallColor: 0x886633,
      lowBlockColor: 0x665544,
      lowBlockGlow: 0xff8800,
      ambientColor: 0x443322,
      ambientIntensity: 0.5,
      dirColor: 0xffddaa,
      accentLight1: 0xff6600,
      accentLight2: 0xaa3300,
      lampColor: 0xffaa44,
      starCount: 400,
    },
    {
      name: 'Flying Dutchman\'s Ship',
      scoreTarget: 5000,
      initialEnemies: 6,
      maxEnemies: 15,
      coinCount: 22,
      buildingCount: 22,
      treeCount: 5,
      lowBlockCount: 20,
      spawnInterval: 7,
      sky: 0x0a1a0a,
      fog: 0x0a1a0a,
      fogDensity: 0.016,
      groundColor: 0x0f1f0f,
      gridColor1: 0x1a2a1a,
      gridColor2: 0x0a1a0a,
      buildingColors: [0x1a3a1a, 0x224422, 0x2a4a2a, 0x1a331a, 0x335533],
      treeLeafColor: 0x115511,
      wallColor: 0x33aa33,
      lowBlockColor: 0x225522,
      lowBlockGlow: 0x00ff44,
      ambientColor: 0x113311,
      ambientIntensity: 0.3,
      dirColor: 0x88ff88,
      accentLight1: 0x00ff44,
      accentLight2: 0x44ff00,
      lampColor: 0x44ff66,
      starCount: 1000,
    },
  ];

  // ─────────────────────────────────────
  //  STATE
  // ─────────────────────────────────────

  // Progress (saved in localStorage)
  let unlockedLevels = loadProgress();

  function loadProgress() {
    try {
      const data = JSON.parse(localStorage.getItem('spongebob_run_progress'));
      if (data && Array.isArray(data.completed)) return { completed: data.completed };
    } catch (e) {}
    return { completed: [] };
  }

  function saveProgress() {
    try {
      localStorage.setItem('spongebob_run_progress', JSON.stringify(unlockedLevels));
    } catch (e) {}
  }

  function isLevelUnlocked(idx) {
    if (idx === 0) return true;
    // A level is unlocked if ALL previous levels have been completed
    for (let i = 0; i < idx; i++) {
      if (!unlockedLevels.completed.includes(i)) return false;
    }
    return true;
  }

  function markLevelCompleted(idx) {
    if (!unlockedLevels.completed.includes(idx)) {
      unlockedLevels.completed.push(idx);
      saveProgress();
    }
  }

  // Audio
  let bgm, jumpSound, landSound, stepSound, throwCoinSound, grabCoinSound;
  let patrickShouts = [];
  let krabsShouts   = [];
  let lastShoutTime = -2.0;

  let currentVoiceLine = null;

  // Three.js
  let scene, camera, renderer, clock;
  let cameraHeight = CAMERA_HEIGHT_DEFAULT;

  // Game
  let gameRunning   = false;
  let gameTime      = 0;
  let score         = 0;
  let totalScore    = 0;   // Carries across levels
  let stamina       = STAMINA_MAX;
  let nextEnemySpawn = ENEMY_SPAWN_INTERVAL;
  let difficultyMul = 1;
  let messageTimer  = 0;
  let currentLevel  = 0;
  let levelComplete = false;

  // Player
  let player         = null;
  let playerVelY     = 0;
  let playerOnGround = true;
  let playerMesh     = null;
  let playerMixer    = null;
  let currentAction  = null;
  let idleAction     = null;
  let runAction      = null;
  let jumpStartAction, jumpLiftAction, jumpApexAction;
  let wasOnGround    = true;
  let playerCoins    = 0;

  // Models
  let patrickModel      = null;
  let patrickAnimations = [];
  let krabsModel        = null;
  let krabsAnimations   = [];

  // World objects
  let enemies   = [];
  let coins     = [];
  let buildings = [];
  let trees     = [];
  let lowBlocks = [];   // Jumpable platforms
  let decorations = []; // Animated decorative elements (no collision)

  // Input
  const keys = {};

  // ─────────────────────────────────────
  //  DOM ELEMENTS
  // ─────────────────────────────────────

  const hudEl          = document.getElementById('hud');
  const hudTime        = document.getElementById('hud-time');
  const hudScore       = document.getElementById('hud-score');
  const hudEnemies     = document.getElementById('hud-enemies');
  const hudCoins       = document.getElementById('hud-coins');
  const hudMessage     = document.getElementById('hud-message');
  const hudLevel       = document.getElementById('hud-level');
  const hudLevelName   = document.getElementById('hud-level-name');
  const hudTarget      = document.getElementById('hud-target');
  const staminaFill    = document.getElementById('stamina-fill');
  const overlay        = document.getElementById('overlay');
  const overlayContent = document.getElementById('overlay-content');
  const overlaySub     = document.getElementById('overlay-sub');
  const finalScoreEl   = document.getElementById('final-score');
  const finalScoreVal  = document.getElementById('final-score-value');
  const startBtn       = document.getElementById('btn-start');
  const howToPlayBtn   = document.getElementById('btn-how-to-play');
  const htpScreen      = document.getElementById('how-to-play-screen');
  const htpBackBtn     = document.getElementById('btn-htp-back');
  const minimapCanvas  = document.getElementById('minimap');
  const minimapCtx     = minimapCanvas.getContext('2d');

  // Level select
  const levelSelectScreen = document.getElementById('level-select-screen');
  const levelSelectGrid   = document.getElementById('level-select-grid');
  const lsBackBtn         = document.getElementById('btn-ls-back');

  // Level bar
  const levelBar       = document.getElementById('level-bar');
  const levelProgressFill = document.getElementById('level-progress-fill');

  // ═══════════════════════════════════════════════════════════
  //  INIT THREE.JS
  // ═══════════════════════════════════════════════════════════

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.012);

    camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
    camera.position.set(0, cameraHeight, CAMERA_DIST);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    clock = new THREE.Clock();

    window.addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    jumpSound = new Audio('sounds/jump.mp3');
    landSound = new Audio('sounds/player_landing.mp3');
    grabCoinSound = new Audio('sounds/grab_coin.mp3');
    throwCoinSound = new Audio('sounds/take_this_coin.mp3');
    throwCoinSound.volume = 0.8;

    stepSound = new Audio('sounds/player_steps.mp3');
    stepSound.loop = true;
    stepSound.volume = 0.6;

    ['patrick_you_fat.mp3', 'get_away_from_me.mp3', 'you_smell_like.mp3', 'if_i_had.mp3'].forEach(f => {
      const a = new Audio(`sounds/${f}`);
      a.volume = 0.8;
      patrickShouts.push(a);
    });

    
    ['i_hate_your_resturant.mp3', 'if_you_get_any_closer.mp3', 'your_eyes_look_like_pipes.mp3'].forEach(f => {
      const a = new Audio(`sounds/${f}`);
      a.volume = 0.8;
      krabsShouts.push(a);
     });
  }

  // ═══════════════════════════════════════════════════════════
  //  BUILD WORLD  (level-aware)
  // ═══════════════════════════════════════════════════════════

  function getLvl() { return LEVELS[currentLevel] || LEVELS[0]; }

  function addLights(lvl) {
    scene.add(new THREE.AmbientLight(lvl.ambientColor, lvl.ambientIntensity));

    const dl = new THREE.DirectionalLight(lvl.dirColor, 0.8);
    dl.position.set(30, 50, 20);
    dl.castShadow = true;
    dl.shadow.mapSize.width = 2048;
    dl.shadow.mapSize.height = 2048;
    dl.shadow.camera.near   = 0.5;
    dl.shadow.camera.far    = 150;
    dl.shadow.camera.left   = -60;
    dl.shadow.camera.right  = 60;
    dl.shadow.camera.top    = 60;
    dl.shadow.camera.bottom = -60;
    scene.add(dl);

    const bl = new THREE.PointLight(lvl.accentLight1, 0.4, 60);
    bl.position.set(-20, 8, -20);
    scene.add(bl);

    const rl = new THREE.PointLight(lvl.accentLight2, 0.3, 60);
    rl.position.set(20, 8, 20);
    scene.add(rl);
  }

  function buildWorld() {
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    buildings = [];
    trees = [];
    lowBlocks = [];
    decorations = [];

    const lvl = getLvl();

    scene.background = new THREE.Color(lvl.sky);
    scene.fog = new THREE.FogExp2(lvl.fog, lvl.fogDensity);

    addLights(lvl);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 40, 40),
      new THREE.MeshStandardMaterial({ color: lvl.groundColor, roughness: 0.9, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(WORLD_SIZE, 40, lvl.gridColor1, lvl.gridColor2);
    grid.position.y = 0.01;
    scene.add(grid);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: lvl.wallColor, transparent: true, opacity: 0.15, roughness: 0.5 });
    const wallH = 8;
    [
      { pos: [0, wallH / 2, -HALF_WORLD], rot: [0, 0, 0] },
      { pos: [0, wallH / 2,  HALF_WORLD], rot: [0, 0, 0] },
      { pos: [-HALF_WORLD, wallH / 2, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [ HALF_WORLD, wallH / 2, 0], rot: [0, Math.PI / 2, 0] },
    ].forEach(s => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(WORLD_SIZE, wallH, 0.5), wallMat);
      wall.position.set(...s.pos);
      wall.rotation.set(...s.rot);
      scene.add(wall);
    });

    // Buildings (tall — block everyone)
    for (let i = 0; i < lvl.buildingCount; i++) {
      const w = 3 + Math.random() * 5;
      const h = 3 + Math.random() * 10;
      const d = 3 + Math.random() * 5;
      const x = (Math.random() - 0.5) * (WORLD_SIZE - 16);
      const z = (Math.random() - 0.5) * (WORLD_SIZE - 16);
      if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: lvl.buildingColors[i % lvl.buildingColors.length], roughness: 0.7, metalness: 0.2 })
      );
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      buildings.push({ mesh, x, z, hw: w / 2 + 0.5, hd: d / 2 + 0.5 });

      if (Math.random() > 0.5) {
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.1, 0.15, d + 0.1),
          new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? lvl.lowBlockGlow : lvl.accentLight2, transparent: true, opacity: 0.4 })
        );
        edge.position.set(x, h + 0.08, z);
        scene.add(edge);
      }
    }

    // Low Blocks (jumpable platforms)
    for (let i = 0; i < lvl.lowBlockCount; i++) {
      const w = 2 + Math.random() * 3;
      const d = 2 + Math.random() * 3;
      const x = (Math.random() - 0.5) * (WORLD_SIZE - 14);
      const z = (Math.random() - 0.5) * (WORLD_SIZE - 14);
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

      // Don't overlap buildings
      let overlap = false;
      for (const b of buildings) {
        if (Math.abs(x - b.x) < b.hw + w / 2 && Math.abs(z - b.z) < b.hd + d / 2) { overlap = true; break; }
      }
      if (overlap) continue;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, LOW_BLOCK_HEIGHT, d),
        new THREE.MeshStandardMaterial({ color: lvl.lowBlockColor, roughness: 0.6, metalness: 0.3 })
      );
      mesh.position.set(x, LOW_BLOCK_HEIGHT / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      // Glow edge on top
      const edgeGeo = new THREE.BoxGeometry(w + 0.05, 0.06, d + 0.05);
      const edgeMat = new THREE.MeshBasicMaterial({ color: lvl.lowBlockGlow, transparent: true, opacity: 0.35 });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(x, LOW_BLOCK_HEIGHT + 0.03, z);
      scene.add(edge);

      lowBlocks.push({ mesh, x, z, hw: w / 2, hd: d / 2, h: LOW_BLOCK_HEIGHT });
    }

    // Trees
    for (let i = 0; i < lvl.treeCount; i++) {
      const x = (Math.random() - 0.5) * (WORLD_SIZE - 10);
      const z = (Math.random() - 0.5) * (WORLD_SIZE - 10);
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

      let ok = true;
      for (const b of buildings) {
        if (Math.abs(x - b.x) < b.hw + 1 && Math.abs(z - b.z) < b.hd + 1) { ok = false; break; }
      }
      for (const lb of lowBlocks) {
        if (Math.abs(x - lb.x) < lb.hw + 1 && Math.abs(z - lb.z) < lb.hd + 1) { ok = false; break; }
      }
      if (!ok) continue;

      const trunkH = 1 + Math.random() * 0.5;
      const leafH  = 2 + Math.random() * 2;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, trunkH, 6),
        new THREE.MeshStandardMaterial({ color: 0x553322, roughness: 0.9 })
      );
      trunk.position.set(x, trunkH / 2, z);
      trunk.castShadow = true;
      scene.add(trunk);

      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(1.2 + Math.random(), leafH, 7),
        new THREE.MeshStandardMaterial({ color: lvl.treeLeafColor, roughness: 0.8 })
      );
      leaf.position.set(x, trunkH + leafH / 2, z);
      leaf.castShadow = true;
      scene.add(leaf);

      trees.push({ x, z, r: 1.0 });
    }

    // Street lamps
    for (let i = 0; i < 12; i++) {
      const angle  = (i / 12) * Math.PI * 2;
      const radius = 25 + Math.random() * 15;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 5, 4),
        new THREE.MeshStandardMaterial({ color: 0x666666 })
      );
      pole.position.set(x, 2.5, z);
      scene.add(pole);

      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: lvl.lampColor })
      );
      lamp.position.set(x, 5.2, z);
      scene.add(lamp);

      const pl = new THREE.PointLight(lvl.lampColor, 0.5, 15);
      pl.position.set(x, 5, z);
      scene.add(pl);
    }

    // Stars
    const sv = new Float32Array(lvl.starCount * 3);
    for (let i = 0; i < lvl.starCount; i++) {
      sv[i * 3]     = (Math.random() - 0.5) * 250;
      sv[i * 3 + 1] = 30 + Math.random() * 80;
      sv[i * 3 + 2] = (Math.random() - 0.5) * 250;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sv, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.6 })));

    // Add level-specific decorations
    addLevelDecorations(lvl);
  }

  // ═══════════════════════════════════════════════════════════
  //  LEVEL DECORATIONS  (purely visual — no collision)
  // ═══════════════════════════════════════════════════════════

  function addLevelDecorations(lvl) {
    // ── Building windows (all levels) ──
    for (const b of buildings) {
      const mesh = b.mesh;
      const bw = (b.hw - 0.5) * 2;
      const bh = mesh.geometry.parameters.height;
      const bd = (b.hd - 0.5) * 2;
      const winColor = lvl.lampColor;
      const winMat = new THREE.MeshBasicMaterial({ color: winColor, transparent: true, opacity: 0.25 + Math.random() * 0.35 });
      const winGeo = new THREE.PlaneGeometry(0.5, 0.7);

      const rows = Math.floor(bh / 2);
      const cols = Math.max(1, Math.floor(bw / 2));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.6) continue;
          const wx = b.x - bw / 2 + 0.8 + c * 1.8 + Math.random() * 0.3;
          const wy = 1.5 + r * 2.2;
          // Front face
          const win = new THREE.Mesh(winGeo, winMat.clone());
          win.material.opacity = 0.15 + Math.random() * 0.4;
          win.position.set(wx, wy, b.z + bd / 2 + 0.26);
          scene.add(win);
          // Back face
          const win2 = win.clone();
          win2.position.z = b.z - bd / 2 - 0.26;
          win2.rotation.y = Math.PI;
          scene.add(win2);
        }
      }
    }

    // ── Ground scatter — small rocks/pebbles (all levels) ──
    const rockMat = new THREE.MeshStandardMaterial({ color: lvl.groundColor, roughness: 1.0, metalness: 0 });
    for (let i = 0; i < 60; i++) {
      const rx = (Math.random() - 0.5) * (WORLD_SIZE - 6);
      const rz = (Math.random() - 0.5) * (WORLD_SIZE - 6);
      const rs = 0.1 + Math.random() * 0.25;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rs, 0),
        rockMat
      );
      rock.position.set(rx, rs * 0.4, rz);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      scene.add(rock);
    }

    // ── Level-specific decorations ──
    switch (currentLevel) {

      // ════════ LEVEL 0: Bikini Bottom Night ════════
      case 0: {
        // Floating bubbles
        for (let i = 0; i < 40; i++) {
          const size = 0.1 + Math.random() * 0.3;
          const bubble = new THREE.Mesh(
            new THREE.SphereGeometry(size, 8, 8),
            new THREE.MeshPhysicalMaterial({
              color: 0x88ccff, transparent: true, opacity: 0.15,
              roughness: 0.1, metalness: 0.1, clearcoat: 1.0
            })
          );
          const bx = (Math.random() - 0.5) * WORLD_SIZE;
          const by = 1 + Math.random() * 15;
          const bz = (Math.random() - 0.5) * WORLD_SIZE;
          bubble.position.set(bx, by, bz);
          scene.add(bubble);
          decorations.push({ mesh: bubble, type: 'bubble', baseY: by, speed: 0.5 + Math.random() * 1.0, phase: Math.random() * Math.PI * 2 });
        }

        // Coral formations
        const coralColors = [0xff4466, 0xff6688, 0xcc3355, 0xff8844, 0xaa2255];
        for (let i = 0; i < 25; i++) {
          const cx = (Math.random() - 0.5) * (WORLD_SIZE - 14);
          const cz = (Math.random() - 0.5) * (WORLD_SIZE - 14);
          if (Math.abs(cx) < 6 && Math.abs(cz) < 6) continue;
          const coral = new THREE.Group();
          const branches = 2 + Math.floor(Math.random() * 3);
          const cColor = coralColors[Math.floor(Math.random() * coralColors.length)];
          for (let b = 0; b < branches; b++) {
            const h = 0.5 + Math.random() * 1.5;
            const branch = new THREE.Mesh(
              new THREE.CylinderGeometry(0.05, 0.15 + Math.random() * 0.1, h, 5),
              new THREE.MeshStandardMaterial({ color: cColor, roughness: 0.6, emissive: cColor, emissiveIntensity: 0.1 })
            );
            branch.position.set((Math.random() - 0.5) * 0.4, h / 2, (Math.random() - 0.5) * 0.4);
            branch.rotation.z = (Math.random() - 0.5) * 0.4;
            coral.add(branch);
            // Coral tip
            const tip = new THREE.Mesh(
              new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 6, 6),
              new THREE.MeshStandardMaterial({ color: 0xffaacc, emissive: 0xffaacc, emissiveIntensity: 0.2 })
            );
            tip.position.set(branch.position.x, h, branch.position.z);
            coral.add(tip);
          }
          coral.position.set(cx, 0, cz);
          scene.add(coral);
        }

        // Seaweed (animated swaying)
        for (let i = 0; i < 30; i++) {
          const sx = (Math.random() - 0.5) * (WORLD_SIZE - 8);
          const sz = (Math.random() - 0.5) * (WORLD_SIZE - 8);
          if (Math.abs(sx) < 5 && Math.abs(sz) < 5) continue;
          const h = 1 + Math.random() * 2;
          const seaweed = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.06, h, 4),
            new THREE.MeshStandardMaterial({ color: 0x22aa44, roughness: 0.8, emissive: 0x115522, emissiveIntensity: 0.15 })
          );
          seaweed.position.set(sx, h / 2, sz);
          scene.add(seaweed);
          decorations.push({ mesh: seaweed, type: 'sway', baseX: sx, phase: Math.random() * Math.PI * 2 });
        }

        // Neon signs on some buildings
        for (let i = 0; i < Math.min(5, buildings.length); i++) {
          const b = buildings[Math.floor(Math.random() * buildings.length)];
          const bh = b.mesh.geometry.parameters.height;
          const signColors = [0x00ffff, 0xff00ff, 0xffff00, 0xff4488];
          const signMat = new THREE.MeshBasicMaterial({
            color: signColors[Math.floor(Math.random() * signColors.length)],
            transparent: true, opacity: 0.5
          });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), signMat);
          sign.position.set(b.x, bh * 0.7, b.z + (b.hd - 0.5) + 0.27);
          scene.add(sign);
          decorations.push({ mesh: sign, type: 'flicker', baseOpacity: 0.5, phase: Math.random() * Math.PI * 2 });
        }
        break;
      }

      // ════════ LEVEL 1: Jellyfish Fields ════════
      case 1: {
        // Floating jellyfish
        for (let i = 0; i < 20; i++) {
          const jelly = new THREE.Group();
          const jColor = [0xff66cc, 0xcc44ff, 0x66aaff, 0xff88aa, 0xaa66ff][Math.floor(Math.random() * 5)];
          // Dome
          const dome = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: jColor, transparent: true, opacity: 0.45, emissive: jColor, emissiveIntensity: 0.4, side: THREE.DoubleSide })
          );
          jelly.add(dome);
          // Tentacles
          for (let t = 0; t < 4; t++) {
            const tent = new THREE.Mesh(
              new THREE.CylinderGeometry(0.02, 0.01, 0.8 + Math.random() * 0.5, 3),
              new THREE.MeshBasicMaterial({ color: jColor, transparent: true, opacity: 0.3 })
            );
            tent.position.set((Math.random() - 0.5) * 0.3, -0.5, (Math.random() - 0.5) * 0.3);
            jelly.add(tent);
          }
          // Glow
          const glow = new THREE.PointLight(jColor, 0.2, 5);
          jelly.add(glow);

          const jx = (Math.random() - 0.5) * WORLD_SIZE;
          const jy = 4 + Math.random() * 10;
          const jz = (Math.random() - 0.5) * WORLD_SIZE;
          jelly.position.set(jx, jy, jz);
          scene.add(jelly);
          decorations.push({ mesh: jelly, type: 'jellyfish', baseY: jy, baseX: jx, baseZ: jz, speed: 0.3 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2. });
        }

        // Flowers on ground
        const flowerColors = [0xff4488, 0xffaa22, 0xff66cc, 0xffff44, 0xaa44ff];
        for (let i = 0; i < 50; i++) {
          const fx = (Math.random() - 0.5) * (WORLD_SIZE - 6);
          const fz = (Math.random() - 0.5) * (WORLD_SIZE - 6);
          const flower = new THREE.Group();
          const fc = flowerColors[Math.floor(Math.random() * flowerColors.length)];
          // Stem
          const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.3, 3),
            new THREE.MeshStandardMaterial({ color: 0x22aa22 })
          );
          stem.position.y = 0.15;
          flower.add(stem);
          // Petals
          const petal = new THREE.Mesh(
            new THREE.CircleGeometry(0.12, 6),
            new THREE.MeshStandardMaterial({ color: fc, side: THREE.DoubleSide, emissive: fc, emissiveIntensity: 0.15 })
          );
          petal.position.y = 0.32;
          petal.rotation.x = -Math.PI / 2;
          flower.add(petal);
          flower.position.set(fx, 0, fz);
          scene.add(flower);
        }

        // Tall grass patches
        for (let i = 0; i < 40; i++) {
          const gx = (Math.random() - 0.5) * (WORLD_SIZE - 8);
          const gz = (Math.random() - 0.5) * (WORLD_SIZE - 8);
          const grass = new THREE.Mesh(
            new THREE.ConeGeometry(0.15, 0.6 + Math.random() * 0.4, 3),
            new THREE.MeshStandardMaterial({ color: 0x44bb44, roughness: 0.9 })
          );
          grass.position.set(gx, 0.3, gz);
          scene.add(grass);
          decorations.push({ mesh: grass, type: 'sway', baseX: gx, phase: Math.random() * Math.PI * 2 });
        }

        // Fireflies
        for (let i = 0; i < 25; i++) {
          const fly = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xffff66 })
          );
          const fx2 = (Math.random() - 0.5) * WORLD_SIZE;
          const fy2 = 1 + Math.random() * 4;
          const fz2 = (Math.random() - 0.5) * WORLD_SIZE;
          fly.position.set(fx2, fy2, fz2);
          scene.add(fly);
          const flyLight = new THREE.PointLight(0xffff44, 0.15, 3);
          flyLight.position.copy(fly.position);
          scene.add(flyLight);
          decorations.push({ mesh: fly, light: flyLight, type: 'firefly', baseX: fx2, baseY: fy2, baseZ: fz2, phase: Math.random() * Math.PI * 2, speed: 0.8 + Math.random() });
        }
        break;
      }

      // ════════ LEVEL 2: Rock Bottom ════════
      case 2: {
        // Bioluminescent crystals
        const crystalColors = [0x4422ff, 0x8844ff, 0x2266ff, 0x6622cc, 0x44aaff];
        for (let i = 0; i < 35; i++) {
          const cx = (Math.random() - 0.5) * (WORLD_SIZE - 10);
          const cz = (Math.random() - 0.5) * (WORLD_SIZE - 10);
          if (Math.abs(cx) < 5 && Math.abs(cz) < 5) continue;
          const cColor = crystalColors[Math.floor(Math.random() * crystalColors.length)];
          const h = 0.5 + Math.random() * 2;
          const crystal = new THREE.Mesh(
            new THREE.ConeGeometry(0.15 + Math.random() * 0.2, h, 4),
            new THREE.MeshStandardMaterial({ color: cColor, emissive: cColor, emissiveIntensity: 0.5, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.8 })
          );
          crystal.position.set(cx, h / 2, cz);
          crystal.rotation.z = (Math.random() - 0.5) * 0.3;
          scene.add(crystal);
          decorations.push({ mesh: crystal, type: 'pulse', baseIntensity: 0.5, phase: Math.random() * Math.PI * 2 });

          // Crystal glow light
          if (Math.random() > 0.5) {
            const gl = new THREE.PointLight(cColor, 0.25, 6);
            gl.position.set(cx, h, cz);
            scene.add(gl);
          }
        }

        // Glowing mushrooms
        for (let i = 0; i < 20; i++) {
          const mx = (Math.random() - 0.5) * (WORLD_SIZE - 8);
          const mz = (Math.random() - 0.5) * (WORLD_SIZE - 8);
          const mush = new THREE.Group();
          const mColor = [0x8844ff, 0x44ff88, 0x44aaff][Math.floor(Math.random() * 3)];
          // Stem
          const mStem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.08, 0.4, 5),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 })
          );
          mStem.position.y = 0.2;
          mush.add(mStem);
          // Cap
          const mCap = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: mColor, emissive: mColor, emissiveIntensity: 0.6, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
          );
          mCap.position.y = 0.4;
          mush.add(mCap);
          mush.position.set(mx, 0, mz);
          scene.add(mush);
          decorations.push({ mesh: mush, type: 'pulse', baseIntensity: 0.6, phase: Math.random() * Math.PI * 2, target: mCap });
        }

        // Eerie floating particles
        for (let i = 0; i < 30; i++) {
          const particle = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0x6644ff, transparent: true, opacity: 0.4 })
          );
          const px = (Math.random() - 0.5) * WORLD_SIZE;
          const py = 0.5 + Math.random() * 8;
          const pz = (Math.random() - 0.5) * WORLD_SIZE;
          particle.position.set(px, py, pz);
          scene.add(particle);
          decorations.push({ mesh: particle, type: 'floatRandom', baseX: px, baseY: py, baseZ: pz, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.5 });
        }

        // Dark stalactites from above
        for (let i = 0; i < 20; i++) {
          const sx = (Math.random() - 0.5) * (WORLD_SIZE - 10);
          const sz = (Math.random() - 0.5) * (WORLD_SIZE - 10);
          const h = 1 + Math.random() * 3;
          const stalactite = new THREE.Mesh(
            new THREE.ConeGeometry(0.3 + Math.random() * 0.3, h, 5),
            new THREE.MeshStandardMaterial({ color: 0x1a1a33, roughness: 0.9, metalness: 0.1 })
          );
          stalactite.position.set(sx, 25 - h / 2, sz);
          stalactite.rotation.z = Math.PI; // Point downward
          scene.add(stalactite);
        }
        break;
      }

      // ════════ LEVEL 3: The Dump ════════
      case 3: {
        // Trash heaps
        for (let i = 0; i < 30; i++) {
          const tx = (Math.random() - 0.5) * (WORLD_SIZE - 10);
          const tz = (Math.random() - 0.5) * (WORLD_SIZE - 10);
          if (Math.abs(tx) < 5 && Math.abs(tz) < 5) continue;
          const heap = new THREE.Group();
          const trashColors = [0x665544, 0x887766, 0x554433, 0x776655, 0x443322];
          const pieces = 3 + Math.floor(Math.random() * 4);
          for (let p = 0; p < pieces; p++) {
            const s = 0.1 + Math.random() * 0.3;
            const piece = new THREE.Mesh(
              Math.random() > 0.5 ? new THREE.BoxGeometry(s, s, s) : new THREE.DodecahedronGeometry(s * 0.6, 0),
              new THREE.MeshStandardMaterial({ color: trashColors[Math.floor(Math.random() * trashColors.length)], roughness: 0.9 })
            );
            piece.position.set((Math.random() - 0.5) * 0.8, s / 2 + Math.random() * 0.2, (Math.random() - 0.5) * 0.8);
            piece.rotation.set(Math.random(), Math.random(), Math.random());
            heap.add(piece);
          }
          heap.position.set(tx, 0, tz);
          scene.add(heap);
        }

        // Puddles (flat reflective circles)
        for (let i = 0; i < 15; i++) {
          const px = (Math.random() - 0.5) * (WORLD_SIZE - 8);
          const pz = (Math.random() - 0.5) * (WORLD_SIZE - 8);
          const puddle = new THREE.Mesh(
            new THREE.CircleGeometry(0.5 + Math.random() * 1.5, 12),
            new THREE.MeshStandardMaterial({ color: 0x334422, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
          );
          puddle.rotation.x = -Math.PI / 2;
          puddle.position.set(px, 0.02, pz);
          scene.add(puddle);
        }

        // Smoke / steam columns
        for (let i = 0; i < 12; i++) {
          const sx = (Math.random() - 0.5) * (WORLD_SIZE - 12);
          const sz = (Math.random() - 0.5) * (WORLD_SIZE - 12);
          for (let s = 0; s < 5; s++) {
            const smoke = new THREE.Mesh(
              new THREE.SphereGeometry(0.3 + s * 0.15, 6, 6),
              new THREE.MeshBasicMaterial({ color: 0x887766, transparent: true, opacity: 0.08 - s * 0.012 })
            );
            smoke.position.set(sx + (Math.random() - 0.5) * 0.3, 0.5 + s * 1.2, sz + (Math.random() - 0.5) * 0.3);
            scene.add(smoke);
            decorations.push({ mesh: smoke, type: 'rise', baseY: 0.5 + s * 1.2, speed: 0.3 + Math.random() * 0.3, phase: Math.random() * Math.PI * 2 });
          }
        }

        // Flies (tiny dark particles buzzing)
        for (let i = 0; i < 20; i++) {
          const fly = new THREE.Mesh(
            new THREE.SphereGeometry(0.03, 3, 3),
            new THREE.MeshBasicMaterial({ color: 0x222200 })
          );
          const fx = (Math.random() - 0.5) * WORLD_SIZE;
          const fy = 0.5 + Math.random() * 3;
          const fz = (Math.random() - 0.5) * WORLD_SIZE;
          fly.position.set(fx, fy, fz);
          scene.add(fly);
          decorations.push({ mesh: fly, type: 'buzz', baseX: fx, baseY: fy, baseZ: fz, phase: Math.random() * Math.PI * 2, speed: 3 + Math.random() * 4 });
        }
        break;
      }

      // ════════ LEVEL 4: Flying Dutchman's Ship ════════
      case 4: {
        // Ghost wisps
        for (let i = 0; i < 30; i++) {
          const wisp = new THREE.Mesh(
            new THREE.SphereGeometry(0.2 + Math.random() * 0.3, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.15 })
          );
          const wx = (Math.random() - 0.5) * WORLD_SIZE;
          const wy = 1 + Math.random() * 10;
          const wz = (Math.random() - 0.5) * WORLD_SIZE;
          wisp.position.set(wx, wy, wz);
          scene.add(wisp);
          const wispLight = new THREE.PointLight(0x44ff44, 0.12, 4);
          wispLight.position.copy(wisp.position);
          scene.add(wispLight);
          decorations.push({ mesh: wisp, light: wispLight, type: 'ghost', baseX: wx, baseY: wy, baseZ: wz, phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 0.6 });
        }

        // Spectral fog layers
        for (let i = 0; i < 8; i++) {
          const fogPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(15 + Math.random() * 20, 2),
            new THREE.MeshBasicMaterial({ color: 0x22ff44, transparent: true, opacity: 0.04, side: THREE.DoubleSide })
          );
          fogPlane.position.set(
            (Math.random() - 0.5) * WORLD_SIZE * 0.6,
            0.5 + Math.random() * 2,
            (Math.random() - 0.5) * WORLD_SIZE * 0.6
          );
          fogPlane.rotation.y = Math.random() * Math.PI;
          scene.add(fogPlane);
          decorations.push({ mesh: fogPlane, type: 'drift', baseX: fogPlane.position.x, phase: Math.random() * Math.PI * 2 });
        }

        // Green fire on some buildings
        for (let i = 0; i < Math.min(8, buildings.length); i++) {
          const b = buildings[i];
          const bh = b.mesh.geometry.parameters.height;
          const fire = new THREE.Group();
          for (let f = 0; f < 3; f++) {
            const flame = new THREE.Mesh(
              new THREE.ConeGeometry(0.15, 0.5 + Math.random() * 0.4, 4),
              new THREE.MeshBasicMaterial({ color: [0x00ff44, 0x22ff66, 0x44ff88][f], transparent: true, opacity: 0.35 })
            );
            flame.position.set((Math.random() - 0.5) * 0.3, 0.2 + f * 0.1, (Math.random() - 0.5) * 0.3);
            fire.add(flame);
          }
          fire.position.set(b.x, bh + 0.1, b.z);
          scene.add(fire);
          decorations.push({ mesh: fire, type: 'fireFlicker', phase: Math.random() * Math.PI * 2 });
        }

        // Ghostly chains hanging
        for (let i = 0; i < 15; i++) {
          const cx = (Math.random() - 0.5) * (WORLD_SIZE - 10);
          const cz = (Math.random() - 0.5) * (WORLD_SIZE - 10);
          const chainGroup = new THREE.Group();
          const links = 4 + Math.floor(Math.random() * 4);
          for (let l = 0; l < links; l++) {
            const link = new THREE.Mesh(
              new THREE.TorusGeometry(0.08, 0.025, 4, 6),
              new THREE.MeshStandardMaterial({ color: 0x225533, emissive: 0x113322, emissiveIntensity: 0.3, transparent: true, opacity: 0.5 })
            );
            link.position.y = -l * 0.2;
            link.rotation.x = l % 2 === 0 ? 0 : Math.PI / 2;
            chainGroup.add(link);
          }
          chainGroup.position.set(cx, 18 + Math.random() * 5, cz);
          scene.add(chainGroup);
          decorations.push({ mesh: chainGroup, type: 'sway', baseX: cx, phase: Math.random() * Math.PI * 2 });
        }
        break;
      }
    }
  }

  // ─────────────────────────────────────
  //  DECORATION ANIMATION
  // ─────────────────────────────────────

  function updateDecorations(dt) {
    const t = clock.elapsedTime;
    for (const d of decorations) {
      switch (d.type) {
        case 'bubble':
          d.mesh.position.y = d.baseY + Math.sin(t * d.speed + d.phase) * 1.5;
          d.mesh.position.x += Math.sin(t * 0.5 + d.phase) * dt * 0.2;
          // Reset if too high
          if (d.mesh.position.y > 25) d.mesh.position.y = 0.5;
          break;

        case 'sway':
          d.mesh.position.x = d.baseX + Math.sin(t * 1.5 + d.phase) * 0.15;
          break;

        case 'flicker':
          d.mesh.material.opacity = d.baseOpacity * (0.6 + 0.4 * Math.sin(t * 3 + d.phase));
          break;

        case 'jellyfish':
          d.mesh.position.y = d.baseY + Math.sin(t * d.speed + d.phase) * 2;
          d.mesh.position.x = d.baseX + Math.sin(t * 0.3 + d.phase) * 3;
          d.mesh.position.z = d.baseZ + Math.cos(t * 0.3 + d.phase) * 3;
          break;

        case 'firefly':
          d.mesh.position.x = d.baseX + Math.sin(t * d.speed + d.phase) * 2;
          d.mesh.position.y = d.baseY + Math.sin(t * d.speed * 0.7 + d.phase) * 1;
          d.mesh.position.z = d.baseZ + Math.cos(t * d.speed * 0.8 + d.phase) * 2;
          d.mesh.material.opacity = 0.5 + 0.5 * Math.sin(t * 4 + d.phase);
          if (d.light) d.light.position.copy(d.mesh.position);
          break;

        case 'pulse': {
          const intensity = d.baseIntensity * (0.5 + 0.5 * Math.sin(t * 2 + d.phase));
          const target = d.target || d.mesh;
          if (target.material && target.material.emissiveIntensity !== undefined) {
            target.material.emissiveIntensity = intensity;
          }
          break;
        }

        case 'floatRandom':
          d.mesh.position.x = d.baseX + Math.sin(t * d.speed + d.phase) * 1.5;
          d.mesh.position.y = d.baseY + Math.sin(t * d.speed * 0.6 + d.phase) * 0.8;
          d.mesh.position.z = d.baseZ + Math.cos(t * d.speed * 0.8 + d.phase) * 1.5;
          break;

        case 'rise':
          d.mesh.position.y = d.baseY + Math.sin(t * d.speed + d.phase) * 0.5 + (t * 0.1 % 2);
          d.mesh.material.opacity = Math.max(0.01, 0.08 - (t * 0.1 % 2) * 0.03);
          break;

        case 'buzz':
          d.mesh.position.x = d.baseX + Math.sin(t * d.speed + d.phase) * 0.5;
          d.mesh.position.y = d.baseY + Math.sin(t * d.speed * 1.3 + d.phase) * 0.3;
          d.mesh.position.z = d.baseZ + Math.cos(t * d.speed * 0.9 + d.phase) * 0.5;
          break;

        case 'ghost':
          d.mesh.position.x = d.baseX + Math.sin(t * d.speed + d.phase) * 4;
          d.mesh.position.y = d.baseY + Math.sin(t * d.speed * 0.5 + d.phase) * 2;
          d.mesh.position.z = d.baseZ + Math.cos(t * d.speed * 0.7 + d.phase) * 4;
          d.mesh.material.opacity = 0.08 + 0.12 * Math.sin(t * 2 + d.phase);
          if (d.light) {
            d.light.position.copy(d.mesh.position);
            d.light.intensity = 0.06 + 0.1 * Math.sin(t * 2 + d.phase);
          }
          break;

        case 'drift':
          d.mesh.position.x = d.baseX + Math.sin(t * 0.2 + d.phase) * 5;
          break;

        case 'fireFlicker':
          d.mesh.scale.y = 0.8 + 0.4 * Math.sin(t * 6 + d.phase);
          d.mesh.scale.x = 0.9 + 0.2 * Math.sin(t * 5 + d.phase + 1);
          break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  MESH CREATION
  // ═══════════════════════════════════════════════════════════

  function createCoinMesh() {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 0.2, metalness: 0.8, emissive: 0x886600, emissiveIntensity: 0.3 })
    );
    coin.castShadow = true;
    coin.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.1 })
    ));
    return coin;
  }

  function createFallbackEnemyMesh(index) {
    const group = new THREE.Group();
    const colors = [0xff2244, 0xff6600, 0xcc00cc, 0xff0066, 0xaa0000, 0xff3388];
    const c = colors[index % colors.length];

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.6, 16),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.2 })
    );
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xddaa77, roughness: 0.5 })
    );
    head.position.y = 1.8;
    head.castShadow = true;
    group.add(head);

    return group;
  }

  // ═══════════════════════════════════════════════════════════
  //  SPAWN LOGIC
  // ═══════════════════════════════════════════════════════════

  function spawnPlayer() {
    playerMesh = new THREE.Group();
    scene.add(playerMesh);

    const loader = new THREE.GLTFLoader();
    loader.load('models/spongebob.glb', (gltf) => {
      const model = gltf.scene;
      model.scale.set(1, 1, 1);
      model.traverse(child => {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      playerMesh.add(model);

      playerMixer = new THREE.AnimationMixer(model);
      const anims = gltf.animations;

      const idleClip = THREE.AnimationClip.findByName(anims, 'unnamed.001|spongebob_idle01.anm');
      const runClip  = THREE.AnimationClip.findByName(anims, 'unnamed.001|spongebob_run02.anm');
      idleAction = playerMixer.clipAction(idleClip);
      runAction  = playerMixer.clipAction(runClip);

      const startClip = THREE.AnimationClip.findByName(anims, 'unnamed.001|spongebob_jump02_start.anm');
      const liftClip  = THREE.AnimationClip.findByName(anims, 'unnamed.001|spongebob_jump02_lift_cyc.anm');
      const apexClip  = THREE.AnimationClip.findByName(anims, 'unnamed.001|spongebob_jump02_apex.anm');

      const setupJump = (clip) => {
        if (!clip) return null;
        const action = playerMixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        return action;
      };

      jumpStartAction = setupJump(startClip);
      jumpLiftAction  = setupJump(liftClip);
      jumpApexAction  = setupJump(apexClip);

      playerMixer.addEventListener('finished', (e) => {
        if (e.action === jumpStartAction)     chainAction(jumpLiftAction);
        else if (e.action === jumpLiftAction)  chainAction(jumpApexAction);
      });

      function chainAction(next) {
        if (!next || !currentAction) return;
        currentAction.fadeOut(0.05);
        next.reset().fadeIn(0.05).play();
        currentAction = next;
      }

      if (idleAction) { idleAction.play(); currentAction = idleAction; }
    }, undefined, (err) => console.error('Error loading SpongeBob:', err));

    player = { x: 0, y: 0, z: 0, angle: 0 };
    playerVelY = 0;
    playerOnGround = true;
  }

  function spawnEnemy(index) {
    const side = Math.floor(Math.random() * 4);
    let x, z;
    switch (side) {
      case 0: x = -HALF_WORLD + 2; z = (Math.random() - 0.5) * WORLD_SIZE; break;
      case 1: x =  HALF_WORLD - 2; z = (Math.random() - 0.5) * WORLD_SIZE; break;
      case 2: z = -HALF_WORLD + 2; x = (Math.random() - 0.5) * WORLD_SIZE; break;
      default: z = HALF_WORLD - 2;  x = (Math.random() - 0.5) * WORLD_SIZE; break;
    }

    const type = (krabsModel && Math.random() > 0.5) ? 'krabs' : 'patrick';

    const group = new THREE.Group();
    group.position.set(x, 0, z);

    let mixer = null, eRunAction = null, eAttackAction = null, eJumpAction = null, eCurrAction = null;

    if (type === 'patrick' && patrickModel) {
      const mesh = THREE.SkeletonUtils.clone(patrickModel);
      mesh.rotation.y = Math.PI / 2;
      group.add(mesh);
      mixer = new THREE.AnimationMixer(mesh);

      const runClip    = THREE.AnimationClip.findByName(patrickAnimations, '008_Patrick_Run_v2');
      const attackClip = THREE.AnimationClip.findByName(patrickAnimations, '008_Patrick_LightCombo3_v3');
      if (runClip)    eRunAction    = mixer.clipAction(runClip);
      if (attackClip) eAttackAction = mixer.clipAction(attackClip);
      if (eRunAction) { eRunAction.play(); eCurrAction = eRunAction; }

    } else if (type === 'krabs' && krabsModel) {
      const mesh = THREE.SkeletonUtils.clone(krabsModel);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.y = 0.7;
      group.add(mesh);
      mixer = new THREE.AnimationMixer(mesh);

      const jumpClip = THREE.AnimationClip.findByName(krabsAnimations, 'Take 001');
      if (jumpClip) eJumpAction = mixer.clipAction(jumpClip);
      if (eJumpAction) { eJumpAction.play(); eCurrAction = eJumpAction; }

    } else {
      group.add(createFallbackEnemyMesh(index));
    }

    scene.add(group);

    let baseSpeed;
    switch (type) {
      case 'patrick':
        baseSpeed = PATRICK_BASE_SPEED;
        break;
      case 'krabs':
        baseSpeed = MR_KRABS_BASE_SPEED;
        break;
    }

    enemies.push({
      mesh: group, type, x, y: 0, z,
      speed: baseSpeed * (0.8 + Math.random() * 0.4) * difficultyMul,
      angle: 0, stuckTimer: 0, avoidAngle: 0,
      mixer, runAction: eRunAction, attackAction: eAttackAction,
      jumpAction: eJumpAction, currentAction: eCurrAction,
      attackCooldown: 0, isAttacking: false, attackTimer: 0,
      jumpVelY: 0, isOnGround: true,
      jumpTimer: 0.3 + Math.random() * 0.3,
      isPaused: false, pauseTimer: 0,
      jumpDirX: 0, jumpDirZ: 0,
    });
  }

  function spawnCoin() {
    let x, z, att = 0;
    do {
      x = (Math.random() - 0.5) * (WORLD_SIZE - 12);
      z = (Math.random() - 0.5) * (WORLD_SIZE - 12);
      att++;
    } while (att < 20 && isInsideBuilding(x, z));

    const mesh = createCoinMesh();
    mesh.position.set(x, 1.2, z);
    scene.add(mesh);
    coins.push({ mesh, x, z, collected: false });
  }

  function respawnCoin(coin) {
    let nx, nz, att = 0;
    do {
      nx = (Math.random() - 0.5) * (WORLD_SIZE - 12);
      nz = (Math.random() - 0.5) * (WORLD_SIZE - 12);
      att++;
    } while (att < 20 && isInsideBuilding(nx, nz));
    coin.x = nx;
    coin.z = nz;
    coin.mesh.position.set(nx, 1.2, nz);
    coin.collected = false;
    scene.add(coin.mesh);
  }

  function throwCoin() {
    if (playerCoins <= 0) {
      showMessage('🚫 NO COINS TO THROW!', 1.5);
      return;
    }

    if (throwCoinSound) {
    playVoiceSafe(throwCoinSound);
    }

    playerCoins--;
    score = Math.max(0, score - COIN_SCORE);

    const cx = Math.max(-HALF_WORLD + 2, Math.min(HALF_WORLD - 2,
      player.x - Math.sin(player.angle) * COIN_THROW_DIST));
    const cz = Math.max(-HALF_WORLD + 2, Math.min(HALF_WORLD - 2,
      player.z - Math.cos(player.angle) * COIN_THROW_DIST));

    const mesh = createCoinMesh();
    mesh.position.set(cx, 1.2, cz);
    scene.add(mesh);
    coins.push({ mesh, x: cx, z: cz, collected: false });
    showMessage('💰 COIN THROWN!', 1);
  }

  function isInsideBuilding(x, z) {
    for (const b of buildings) {
      if (Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════
  //  LOW BLOCK HELPERS
  // ═══════════════════════════════════════════════════════════

  // Check if position (x, z) is over a low block — returns the block or null
  function getLowBlockAt(x, z) {
    for (const lb of lowBlocks) {
      if (Math.abs(x - lb.x) < lb.hw && Math.abs(z - lb.z) < lb.hd) {
        return lb;
      }
    }
    return null;
  }

  // Resolve XZ collisions against low blocks for entities that CANNOT climb them
  function resolveLowBlockCollisions(x, z, radius) {
    for (const lb of lowBlocks) {
      const cx = Math.max(lb.x - lb.hw, Math.min(x, lb.x + lb.hw));
      const cz = Math.max(lb.z - lb.hd, Math.min(z, lb.z + lb.hd));
      const dx = x - cx;
      const dz = z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius) {
        if (dist === 0) {
          x = lb.x + lb.hw + radius;
        } else {
          const push = radius - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        }
      }
    }
    return { x, z };
  }

  // ═══════════════════════════════════════════════════════════
  //  GAME FLOW
  // ═══════════════════════════════════════════════════════════

  // ─── Level Select UI ───

  function buildLevelSelectGrid() {
    levelSelectGrid.innerHTML = '';
    LEVELS.forEach((lvl, idx) => {
      const unlocked  = isLevelUnlocked(idx);
      const completed = unlockedLevels.completed.includes(idx);

      const card = document.createElement('div');
      card.className = 'level-card' + (unlocked ? '' : ' locked') + (completed ? ' completed' : '');

      const icon = LEVEL_ICONS[idx] || '🎮';

      card.innerHTML = `
        <div class="level-card-icon">${icon}</div>
        <div class="level-card-number">Level ${idx + 1}</div>
        <div class="level-card-name">${lvl.name}</div>
        <div class="level-card-target">Target: ${lvl.scoreTarget} pts</div>
        <div class="level-card-stars">
          ${completed ? '<span class="star-filled">★</span><span class="star-filled">★</span><span class="star-filled">★</span>' : '<span class="star-empty">★</span><span class="star-empty">★</span><span class="star-empty">★</span>'}
        </div>
        ${!unlocked ? '<div class="level-card-lock">🔒</div>' : ''}
        ${completed ? '<div class="level-card-check">✅</div>' : ''}
      `;

      if (unlocked) {
        card.addEventListener('click', () => {
          startGameAtLevel(idx);
        });
      }

      levelSelectGrid.appendChild(card);
    });
  }

  function showLevelSelect() {
    overlayContent.classList.add('hidden');
    if (htpScreen) htpScreen.classList.add('hidden');
    buildLevelSelectGrid();
    levelSelectScreen.classList.remove('hidden');
  }

  function hideLevelSelect() {
    levelSelectScreen.classList.add('hidden');
    overlayContent.classList.remove('hidden');
  }

  function startGameAtLevel(levelIdx) {
    overlay.classList.remove('active');
    hudEl.classList.add('visible');
    minimapCanvas.classList.add('visible');
    if (levelBar) levelBar.classList.add('visible');

    currentLevel  = levelIdx;
    totalScore    = 0;
    playerCoins   = 0;
    startLevel();
  }

  function startGame() {
    // Reset any previously visible sub-screens
    finalScoreEl.classList.add('hidden');
    showLevelSelect();
  }

  function startLevel() {
    const lvl = getLvl();

    if (bgm) {
    bgm.pause();
    bgm.currentTime = 0;
    }

    // add 1 because bgm files are 1-indexed (bgm_lvl1, bgm_lvl2, etc.)
    bgm = new Audio(`sounds/bgm_lvl${currentLevel + 1}.mp3`);
    bgm.loop = true;
    bgm.volume = 0.4;

    gameTime       = 0;
    score          = 0;
    stamina        = STAMINA_MAX;
    nextEnemySpawn = lvl.spawnInterval;
    difficultyMul  = 1;
    messageTimer   = 0;
    lastShoutTime  = -2.0;
    levelComplete  = false;

    if (bgm) { 
    bgm.play().catch(() => {
      console.log('Autoplay prevented, waiting for user interaction to start music.');
    }); 
  }

    // Clean
    enemies.forEach(e => scene.remove(e.mesh));
    enemies = [];
    coins.forEach(c => scene.remove(c.mesh));
    coins = [];
    if (playerMesh) scene.remove(playerMesh);

    buildWorld();
    spawnPlayer();

    if (bgm) { bgm.currentTime = 0; bgm.play().catch(() => {}); }

    for (let i = 0; i < lvl.initialEnemies; i++) spawnEnemy(i);
    for (let i = 0; i < lvl.coinCount; i++) spawnCoin();

    hudEnemies.textContent = enemies.length;
    if (hudLevel) hudLevel.textContent = `LEVEL ${currentLevel + 1}`;
    if (hudLevelName) hudLevelName.textContent = lvl.name;
    if (hudTarget) hudTarget.textContent = `0/${lvl.scoreTarget}`;
    if (levelProgressFill) levelProgressFill.style.width = '0%';

    showMessage(`🏁 LEVEL ${currentLevel + 1}: ${lvl.name}`, 3);
    gameRunning = true;
  }

  function completeLevel() {
    levelComplete = true;
    gameRunning = false;

    totalScore += Math.floor(score);
    markLevelCompleted(currentLevel);

    if (stepSound) stepSound.pause();
    if (bgm) bgm.pause();

    // Always go back to level select
    hudEl.classList.remove('visible');
    minimapCanvas.classList.remove('visible');
    if (levelBar) levelBar.classList.remove('visible');

    if (currentLevel + 1 >= LEVELS.length) {
      overlaySub.textContent = '\uD83C\uDF89 You beat all levels! Amazing!';
    } else {
      overlaySub.textContent = `\u2705 Level ${currentLevel + 1} complete! Choose your next level.`;
    }
    finalScoreEl.classList.remove('hidden');
    finalScoreVal.textContent = totalScore;
    startBtn.textContent = 'BACK TO LEVEL SELECTION';
    overlay.classList.add('active');

    // Override the start button to go directly to level select
    startBtn.onclick = function () {
      startBtn.onclick = null;
      startBtn.addEventListener('click', startGame);
      finalScoreEl.classList.add('hidden');
      showLevelSelect();
    };
  }

  function gameOver(won) {
    gameRunning = false;
    levelComplete = false;
    hudEl.classList.remove('visible');
    minimapCanvas.classList.remove('visible');
    if (levelBar) levelBar.classList.remove('visible');

    totalScore += Math.floor(score);

    if (won) {
      overlaySub.textContent = '🎉 You beat all levels! Amazing!';
    } else {
      overlaySub.textContent = `You got caught on Level ${currentLevel + 1}! Try again?`;
    }
    finalScoreEl.classList.remove('hidden');
    finalScoreVal.textContent = totalScore;
    startBtn.textContent = 'SELECT LEVEL';
    overlay.classList.add('active');

    if (bgm) bgm.pause();
    if (stepSound) stepSound.pause();
  }

  function showMessage(text, duration) {
    hudMessage.textContent = text;
    hudMessage.classList.add('show');
    messageTimer = duration || 2;
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE — Main
  // ═══════════════════════════════════════════════════════════

  function update(dt) {
    if (!gameRunning) return;

    gameTime += dt;
    score += dt * 10;
    difficultyMul = 1 + gameTime / 60;

    // Check level target
    const lvl = getLvl();
    if (score >= lvl.scoreTarget && !levelComplete) {
      completeLevel();
      return;
    }

    updatePlayer(dt);
    updateEnemies(dt);
    updateCoins(dt);
    updateDecorations(dt);
    updateCamera(dt);
    updateHUD(dt);
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE — Player  (with low block support)
  // ═══════════════════════════════════════════════════════════

  function updatePlayer(dt) {
    let inputForward = 0, inputRight = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    inputForward += 1;
    if (keys['KeyS'] || keys['ArrowDown'])  inputForward -= 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  inputRight   -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) inputRight   += 1;

    const moving    = inputForward !== 0 || inputRight !== 0;
    const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];

    // Stamina
    if (sprinting && moving && stamina > 0) {
      stamina = Math.max(0, stamina - STAMINA_DRAIN * dt);
    } else {
      stamina = Math.min(STAMINA_MAX, stamina + STAMINA_REGEN * dt);
    }

    const canSprint = sprinting && stamina > 0;
    if (runAction) runAction.timeScale = canSprint ? 2.0 : 1.0;
    const playerBoost = 1 + currentLevel * PLAYER_SPEED_BOOST;
    const speed = (canSprint ? SPRINT_SPEED : PLAYER_SPEED) * playerBoost * dt;

    // Step sounds
    if (moving && playerOnGround) {
      if (stepSound) {
        stepSound.playbackRate = canSprint ? 1.0 : 0.5;
        if (stepSound.paused) stepSound.play();
      }
    } else {
      if (stepSound && !stepSound.paused) stepSound.pause();
    }

    // Movement
    if (moving) {
      const camFwdX = player.x - camera.position.x;
      const camFwdZ = player.z - camera.position.z;
      const camLen  = Math.sqrt(camFwdX * camFwdX + camFwdZ * camFwdZ) || 1;
      const fwdX = camFwdX / camLen, fwdZ = camFwdZ / camLen;
      const rightX = -fwdZ, rightZ = fwdX;

      let moveX = fwdX * inputForward + rightX * inputRight;
      let moveZ = fwdZ * inputForward + rightZ * inputRight;
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= len; moveZ /= len;

      player.angle = lerpAngle(player.angle, Math.atan2(moveX, moveZ), 5 * dt);

      let nx = player.x + moveX * speed;
      let nz = player.z + moveZ * speed;
      const resolved = resolveCollisions(nx, nz, 0.6);
      player.x = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, resolved.x));
      player.z = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, resolved.z));
    }

    // Jump
    if (keys['Space'] && playerOnGround) {
      const jumpBoost = 1 + currentLevel * PLAYER_JUMP_BOOST;
      playerVelY = JUMP_FORCE * jumpBoost;
      playerOnGround = false;
      if (jumpSound) { jumpSound.currentTime = 0; jumpSound.play(); }
    }

    // Gravity
    playerVelY -= GRAVITY * dt;
    player.y += playerVelY * dt;

    // Floor or low block landing
    const blockBelow = getLowBlockAt(player.x, player.z);
    const floorY = blockBelow ? blockBelow.h : 0;

    if (player.y <= floorY) {
      player.y = floorY;
      playerVelY = 0;
      playerOnGround = true;
    }

    playerMesh.position.set(player.x, player.y, player.z);
    playerMesh.rotation.y = player.angle;

    // Landing
    const justLanded = playerOnGround && !wasOnGround;
    if (justLanded && landSound) { landSound.currentTime = 0; landSound.play(); }
    wasOnGround = playerOnGround;

    // Animation
    if (playerMixer && currentAction) {
      const jumpActions = [jumpStartAction, jumpLiftAction, jumpApexAction];
      const isJumping   = jumpActions.includes(currentAction);

      if (!playerOnGround) {
        if (!isJumping && jumpStartAction) {
          currentAction.fadeOut(0.1);
          jumpStartAction.reset().fadeIn(0.1).play();
          currentAction = jumpStartAction;
        }
      } else {
        const targetAction = moving ? runAction : idleAction;
        if (isJumping || (targetAction && targetAction !== currentAction)) {
          currentAction.fadeOut(justLanded ? 0.1 : 0.2);
          targetAction.reset().fadeIn(justLanded ? 0.1 : 0.2).play();
          currentAction = targetAction;
        }
      }
    }
    if (playerMixer) playerMixer.update(dt);
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE — Enemies
  // ═══════════════════════════════════════════════════════════

  function updateEnemies(dt) {
    // Shout logic
    let nearestEnemy = null, nearestDist = Infinity;
    for (const e of enemies) {
      const d = Math.sqrt((player.x - e.x) ** 2 + (player.z - e.z) ** 2);
      if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
    }
    
    if (nearestEnemy && nearestDist < SHOUT_RANGE && (gameTime - lastShoutTime) >= SHOUT_COOLDOWN) {
      const shouts = nearestEnemy.type === 'krabs' ? krabsShouts : patrickShouts;
      if (shouts.length > 0) {
        const s = shouts[Math.floor(Math.random() * shouts.length)];
        if (s) {
          playVoiceSafe(s);
          lastShoutTime = gameTime;
        }
      }
    }

    for (const enemy of enemies) {
      if (enemy.type === 'krabs') updateKrabsEnemy(enemy, dt);
      else updatePatrickEnemy(enemy, dt);

      // Catch check
      const dx = player.x - enemy.x;
      const dz = player.z - enemy.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < ENEMY_CATCH_DIST && Math.abs(player.y - enemy.y) < 1.5) {
        gameOver(false);
        return;
      }
    }

    // Spawn
    const lvl = getLvl();
    nextEnemySpawn -= dt;
    if (nextEnemySpawn <= 0 && enemies.length < lvl.maxEnemies) {
      spawnEnemy(enemies.length);
      nextEnemySpawn = Math.max(4, lvl.spawnInterval - gameTime / 10);
      hudEnemies.textContent = enemies.length;
      showMessage('⚠ NEW ENEMY!', 2);
    }
  }

  // Patrick: chases player, can dash attack, BLOCKED by low blocks

  function updatePatrickEnemy(enemy, dt) {
    if (enemy.mixer) enemy.mixer.update(dt);

    if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;

    if (enemy.attackTimer > 0) {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        enemy.isAttacking = false;
        if (enemy.runAction && enemy.currentAction !== enemy.runAction) {
          if (enemy.currentAction) enemy.currentAction.fadeOut(0.2);
          enemy.runAction.reset().fadeIn(0.2).play();
          enemy.currentAction = enemy.runAction;
        }
      }
    }

    let dx = player.x - enemy.x;
    let dz = player.z - enemy.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.1) { dx /= dist; dz /= dist; }

    // Obstacle avoidance (buildings + low blocks for Patrick)
    let avoidX = 0, avoidZ = 0;
    for (const b of buildings) {
      const bx = enemy.x - b.x, bz = enemy.z - b.z;
      const bd = Math.sqrt(bx * bx + bz * bz);
      if (bd < b.hw + 3) {
        avoidX += bx / (bd * bd + 0.5) * 5;
        avoidZ += bz / (bd * bd + 0.5) * 5;
      }
    }
    // Patrick also avoids low blocks
    for (const lb of lowBlocks) {
      const bx = enemy.x - lb.x, bz = enemy.z - lb.z;
      const bd = Math.sqrt(bx * bx + bz * bz);
      if (bd < (lb.hw + lb.hd) / 2 + 3) {
        avoidX += bx / (bd * bd + 0.5) * 5;
        avoidZ += bz / (bd * bd + 0.5) * 5;
      }
    }

    // Dash attack
    if (dist < 8 && enemy.attackCooldown <= 0 && !enemy.isAttacking) {
      enemy.isAttacking = true;
      enemy.attackCooldown = 4.0;
      enemy.attackTimer = 1.0;
      if (enemy.attackAction && enemy.currentAction !== enemy.attackAction) {
        if (enemy.currentAction) enemy.currentAction.fadeOut(0.1);
        enemy.attackAction.reset().fadeIn(0.1).play();
        enemy.currentAction = enemy.attackAction;
      }
    }

    const prevX = enemy.x, prevZ = enemy.z;
    let eSpeed = enemy.speed * Math.min(difficultyMul, 3) * dt;
    if (enemy.isAttacking) eSpeed *= 2.0;

    let ex = enemy.x + (dx + avoidX * 0.3) * eSpeed;
    let ez = enemy.z + (dz + avoidZ * 0.3) * eSpeed;

    // Collisions: buildings + low blocks (Patrick can't climb)
    let resolved = resolveCollisions(ex, ez, 0.6);
    resolved = resolveLowBlockCollisions(resolved.x, resolved.z, 0.6);
    ex = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, resolved.x));
    ez = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, resolved.z));

    // Stuck handling
    const moved = Math.abs(ex - prevX) + Math.abs(ez - prevZ);
    if (moved < eSpeed * 0.1) {
      enemy.stuckTimer += dt;
      if (enemy.stuckTimer > 0.5) {
        enemy.avoidAngle = (Math.random() - 0.5) * Math.PI;
        enemy.stuckTimer = 0;
      }
      ex += Math.cos(enemy.avoidAngle) * eSpeed * 3;
      ez += Math.sin(enemy.avoidAngle) * eSpeed * 3;
    } else {
      enemy.stuckTimer = 0;
    }

    const amx = ex - prevX, amz = ez - prevZ;
    if (Math.abs(amx) > 0.001 || Math.abs(amz) > 0.001) {
      enemy.angle = lerpAngle(enemy.angle, Math.atan2(amx, amz), 10 * dt);
    }

    enemy.x = ex; enemy.z = ez;
    enemy.mesh.position.set(enemy.x, 0, enemy.z);
    enemy.mesh.rotation.y = enemy.angle;
  }

  // Mr. Krabs: jumps toward nearest coin/player, CAN jump on low blocks

  function updateKrabsEnemy(enemy, dt) {
    if (enemy.mixer) enemy.mixer.update(dt);

    if (enemy.isPaused) {
      enemy.pauseTimer -= dt;
      if (enemy.pauseTimer <= 0) enemy.isPaused = false;
      enemy.mesh.position.set(enemy.x, enemy.y, enemy.z);
      enemy.mesh.rotation.y = enemy.angle;
      return;
    }

    const target = findKrabsTarget(enemy);

    if (enemy.isOnGround) {
      enemy.jumpTimer -= dt;
      if (enemy.jumpTimer <= 0) {
        let dx = target.x - enemy.x;
        let dz = target.z - enemy.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.1) { dx /= dist; dz /= dist; }

        // Avoid buildings only (Krabs can jump over low blocks)
        let avoidX = 0, avoidZ = 0;
        for (const b of buildings) {
          const bx = enemy.x - b.x, bz = enemy.z - b.z;
          const bd = Math.sqrt(bx * bx + bz * bz);
          if (bd < b.hw + 3) {
            avoidX += bx / (bd * bd + 0.5) * 5;
            avoidZ += bz / (bd * bd + 0.5) * 5;
          }
        }

        enemy.jumpDirX = dx + avoidX * 0.3;
        enemy.jumpDirZ = dz + avoidZ * 0.3;
        const jLen = Math.sqrt(enemy.jumpDirX ** 2 + enemy.jumpDirZ ** 2) || 1;
        enemy.jumpDirX /= jLen; enemy.jumpDirZ /= jLen;

        enemy.angle = lerpAngle(enemy.angle, Math.atan2(enemy.jumpDirX, enemy.jumpDirZ), 1);

        enemy.jumpVelY = KRABS_JUMP_FORCE;
        enemy.isOnGround = false;
        enemy.jumpTimer = KRABS_JUMP_PAUSE;
      }
    } else {
      const eSpeed = enemy.speed * Math.min(difficultyMul, 3) * dt;
      let ex = enemy.x + enemy.jumpDirX * eSpeed;
      let ez = enemy.z + enemy.jumpDirZ * eSpeed;
      const resolved = resolveCollisions(ex, ez, 0.6);
      enemy.x = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, resolved.x));
      enemy.z = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, resolved.z));

      enemy.jumpVelY -= KRABS_GRAVITY * dt;
      enemy.y += enemy.jumpVelY * dt;

      // Land on low block or ground
      const blockBelow = getLowBlockAt(enemy.x, enemy.z);
      const floorY = blockBelow ? blockBelow.h : 0;

      if (enemy.y <= floorY) {
        enemy.y = floorY;
        enemy.jumpVelY = 0;
        enemy.isOnGround = true;
      }
    }

    // Coin pickup
    for (const coin of coins) {
      if (coin.collected) continue;
      const cdx = enemy.x - coin.x, cdz = enemy.z - coin.z;
      if (Math.sqrt(cdx * cdx + cdz * cdz) < 1.5) {
        coin.collected = true;
        scene.remove(coin.mesh);
        enemy.isPaused = true;
        enemy.pauseTimer = KRABS_COIN_PAUSE;
        enemy.y = 0;
        enemy.jumpVelY = 0;
        enemy.isOnGround = true;
        setTimeout(() => respawnCoin(coin), COIN_RESPAWN_MS);
        break;
      }
    }

    enemy.mesh.position.set(enemy.x, enemy.y, enemy.z);
    enemy.mesh.rotation.y = enemy.angle;
  }

  function findKrabsTarget(enemy) {
    let nearCoinDist = Infinity, nearCoin = null;
    for (const c of coins) {
      if (c.collected) continue;
      const d = Math.sqrt((enemy.x - c.x) ** 2 + (enemy.z - c.z) ** 2);
      if (d < nearCoinDist) { nearCoinDist = d; nearCoin = c; }
    }
    const playerDist = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.z - player.z) ** 2);
    if (nearCoin && nearCoinDist < playerDist) return { x: nearCoin.x, z: nearCoin.z };
    return { x: player.x, z: player.z };
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE — Coins
  // ═══════════════════════════════════════════════════════════

  function updateCoins(dt) {
    for (const coin of coins) {
      if (coin.collected) continue;
      coin.mesh.position.y = 1.2 + Math.sin(gameTime * 3 + coin.x) * 0.3;
      coin.mesh.rotation.y += dt * 3;

      const dx = player.x - coin.x, dz = player.z - coin.z;
      if (Math.sqrt(dx * dx + dz * dz) < 1.5) {
        coin.collected = true;
        scene.remove(coin.mesh);
        score += COIN_SCORE;
        playerCoins++;
        if (grabCoinSound) {
          grabCoinSound.currentTime = 0;
          grabCoinSound.play().catch(() => {});
        }
        setTimeout(() => respawnCoin(coin), COIN_RESPAWN_MS);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE — Camera
  // ═══════════════════════════════════════════════════════════

  function updateCamera(dt) {
    if (keys['KeyQ']) cameraHeight = Math.min(CAMERA_HEIGHT_MAX, cameraHeight + CAMERA_HEIGHT_SPEED * dt);
    if (keys['KeyE']) cameraHeight = Math.max(CAMERA_HEIGHT_MIN, cameraHeight - CAMERA_HEIGHT_SPEED * dt);

    const idealOffset = new THREE.Vector3(
      -Math.sin(player.angle) * CAMERA_DIST,
      cameraHeight,
      -Math.cos(player.angle) * CAMERA_DIST
    );
    const idealTarget = new THREE.Vector3(player.x, player.y + 2, player.z);
    camera.position.lerp(idealTarget.clone().add(idealOffset), CAMERA_LERP * dt);
    camera.lookAt(new THREE.Vector3(player.x, player.y + 1.5, player.z));
  }

  // ═══════════════════════════════════════════════════════════
  //  UPDATE — HUD
  // ═══════════════════════════════════════════════════════════

  function updateHUD(dt) {
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    hudTime.textContent  = `${mins}:${String(secs).padStart(2, '0')}`;
    hudScore.textContent = Math.floor(totalScore + score);
    hudCoins.textContent = playerCoins;

    // Progress bar for score target
    const lvl = getLvl();
    const pct = Math.min(100, (score / lvl.scoreTarget) * 100);
    if (hudTarget) {
      hudTarget.textContent = `${Math.floor(score)}/${lvl.scoreTarget}`;
    }
    if (levelProgressFill) {
      levelProgressFill.style.width = pct + '%';
    }

    staminaFill.style.width = (stamina / STAMINA_MAX * 100) + '%';
    staminaFill.classList.toggle('low', stamina < 25);

    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) hudMessage.classList.remove('show');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  COLLISION
  // ═══════════════════════════════════════════════════════════

  function resolveCollisions(x, z, radius) {
    for (const b of buildings) {
      const cx = Math.max(b.x - b.hw, Math.min(x, b.x + b.hw));
      const cz = Math.max(b.z - b.hd, Math.min(z, b.z + b.hd));
      const dx = x - cx, dz = z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius) {
        if (dist === 0) { x = b.x + b.hw + radius; }
        else { const push = radius - dist; x += (dx / dist) * push; z += (dz / dist) * push; }
      }
    }
    for (const t of trees) {
      const dx = x - t.x, dz = z - t.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < t.r + radius) {
        const push = t.r + radius - dist;
        if (dist > 0.01) { x += (dx / dist) * push; z += (dz / dist) * push; }
      }
    }
    return { x, z };
  }

  // ═══════════════════════════════════════════════════════════
  //  MINIMAP
  // ═══════════════════════════════════════════════════════════

  function drawMinimap() {
    const w = minimapCanvas.width, h = minimapCanvas.height;
    const ctx = minimapCtx;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
    ctx.fillRect(0, 0, w, h);

    const scale = w / WORLD_SIZE;
    const oX = w / 2, oZ = h / 2;
    const toX = (x) => oX + x * scale;
    const toZ = (z) => oZ + z * scale;

    // Buildings
    ctx.fillStyle = '#334466';
    for (const b of buildings) {
      ctx.fillRect(toX(b.x) - b.hw * scale, toZ(b.z) - b.hd * scale, b.hw * 2 * scale, b.hd * 2 * scale);
    }

    // Low blocks
    ctx.fillStyle = '#556688';
    for (const lb of lowBlocks) {
      ctx.fillRect(toX(lb.x) - lb.hw * scale, toZ(lb.z) - lb.hd * scale, lb.hw * 2 * scale, lb.hd * 2 * scale);
    }

    // Coins
    ctx.fillStyle = '#ffdd00';
    for (const c of coins) {
      if (c.collected) continue;
      ctx.beginPath();
      ctx.arc(toX(c.x), toZ(c.z), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies
    for (const e of enemies) {
      ctx.fillStyle = e.type === 'krabs' ? '#ff8800' : '#ff2244';
      ctx.beginPath();
      ctx.arc(toX(e.x), toZ(e.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player
    ctx.fillStyle = '#00ddff';
    ctx.beginPath();
    ctx.arc(toX(player.x), toZ(player.z), 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#00ddff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(player.x), toZ(player.z));
    ctx.lineTo(toX(player.x) + Math.sin(player.angle) * 8, toZ(player.z) + Math.cos(player.angle) * 8);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }

  // ═══════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════

  function playVoiceSafe(audio) {
  // if theres already a voice line playing, don't interrupt it with a new one
  if (currentVoiceLine && !currentVoiceLine.paused) {
    return; 
  }

  // if not, play the new voice line
  currentVoiceLine = audio;
  currentVoiceLine.currentTime = 0;
  currentVoiceLine.play().catch(e => console.log("Audio play blocked:", e));
  }

  function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * Math.min(1, t);
  }

  // ═══════════════════════════════════════════════════════════
  //  INPUT
  // ═══════════════════════════════════════════════════════════

  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'KeyC' && gameRunning) throwCoin();
  });

  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // ═══════════════════════════════════════════════════════════
  //  MAIN LOOP
  // ═══════════════════════════════════════════════════════════

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    if (gameRunning) drawMinimap();
    renderer.render(scene, camera);
  }

  // ═══════════════════════════════════════════════════════════
  //  BOOT
  // ═══════════════════════════════════════════════════════════

  startBtn.addEventListener('click', startGame);

  if (lsBackBtn) lsBackBtn.addEventListener('click', hideLevelSelect);

  howToPlayBtn.addEventListener('click', () => {
    overlayContent.classList.add('hidden');
    htpScreen.classList.remove('hidden');
  });
  htpBackBtn.addEventListener('click', () => {
    htpScreen.classList.add('hidden');
    overlayContent.classList.remove('hidden');
  });

  // Load Patrick
  new THREE.GLTFLoader().load('models/patrick.glb', (gltf) => {
    patrickModel = gltf.scene;
    patrickAnimations = gltf.animations;
    patrickModel.scale.set(220, 220, 220);
    patrickModel.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true; child.receiveShadow = true;
        if (child.material) {
          child.material.depthWrite = true; child.material.transparent = false; child.material.opacity = 1;
          child.material.emissive = new THREE.Color(0xffffff); child.material.emissiveIntensity = 0.2;
        }
      }
    });
    console.log('Patrick animations:', patrickAnimations.map(c => c.name));
  });

  // Load Mr. Krabs
  new THREE.GLTFLoader().load('models/mr_krabs.glb', (gltf) => {
    krabsModel = gltf.scene;
    krabsAnimations = gltf.animations;
    krabsModel.scale.set(1, 1, 1);
    const bbox = new THREE.Box3().setFromObject(krabsModel);
    const size = bbox.getSize(new THREE.Vector3());
    const s = 2.5 / (size.y || 1);
    krabsModel.scale.set(s, s, s);
    krabsModel.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true; child.receiveShadow = true;
        if (child.material) {
          child.material.depthWrite = true; child.material.transparent = false; child.material.opacity = 1;
          child.material.emissive = new THREE.Color(0xffffff); child.material.emissiveIntensity = 0.2;
        }
      }
    });
    console.log('Mr. Krabs animations:', krabsAnimations.map(c => c.name));
  }, undefined, (err) => console.error('Error loading Mr. Krabs:', err));

  initThree();
  buildWorld();
  camera.lookAt(0, 0, 0);
  animate();

})();
