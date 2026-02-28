// ═══════════════════════════════════════════════════════════
//  SpongeBob Run! — 3D Chase Game
//  Three.js third-person survival game
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Constants ──
  const WORLD_SIZE    = 120;
  const HALF_WORLD    = WORLD_SIZE / 2;
  const PLAYER_SPEED  = 12;
  const SPRINT_SPEED  = 20;
  const JUMP_FORCE    = 14;
  const GRAVITY       = 32;
  const ENEMY_BASE_SPEED = 5;
  const ENEMY_CATCH_DIST = 0.8;
  const CAMERA_HEIGHT_DEFAULT = 10;
  const CAMERA_HEIGHT_MIN = 3;
  const CAMERA_HEIGHT_MAX = 30;
  const CAMERA_HEIGHT_SPEED = 12; // units per second
  const CAMERA_DIST   = 16;
  const CAMERA_LERP   = 4;
  let cameraHeight = CAMERA_HEIGHT_DEFAULT;
  const STAMINA_MAX   = 100;
  const STAMINA_DRAIN = 30;  // per second
  const STAMINA_REGEN = 20;  // per second
  const ENEMY_SPAWN_INTERVAL = 12; // seconds
  const MAX_ENEMIES   = 15;
  const INITIAL_ENEMIES = 3;
  const COIN_COUNT     = 15;


  // ── Audio ──
  let bgm, jumpSound, landSound, stepSound;
  let shoutSounds = [];
  let lastShoutTime = -2.0; // Allows shouting immediately when the game starts

  // ── Three.js Setup ──
  let scene, camera, renderer;
  let clock;

  // ── Game State ──
  let gameRunning = false;
  let gameTime = 0;
  let score = 0;
  let stamina = STAMINA_MAX;
  let nextEnemySpawn = ENEMY_SPAWN_INTERVAL;
  let difficultyMul = 1;
  let messageTimer = 0;

  // ── Player ──
  let player = null;
  let playerVelY = 0;
  let playerOnGround = true;
  let playerMesh = null;
  
  let playerMixer = null;
  let currentAction = null;
  
  let idleAction = null;
  let runAction = null;

  // New Jump sequence actions
  let jumpStartAction, jumpLiftAction, jumpApexAction;
  let wasOnGround = true; // Tracks the previous state to detect landing

  // ── Enemies ──
  let enemies = [];
  let patrickModel = null;      // Stores the Patrick 3D model
  let patrickAnimations = [];   // Stores Patrick's animations

  // ── Coins / Pickups ──
  let coins = [];

  // ── Environment ──
  let buildings = [];
  let trees = [];

  // ── Input ──
  const keys = {};

  // ── DOM Elements ──
  const hudEl        = document.getElementById('hud');
  const hudTime      = document.getElementById('hud-time');
  const hudScore     = document.getElementById('hud-score');
  const hudEnemies   = document.getElementById('hud-enemies');
  const hudMessage   = document.getElementById('hud-message');
  const staminaFill  = document.getElementById('stamina-fill');
  const overlay      = document.getElementById('overlay');
  const overlaySub   = document.getElementById('overlay-sub');
  const finalScoreEl = document.getElementById('final-score');
  const finalScoreVal= document.getElementById('final-score-value');
  const startBtn     = document.getElementById('btn-start');
  const minimapCanvas= document.getElementById('minimap');
  const minimapCtx   = minimapCanvas.getContext('2d');

  // ═══════════════════════════════════════
  //  Initialise Three.js
  // ═══════════════════════════════════════

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.012);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(0, cameraHeight, CAMERA_DIST);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    clock = new THREE.Clock();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
    dirLight.position.set(30, 50, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -60;
    dirLight.shadow.camera.right = 60;
    dirLight.shadow.camera.top = 60;
    dirLight.shadow.camera.bottom = -60;
    scene.add(dirLight);

    // Subtle point lights for mood
    const blueLight = new THREE.PointLight(0x0066ff, 0.4, 60);
    blueLight.position.set(-20, 8, -20);
    scene.add(blueLight);

    const redLight = new THREE.PointLight(0xff2244, 0.3, 60);
    redLight.position.set(20, 8, 20);
    scene.add(redLight);

    // Resize handler
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Load Sounds
    bgm = new Audio('sounds/bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.4;

    jumpSound = new Audio('sounds/jump.mp3');
    landSound = new Audio('sounds/player_landing.mp3');
    stepSound = new Audio('sounds/player_steps.mp3');
    stepSound.loop = true;
    stepSound.volume = 0.6;

    const shoutFiles = ['patrick_you_fat.mp3', 'get_away_from_me.mp3', 'you_smell_like.mp3', 'if_i_had.mp3'];

    shoutFiles.forEach(fileName => {
        const audio = new Audio(`sounds/${fileName}`);
        audio.volume = 0.8;
        shoutSounds.push(audio);
    });
  }

  // ═══════════════════════════════════════
  //  Build World
  // ═══════════════════════════════════════

  function buildWorld() {
    // Remove old stuff
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
    buildings = [];
    trees = [];

    // Re-add lights
    scene.add(new THREE.AmbientLight(0x334466, 0.6));
    const dl = new THREE.DirectionalLight(0xffeedd, 0.8);
    dl.position.set(30, 50, 20);
    dl.castShadow = true;
    dl.shadow.mapSize.width = 2048;
    dl.shadow.mapSize.height = 2048;
    dl.shadow.camera.near = 0.5;
    dl.shadow.camera.far = 150;
    dl.shadow.camera.left = -60;
    dl.shadow.camera.right = 60;
    dl.shadow.camera.top = 60;
    dl.shadow.camera.bottom = -60;
    scene.add(dl);
    scene.add(new THREE.PointLight(0x0066ff, 0.4, 60).translateX(-20).translateY(8));
    scene.add(new THREE.PointLight(0xff2244, 0.3, 60).translateX(20).translateY(8).translateZ(20));

    // ── Ground ──
    const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a1a,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid lines on ground
    const gridHelper = new THREE.GridHelper(WORLD_SIZE, 40, 0x224422, 0x1a2a1a);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // ── Boundary walls (transparent-ish) ──
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2244cc,
      transparent: true,
      opacity: 0.15,
      roughness: 0.5,
    });
    const wallH = 8;
    const sides = [
      { pos: [0, wallH / 2, -HALF_WORLD], rot: [0, 0, 0], size: [WORLD_SIZE, wallH, 0.5] },
      { pos: [0, wallH / 2, HALF_WORLD], rot: [0, 0, 0], size: [WORLD_SIZE, wallH, 0.5] },
      { pos: [-HALF_WORLD, wallH / 2, 0], rot: [0, Math.PI / 2, 0], size: [WORLD_SIZE, wallH, 0.5] },
      { pos: [HALF_WORLD, wallH / 2, 0], rot: [0, Math.PI / 2, 0], size: [WORLD_SIZE, wallH, 0.5] },
    ];
    for (const s of sides) {
      const geo = new THREE.BoxGeometry(...s.size);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(...s.pos);
      wall.rotation.set(...s.rot);
      scene.add(wall);
    }

    // ── Buildings / Obstacles ──
    const buildingColors = [0x334455, 0x3a3a4e, 0x2b3555, 0x443344, 0x2a4a4a];
    for (let i = 0; i < 25; i++) {
      const w = 3 + Math.random() * 5;
      const h = 3 + Math.random() * 10;
      const d = 3 + Math.random() * 5;
      const x = (Math.random() - 0.5) * (WORLD_SIZE - 16);
      const z = (Math.random() - 0.5) * (WORLD_SIZE - 16);

      // Don't place too close to center (player spawn)
      if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;

      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: buildingColors[i % buildingColors.length],
        roughness: 0.7,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      buildings.push({ mesh, x, z, hw: w / 2 + 0.5, hd: d / 2 + 0.5 });

      // Glow edge on some buildings
      if (Math.random() > 0.5) {
        const edgeGeo = new THREE.BoxGeometry(w + 0.1, 0.15, d + 0.1);
        const edgeMat = new THREE.MeshBasicMaterial({
          color: Math.random() > 0.5 ? 0x00aaff : 0xff4488,
          transparent: true,
          opacity: 0.4,
        });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.set(x, h + 0.08, z);
        scene.add(edge);
      }
    }

    // ── Trees (simple cone + cylinder) ──
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() - 0.5) * (WORLD_SIZE - 10);
      const z = (Math.random() - 0.5) * (WORLD_SIZE - 10);
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

      // Check not overlapping buildings
      let ok = true;
      for (const b of buildings) {
        if (Math.abs(x - b.x) < b.hw + 1 && Math.abs(z - b.z) < b.hd + 1) { ok = false; break; }
      }
      if (!ok) continue;

      const trunkH = 1 + Math.random() * 0.5;
      const leafH = 2 + Math.random() * 2;

      const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, trunkH, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x553322, roughness: 0.9 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, trunkH / 2, z);
      trunk.castShadow = true;
      scene.add(trunk);

      const leafGeo = new THREE.ConeGeometry(1.2 + Math.random(), leafH, 7);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x226633, roughness: 0.8 });
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(x, trunkH + leafH / 2, z);
      leaf.castShadow = true;
      scene.add(leaf);

      trees.push({ x, z, r: 1.0 });
    }

    // ── Street lamps ──
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 25 + Math.random() * 15;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 4);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 2.5, z);
      scene.add(pole);

      const lampGeo = new THREE.SphereGeometry(0.3, 8, 8);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, 5.2, z);
      scene.add(lamp);

      const pl = new THREE.PointLight(0xffee88, 0.5, 15);
      pl.position.set(x, 5, z);
      scene.add(pl);
    }

    // ── Skybox-ish (dark stars) ──
    const starGeo = new THREE.BufferGeometry();
    const starCount = 800;
    const starVerts = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starVerts[i * 3] = (Math.random() - 0.5) * 250;
      starVerts[i * 3 + 1] = 30 + Math.random() * 80;
      starVerts[i * 3 + 2] = (Math.random() - 0.5) * 250;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starVerts, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.6 });
    scene.add(new THREE.Points(starGeo, starMat));
  }

  // ═══════════════════════════════════════
  //  Create Characters
  // ═══════════════════════════════════════

  function createPlayerMesh() {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.6, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00bbff, roughness: 0.4, metalness: 0.1 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc88, roughness: 0.5 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.85;
    head.castShadow = true;
    group.add(head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.12, 1.9, 0.3);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.12, 1.9, 0.3);
    group.add(eyeR);

    // Left arm
    const armGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.74, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x00bbff, roughness: 0.4 });
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.6, 1.0, 0);
    armL.name = 'armL';
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.6, 1.0, 0);
    armR.name = 'armR';
    group.add(armR);

    // Left leg
    const legGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.78, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.5 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.2, 0.35, 0);
    legL.name = 'legL';
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.2, 0.35, 0);
    legR.name = 'legR';
    group.add(legR);

    // Glow ring under player
    const ringGeo = new THREE.RingGeometry(0.5, 0.7, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.name = 'glowRing';
    group.add(ring);

    return group;
  }

  function createEnemyMesh(index) {
    const group = new THREE.Group();
    const enemyColors = [0xff2244, 0xff6600, 0xcc00cc, 0xff0066, 0xaa0000, 0xff3388];
    const color = enemyColors[index % enemyColors.length];

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.6, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    // Head — angry look
    const headGeo = new THREE.SphereGeometry(0.38, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xddaa77, roughness: 0.5 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.8;
    head.castShadow = true;
    group.add(head);

    // Red eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.14, 1.85, 0.32);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.14, 1.85, 0.32);
    group.add(eyeR);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.76, 8);
    const armMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.65, 1.0, 0);
    armL.name = 'armL';
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.65, 1.0, 0);
    armR.name = 'armR';
    group.add(armR);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x331111, roughness: 0.5 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.22, 0.35, 0);
    legL.name = 'legL';
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.22, 0.35, 0);
    legR.name = 'legR';
    group.add(legR);

    // Warning ring
    const ringGeo = new THREE.RingGeometry(0.5, 0.7, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    return group;
  }

  function createCoinMesh() {
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 0.2, metalness: 0.8, emissive: 0x886600, emissiveIntensity: 0.3 });
    const coin = new THREE.Mesh(geo, mat);
    coin.castShadow = true;

    // Glow
    const glowGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.1 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    coin.add(glow);

    return coin;
  }

  // ═══════════════════════════════════════
  //  Spawn Logic
  // ═══════════════════════════════════════

  function spawnPlayer() {
    // Create an empty group to hold the player so the game doesn't crash while loading
    playerMesh = new THREE.Group(); 
    scene.add(playerMesh);

    const loader = new THREE.GLTFLoader();
    
    // Load the GLB model (ensure the path is correct)
    loader.load('models/spongebob.glb', function(gltf) {
      const model = gltf.scene;
      
      // Adjust the scale if the model is too big or too small
      model.scale.set(1, 1, 1); 
      
      // Enable shadows for the model
      model.traverse(function(child) {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Add the loaded model to the player group
      playerMesh.add(model);

      // Set up the animation mixer
      playerMixer = new THREE.AnimationMixer(model);
      const animations = gltf.animations;

      const idleClip  = THREE.AnimationClip.findByName(animations, 'unnamed.001|spongebob_idle01.anm');
      const runClip   = THREE.AnimationClip.findByName(animations, 'unnamed.001|spongebob_run02.anm');

      idleAction = playerMixer.clipAction(idleClip);
      runAction  = playerMixer.clipAction(runClip);
      
      // Jump sequence clips
      // Jump sequence clips
      const startClip = THREE.AnimationClip.findByName(animations, 'unnamed.001|spongebob_jump02_start.anm');
      const liftClip  = THREE.AnimationClip.findByName(animations, 'unnamed.001|spongebob_jump02_lift_cyc.anm');
      const apexClip  = THREE.AnimationClip.findByName(animations, 'unnamed.001|spongebob_jump02_apex.anm');

      // Setup Jump Sequence (Play each once and hold last frame)
      const setupJumpAction = (clip) => {
        if (!clip) return null;
        const action = playerMixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce); 
        action.clampWhenFinished = true; 
        return action;
      };

      jumpStartAction = setupJumpAction(startClip);
      jumpLiftAction  = setupJumpAction(liftClip);
      jumpApexAction  = setupJumpAction(apexClip);

      // --- CHAINING LOGIC ---
      playerMixer.addEventListener('finished', (e) => {
        if (e.action === jumpStartAction) playNext(jumpLiftAction);
        else if (e.action === jumpLiftAction) playNext(jumpApexAction);
      });

      function playNext(nextAction) {
        if (!nextAction || !currentAction) return;
        currentAction.fadeOut(0.05);
        nextAction.reset().fadeIn(0.05).play();
        currentAction = nextAction;
      }

      // Start with idle
      if (idleAction) {
        idleAction.play();
        currentAction = idleAction;
      }

    }, undefined, function(error) {
      console.error('An error happened while loading the model:', error);
    });

    player = {
      x: 0, y: 0, z: 0,
      angle: 0,
    };
    playerVelY = 0;
    playerOnGround = true;
  }

  function spawnEnemy(index) {
    const side = Math.floor(Math.random() * 4);
    let x, z;
    switch (side) {
      case 0: x = -HALF_WORLD + 2; z = (Math.random() - 0.5) * WORLD_SIZE; break;
      case 1: x = HALF_WORLD - 2;  z = (Math.random() - 0.5) * WORLD_SIZE; break;
      case 2: z = -HALF_WORLD + 2; x = (Math.random() - 0.5) * WORLD_SIZE; break;
      default: z = HALF_WORLD - 2; x = (Math.random() - 0.5) * WORLD_SIZE; break;
    }

    // Create a group to hold both the 3D model and the warning ring
    const enemyGroup = new THREE.Group();
    enemyGroup.position.set(x, 0, z);

    let mixer = null;
    let runAction = null;
    let attackAction = null;
    let currentAction = null;

    if (patrickModel) {
      // Clone the model
      const mesh = THREE.SkeletonUtils.clone(patrickModel);
      
      // --- ORIENTATION OFFSET ---
      // If Patrick's left side is the front, rotate him 90 degrees (PI/2)
      // You might need to try Math.PI / 2 or -Math.PI / 2 depending on the model
      mesh.rotation.y = Math.PI / 2; 
      
      enemyGroup.add(mesh);
      mixer = new THREE.AnimationMixer(mesh);

      const runClip = THREE.AnimationClip.findByName(patrickAnimations, '008_Patrick_Run_v2');
      const attackClip = THREE.AnimationClip.findByName(patrickAnimations, '008_Patrick_LightCombo3_v3');

      if (runClip) runAction = mixer.clipAction(runClip);
      if (attackClip) attackAction = mixer.clipAction(attackClip);

      // Start running animation
      if (runAction) {
        runAction.play();
        currentAction = runAction;
      }
    } else {
      // Fallback: use the old red cylinder if Patrick hasn't loaded
      const mesh = createEnemyMesh(index);
      enemyGroup.add(mesh);
    }
    
    /*
    //used for debugging enemy positions
    // Add a red ring on the floor under each enemy so we can always see them coming!
    const ringGeo = new THREE.RingGeometry(0.5, 0.8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    enemyGroup.add(ring);
    */

    scene.add(enemyGroup);

    enemies.push({
      mesh: enemyGroup, // From now on, we move the entire group together
      x, y: 0, z,
      speed: ENEMY_BASE_SPEED * (0.8 + Math.random() * 0.4) * difficultyMul,
      angle: 0,
      stuckTimer: 0,
      avoidAngle: 0,
      // Animation and attack logic properties
      mixer: mixer,
      runAction: runAction,
      attackAction: attackAction,
      currentAction: currentAction,
      attackCooldown: 0,
      isAttacking: false,
      attackTimer: 0
    });
  }

  function spawnCoin() {
    let x, z;
    let attempts = 0;
    do {
      x = (Math.random() - 0.5) * (WORLD_SIZE - 12);
      z = (Math.random() - 0.5) * (WORLD_SIZE - 12);
      attempts++;
    } while (attempts < 20 && isInsideBuilding(x, z));

    const mesh = createCoinMesh();
    mesh.position.set(x, 1.2, z);
    scene.add(mesh);
    coins.push({ mesh, x, z, collected: false });
  }

  function isInsideBuilding(x, z) {
    for (const b of buildings) {
      if (Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════
  //  Game Loop
  // ═══════════════════════════════════════

  function startGame() {
    overlay.classList.remove('active');
    hudEl.classList.add('visible');
    minimapCanvas.classList.add('visible');

    // Reset state
    gameTime = 0;
    score = 0;
    stamina = STAMINA_MAX;
    nextEnemySpawn = ENEMY_SPAWN_INTERVAL;
    difficultyMul = 1;
    messageTimer = 0;
    lastShoutTime = -2.0;

    // Clean old objects
    enemies.forEach(e => scene.remove(e.mesh));
    enemies = [];
    coins.forEach(c => scene.remove(c.mesh));
    coins = [];
    if (playerMesh) scene.remove(playerMesh);

    buildWorld();
    spawnPlayer();

    if (bgm) {
      bgm.currentTime = 0;
      bgm.play().catch(e => console.log("Audio block:", e));
    }

    for (let i = 0; i < INITIAL_ENEMIES; i++) spawnEnemy(i);
    for (let i = 0; i < COIN_COUNT; i++) spawnCoin();

    hudEnemies.textContent = enemies.length;
    gameRunning = true;
  }

  function gameOver() {
    gameRunning = false;
    hudEl.classList.remove('visible');
    minimapCanvas.classList.remove('visible');

    overlaySub.textContent = 'You got caught! Try again?';
    finalScoreEl.classList.remove('hidden');
    finalScoreVal.textContent = score;
    startBtn.textContent = 'PLAY AGAIN';
    overlay.classList.add('active');

    if (bgm) bgm.pause();
    if (stepSound) stepSound.pause();
  }

  function showMessage(text, duration) {
    hudMessage.textContent = text;
    hudMessage.classList.add('show');
    messageTimer = duration || 2;
  }

  // ═══════════════════════════════════════
  //  Update
  // ═══════════════════════════════════════

  function update(dt) {
    if (!gameRunning) return;

    gameTime += dt;
    score = Math.floor(gameTime * 10);

    // Increase difficulty over time
    difficultyMul = 1 + gameTime / 60; // +100% speed per minute

    // ── Player Movement (camera-relative) ──
    let inputForward = 0, inputRight = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    inputForward += 1;
    if (keys['KeyS'] || keys['ArrowDown'])  inputForward -= 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  inputRight -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) inputRight += 1;

    const moving = inputForward !== 0 || inputRight !== 0;
    const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];

    // Stamina
    if (sprinting && moving && stamina > 0) {
      stamina = Math.max(0, stamina - STAMINA_DRAIN * dt);
    } else {
      stamina = Math.min(STAMINA_MAX, stamina + STAMINA_REGEN * dt);
    }

    const canSprint = sprinting && stamina > 0;
    if (runAction) {
      runAction.timeScale = canSprint ? 2.0 : 1.0;
    }
    const speed = (canSprint ? SPRINT_SPEED : PLAYER_SPEED) * dt;

    // Step sounds logic with speed adjustment
    if (moving && playerOnGround) {
      if (stepSound) {
        // Adjust playback rate based on sprinting state (faster when sprinting, slower when walking)
        stepSound.playbackRate = canSprint ? 1.0 : 0.5;
        
        if (stepSound.paused) stepSound.play();
      }
    } else {
      if (stepSound && !stepSound.paused) stepSound.pause();
    }

    if (moving) {
      // Camera forward direction on XZ plane (from camera towards player)
      const camFwdX = player.x - camera.position.x;
      const camFwdZ = player.z - camera.position.z;
      const camLen = Math.sqrt(camFwdX * camFwdX + camFwdZ * camFwdZ) || 1;
      const fwdX = camFwdX / camLen;
      const fwdZ = camFwdZ / camLen;
      // Right vector (perpendicular to forward)
      const rightX = -fwdZ;
      const rightZ = fwdX;

      // Transform input to world direction
      let moveX = fwdX * inputForward + rightX * inputRight;
      let moveZ = fwdZ * inputForward + rightZ * inputRight;
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= len;
      moveZ /= len;

      const targetAngle = Math.atan2(moveX, moveZ);
      player.angle = lerpAngle(player.angle, targetAngle, 5 * dt);

      let nx = player.x + moveX * speed;
      let nz = player.z + moveZ * speed;

      // Collision with buildings
      const resolved = resolveCollisions(nx, nz, 0.6);
      nx = resolved.x;
      nz = resolved.z;

      // World bounds
      nx = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, nx));
      nz = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, nz));

      player.x = nx;
      player.z = nz;
    }

    // Jump
    if ((keys['Space']) && playerOnGround) {
      playerVelY = JUMP_FORCE;
      playerOnGround = false;

      if (jumpSound) {
        jumpSound.currentTime = 0;
        jumpSound.play();
      }
    }

    // Gravity
    playerVelY -= GRAVITY * dt;
    player.y += playerVelY * dt;
    if (player.y <= 0) {
      player.y = 0;
      playerVelY = 0;
      playerOnGround = true;
    }

    // Update player mesh position and rotation
    playerMesh.position.set(player.x, player.y, player.z);
    playerMesh.rotation.y = player.angle;


    // --- Animation State Detection ---
    const justLanded = (playerOnGround && !wasOnGround);
    if (justLanded && landSound) {
        landSound.currentTime = 0;
        landSound.play();
    }
    wasOnGround = playerOnGround;

    // --- Chained Animation Logic ---
    if (playerMixer && currentAction) {
      const jumpActions = [jumpStartAction, jumpLiftAction, jumpApexAction];
      const isJumping = jumpActions.includes(currentAction);

      if (!playerOnGround) {
        // AIR LOGIC: If we just started falling but aren't in jump sequence, start it
        if (!isJumping && jumpStartAction) {
          currentAction.fadeOut(0.1);
          jumpStartAction.reset().fadeIn(0.1).play();
          currentAction = jumpStartAction;
        }
      } else {
        // GROUND LOGIC: Transition back to Run or Idle
        let targetAction = moving ? runAction : idleAction;
        
        // If we are still in a jump pose while on ground, or need to switch between Run/Idle
        if (isJumping || (targetAction && targetAction !== currentAction)) {
          const duration = justLanded ? 0.1 : 0.2;
          currentAction.fadeOut(duration);
          targetAction.reset().fadeIn(duration).play();
          currentAction = targetAction;
        }
      }
    }


    // Update the 3D model animation
    if (playerMixer) {
      playerMixer.update(dt);
    }

    // ── Enemies Loop ──
    for (const enemy of enemies) {
      // Update animation mixer for this specific enemy
      if (enemy.mixer) enemy.mixer.update(dt);

      // Manage Dash Attack Cooldown
      if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;

      // Manage Dash Attack Duration/State
      if (enemy.attackTimer > 0) {
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          enemy.isAttacking = false;
          // Smoothly crossfade back to running animation
          if (enemy.runAction && enemy.currentAction !== enemy.runAction) {
            if (enemy.currentAction) enemy.currentAction.fadeOut(0.2);
            enemy.runAction.reset().fadeIn(0.2).play();
            enemy.currentAction = enemy.runAction;
          }
        }
      }

      // Calculate vector towards player
      let dx = player.x - enemy.x;
      let dz = player.z - enemy.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // --- RANDOM SHOUT LOGIC (Fully Dynamic) ---
      const shoutRange = 6.0;    
      const shoutCooldown = 2.0; 

      // Check distance and global cooldown
      if (dist < shoutRange && (gameTime - lastShoutTime) >= shoutCooldown) {
          // Verify we actually have sounds loaded in the array
          if (shoutSounds.length > 0) {
              // Pick a random index based on the CURRENT length of the list
              const randomIndex = Math.floor(Math.random() * shoutSounds.length);
              const soundToPlay = shoutSounds[randomIndex];

              // Play only if the sound object exists and is loaded
              if (soundToPlay) {
                  soundToPlay.currentTime = 0;
                  soundToPlay.play().catch(e => console.log("Audio playback blocked or failed:", e));
                  
                  // Update the global cooldown timer
                  lastShoutTime = gameTime;
              }
          }
      }
      // ------------------------------------------

      if (dist > 0.1) {
        dx /= dist;
        dz /= dist;
      }

      // Obstacle avoidance (nudge vector away from buildings)
      let avoidX = 0, avoidZ = 0;
      for (const b of buildings) {
        const bx = enemy.x - b.x;
        const bz = enemy.z - b.z;
        const bdist = Math.sqrt(bx * bx + bz * bz);
        if (bdist < b.hw + 3) {
          avoidX += bx / (bdist * bdist + 0.5) * 5;
          avoidZ += bz / (bdist * bdist + 0.5) * 5;
        }
      }

      // Trigger Dash Attack if within range and cooldown is ready
      const attackRange = 8.0; 
      if (dist < attackRange && enemy.attackCooldown <= 0 && !enemy.isAttacking) {
        enemy.isAttacking = true;
        enemy.attackCooldown = 4.0; // Cooldown in seconds
        enemy.attackTimer = 1.0;    // Dash duration in seconds

        if (enemy.attackAction && enemy.currentAction !== enemy.attackAction) {
          if (enemy.currentAction) enemy.currentAction.fadeOut(0.1);
          enemy.attackAction.reset().fadeIn(0.1).play();
          enemy.currentAction = enemy.attackAction;
        }
      }

      // Store current position to calculate actual movement direction
      const prevX = enemy.x, prevZ = enemy.z;

      // Calculate speed (boost by 2.5x during dash attack)
      let eSpeed = enemy.speed * Math.min(difficultyMul, 3) * dt;
      if (enemy.isAttacking) eSpeed *= 2.5; 

      // Apply movement with avoidance nudge
      let ex = enemy.x + (dx + avoidX * 0.3) * eSpeed;
      let ez = enemy.z + (dz + avoidZ * 0.3) * eSpeed;

      // Collisions and boundaries
      const eResolved = resolveCollisions(ex, ez, 0.6);
      ex = eResolved.x;
      ez = eResolved.z;
      ex = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, ex));
      ez = Math.max(-HALF_WORLD + 1, Math.min(HALF_WORLD - 1, ez));

      // Handling "Stuck" enemies
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

      // --- ROTATION LOGIC ---
      // Determine rotation based on actual displacement vector
      const actualMoveX = ex - prevX;
      const actualMoveZ = ez - prevZ;

      if (Math.abs(actualMoveX) > 0.001 || Math.abs(actualMoveZ) > 0.001) {
          const targetAngle = Math.atan2(actualMoveX, actualMoveZ);
          // Smoothly interpolate current angle towards the target movement angle
          enemy.angle = lerpAngle(enemy.angle, targetAngle, 10 * dt);
      }

      // Apply new position and rotation to the mesh/group
      enemy.x = ex;
      enemy.z = ez;
      enemy.mesh.position.set(enemy.x, 0, enemy.z);
      enemy.mesh.rotation.y = enemy.angle;

      // Catch check (Collision with player)
      const catchDx = player.x - enemy.x;
      const catchDz = player.z - enemy.z;
      const catchDist = Math.sqrt(catchDx * catchDx + catchDz * catchDz);
      if (catchDist < ENEMY_CATCH_DIST && Math.abs(player.y) < 1.5) {
        gameOver();
        return;
      }
    }

    // ── Spawn more enemies over time ──
    nextEnemySpawn -= dt;
    if (nextEnemySpawn <= 0 && enemies.length < MAX_ENEMIES) {
      spawnEnemy(enemies.length);
      nextEnemySpawn = Math.max(4, ENEMY_SPAWN_INTERVAL - gameTime / 10);
      hudEnemies.textContent = enemies.length;
      showMessage('⚠ NEW ENEMY!', 2);
    }

    // ── Coins ──
    for (const coin of coins) {
      if (coin.collected) continue;
      // Float and rotate
      coin.mesh.position.y = 1.2 + Math.sin(gameTime * 3 + coin.x) * 0.3;
      coin.mesh.rotation.y += dt * 3;

      // Pickup check
      const cdx = player.x - coin.x;
      const cdz = player.z - coin.z;
      if (Math.sqrt(cdx * cdx + cdz * cdz) < 1.5) {
        coin.collected = true;
        scene.remove(coin.mesh);
        score += 100;
        // Respawn coin elsewhere
        setTimeout(() => {
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
        }, 3000);
      }
    }

    // ── Camera ──
    updateCamera(dt);

    // ── HUD ──
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    hudTime.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    hudScore.textContent = score;

    staminaFill.style.width = (stamina / STAMINA_MAX * 100) + '%';
    staminaFill.classList.toggle('low', stamina < 25);

    // Message timer
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) {
        hudMessage.classList.remove('show');
      }
    }
  }

  function resolveCollisions(x, z, radius) {
    for (const b of buildings) {
      // AABB collision
      const closestX = Math.max(b.x - b.hw, Math.min(x, b.x + b.hw));
      const closestZ = Math.max(b.z - b.hd, Math.min(z, b.z + b.hd));
      const dx = x - closestX;
      const dz = z - closestZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < radius) {
        if (dist === 0) {
          // Inside building, push out
          x = b.x + b.hw + radius;
        } else {
          const push = radius - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        }
      }
    }

    // Tree collision
    for (const t of trees) {
      const dx = x - t.x;
      const dz = z - t.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < t.r + radius) {
        const push = t.r + radius - dist;
        if (dist > 0.01) {
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        }
      }
    }

    return { x, z };
  }

  function updateCamera(dt) {
    // Q = raise POV, E = lower POV
    if (keys['KeyQ']) cameraHeight = Math.min(CAMERA_HEIGHT_MAX, cameraHeight + CAMERA_HEIGHT_SPEED * dt);
    if (keys['KeyE']) cameraHeight = Math.max(CAMERA_HEIGHT_MIN, cameraHeight - CAMERA_HEIGHT_SPEED * dt);

    // Third-person camera behind and above player
    const idealOffset = new THREE.Vector3(
      -Math.sin(player.angle) * CAMERA_DIST,
      cameraHeight,
      -Math.cos(player.angle) * CAMERA_DIST
    );
    const idealTarget = new THREE.Vector3(player.x, player.y + 2, player.z);
    const idealPos = idealTarget.clone().add(idealOffset);

    camera.position.lerp(idealPos, CAMERA_LERP * dt);
    const lookTarget = new THREE.Vector3(player.x, player.y + 1.5, player.z);
    camera.lookAt(lookTarget);
  }

  // ═══════════════════════════════════════
  //  Minimap
  // ═══════════════════════════════════════

  function drawMinimap() {
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const ctx = minimapCtx;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
    ctx.fillRect(0, 0, w, h);

    const scale = w / WORLD_SIZE;
    const oX = w / 2;
    const oZ = h / 2;

    const toMapX = (x) => oX + x * scale;
    const toMapZ = (z) => oZ + z * scale;

    // Buildings
    ctx.fillStyle = '#334466';
    for (const b of buildings) {
      const bx = toMapX(b.x) - b.hw * scale;
      const bz = toMapZ(b.z) - b.hd * scale;
      ctx.fillRect(bx, bz, b.hw * 2 * scale, b.hd * 2 * scale);
    }

    // Coins
    ctx.fillStyle = '#ffdd00';
    for (const c of coins) {
      if (c.collected) continue;
      ctx.beginPath();
      ctx.arc(toMapX(c.x), toMapZ(c.z), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies
    ctx.fillStyle = '#ff2244';
    for (const e of enemies) {
      ctx.beginPath();
      ctx.arc(toMapX(e.x), toMapZ(e.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player
    ctx.fillStyle = '#00ddff';
    ctx.beginPath();
    ctx.arc(toMapX(player.x), toMapZ(player.z), 4, 0, Math.PI * 2);
    ctx.fill();

    // Player direction indicator
    ctx.strokeStyle = '#00ddff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toMapX(player.x), toMapZ(player.z));
    ctx.lineTo(
      toMapX(player.x) + Math.sin(player.angle) * 8,
      toMapZ(player.z) + Math.cos(player.angle) * 8
    );
    ctx.stroke();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }

  // ═══════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════

  function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * Math.min(1, t);
  }

  // ═══════════════════════════════════════
  //  Input
  // ═══════════════════════════════════════

  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    // Prevent scrolling
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Lose focus → release all keys
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });

  // ═══════════════════════════════════════
  //  Main Loop
  // ═══════════════════════════════════════

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05); // Cap delta time

    update(dt);

    if (gameRunning) {
      drawMinimap();
    }

    renderer.render(scene, camera);
  }

  // ═══════════════════════════════════════
  //  Boot
  // ═══════════════════════════════════════

  startBtn.addEventListener('click', () => {
    startGame();
  });


  // Load Patrick model for enemies
  const enemyLoader = new THREE.GLTFLoader();
  enemyLoader.load('models/patrick.glb', function(gltf) {
    patrickModel = gltf.scene;
    patrickAnimations = gltf.animations;
    
    // --- SCALE ADJUSTMENT ---
    // Start with 1, 1, 1. If he's invisible, we will check the console log below.
    patrickModel.scale.set(220, 220, 220); 

    // DEBUG: Measure the actual size of the model in world units
    const bbox = new THREE.Box3().setFromObject(patrickModel);
    const size = bbox.getSize(new THREE.Vector3());
    console.log("Patrick's actual size in world units:", size);
    
    // Enable shadows and fix visibility/brightness
    patrickModel.traverse(function(child) {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (child.material) {
            child.material.depthWrite = true;
            child.material.transparent = false;
            child.material.opacity = 1;

            // --- ADD THESE LINES TO MAKE HIM BRIGHTER ---
            child.material.emissive = new THREE.Color(0xffffff); // White emissive light
            child.material.emissiveIntensity = 0.2;            // Adjust between 0.1 to 0.5 for brightness
        }
      }
    });

    console.log("=== Patrick Animations ===");
    patrickAnimations.forEach((clip, index) => {
       console.log(index + ": " + clip.name);
    });
  });

  // Load Mr. Krabs model to find animation names
  const krabsLoader = new THREE.GLTFLoader();
  krabsLoader.load('models/mr_krabs.glb', function(gltf) {
    const krabsAnimations = gltf.animations;
    
    console.log("=== Mr. Krabs Animations ===");
    krabsAnimations.forEach((clip, index) => {
       console.log(index + ": " + clip.name);
    });
  }, undefined, function(error) {
    console.error('Error loading Mr. Krabs model:', error);
  });

  initThree();
  buildWorld();   // Show background on start screen
  animate();

})();
