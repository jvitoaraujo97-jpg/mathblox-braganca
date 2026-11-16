import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import { animateAvatarRig, AvatarRig, createAvatarRig } from '../game/avatarBuilder';
import {
  createAnswerPadTexture,
  createLavaTexture,
  createQuestionSignTexture,
  createStudTexture,
} from '../game/textures';
import { GameHUDState, LevelData, PlatformDef, StudentProfile, TrapFeedback } from '../types/game';
import { MobileInputState } from './MobileControls';

interface ObbyCanvasProps {
  level: LevelData;
  student: StudentProfile;
  mobileInputRef: React.MutableRefObject<MobileInputState>;
  rotateCameraSignal: number;
  paused: boolean;
  onHudUpdate: (hud: GameHUDState) => void;
  onTrapTriggered: (trap: TrapFeedback) => void;
  onProgressEvent: (delta: {
    xpGain: number;
    coinsGain: number;
    answeredDelta: number;
    correctDelta: number;
    streak: number;
  }) => void;
  onVictory: (summary: {
    sessionXp: number;
    sessionCoins: number;
    sessionAnswered: number;
    sessionCorrect: number;
    bestStreak: number;
  }) => void;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

// Pre-allocated math helpers outside the render loop (zero GC)
const _camTarget = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

interface ParticleItem {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export function ObbyCanvas({
  level,
  student,
  mobileInputRef,
  rotateCameraSignal,
  paused,
  onHudUpdate,
  onTrapTriggered,
  onProgressEvent,
  onVictory,
}: ObbyCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [contextLost, setContextLost] = useState(false);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const callbacksRef = useRef({
    onHudUpdate,
    onTrapTriggered,
    onProgressEvent,
    onVictory,
  });
  callbacksRef.current = {
    onHudUpdate,
    onTrapTriggered,
    onProgressEvent,
    onVictory,
  };

  const cameraYawTargetRef = useRef(0);

  useEffect(() => {
    if (rotateCameraSignal > 0) {
      cameraYawTargetRef.current += Math.PI / 2;
    }
  }, [rotateCameraSignal]);

  useEffect(() => {
    soundEngine.startBgm('tower');
    return () => {
      soundEngine.setTowerIntensity(false);
    };
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(level.world.skyColor);
    scene.fog = new THREE.Fog(level.world.fogColor, 48, 175);

    const camera = new THREE.PerspectiveCamera(62, width / height, 0.2, 260);
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Studio Environment Reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.78);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
    keyLight.position.set(18, 36, 22);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 110;
    const d = 32;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);

    // 1.4. Mirante do Caeté e Ilhas Costeiras: Mar/Rio Animado ao Fundo + Canal de Lava Central
    const coastalSeaMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0d9488,
      emissiveIntensity: 0.28,
      roughness: 0.2,
      metalness: 0.35,
    });
    const coastalSea = new THREE.Mesh(new THREE.PlaneGeometry(640, 880), coastalSeaMat);
    coastalSea.rotation.x = -Math.PI / 2;
    coastalSea.position.set(0, -8.2, -220);
    scene.add(coastalSea);

    // Animated Lava Channel directly beneath the Parkour Tower
    const lavaTex = createLavaTexture(maxAniso);
    const lavaMat = new THREE.MeshStandardMaterial({
      map: lavaTex,
      emissive: new THREE.Color(level.world.lavaColor),
      emissiveMap: lavaTex,
      emissiveIntensity: 0.95,
      roughness: 0.7,
      metalness: 0.05,
    });
    const lavaFloor = new THREE.Mesh(new THREE.PlaneGeometry(34, 700), lavaMat);
    lavaFloor.rotation.x = -Math.PI / 2;
    lavaFloor.position.set(0, -7.5, -200);
    scene.add(lavaFloor);

    // Ilhas Costeiras Arenosas com Palmeiras e Barcos Regionais no Horizonte
    const sandIslandMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.8 });
    const grassCapMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.65 });
    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const palmFrondMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5 });

    for (let isl = 0; isl < 14; isl++) {
      const side = isl % 2 === 0 ? -1 : 1;
      const ix = side * (36 + (isl % 3) * 16);
      const iz = 10 - isl * 34;
      const ig = new THREE.Group();
      ig.position.set(ix, -8.1, iz);

      const sandBase = new THREE.Mesh(
        new THREE.CylinderGeometry(8.5, 11.5, 2.2, 9),
        sandIslandMat
      );
      sandBase.position.y = 1.1;
      const turf = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 8.2, 1.2, 9), grassCapMat);
      turf.position.y = 2.4;
      ig.add(sandBase, turf);

      for (let t = -1; t <= 1; t += 2) {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.4, 4.6, 7),
          palmTrunkMat
        );
        trunk.position.set(t * 2.4, 4.8, (t > 0 ? 1 : -1) * 1.2);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.5, 7), palmFrondMat);
        crown.position.set(t * 2.4, 7.3, (t > 0 ? 1 : -1) * 1.2);
        ig.add(trunk, crown);
      }
      scene.add(ig);
    }

    const horizonBoats: { group: THREE.Group; speed: number; phase: number }[] = [];
    const boatColors = [0x2563eb, 0xdc2626, 0xf59e0b, 0x10b981];
    const cabinWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    for (let b = 0; b < 10; b++) {
      const bg = new THREE.Group();
      const side = b % 2 === 0 ? -1 : 1;
      const hullMat = new THREE.MeshStandardMaterial({
        color: boatColors[b % boatColors.length],
        roughness: 0.45,
      });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 5.8), hullMat);
      hull.position.y = 0.3;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 2.8), cabinWhite);
      cabin.position.y = 1.15;
      bg.add(hull, cabin);
      bg.position.set(side * (24 + (b % 3) * 10), -8.0, -b * 45);
      scene.add(bg);
      horizonBoats.push({
        group: bg,
        speed: (b % 2 === 0 ? -1 : 1) * (1.8 + (b % 3) * 0.7),
        phase: b * 1.3,
      });
    }

    // Floating Cubic Clouds
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
    });
    const cloudClusters: { group: THREE.Group; speed: number }[] = [];
    for (let i = 0; i < 18; i++) {
      const cg = new THREE.Group();
      const puffs = 2 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(6 + p * 2.5, 2.2 + (p % 2) * 1.1, 4.5 + p * 1.5),
          cloudMat
        );
        block.position.set(p * 3.2 - 3, (p % 2) * 0.8, (p % 2) * 1.2);
        cg.add(block);
      }
      const side = i % 2 === 0 ? 1 : -1;
      cg.position.set(side * (24 + (i % 4) * 12), 14 + (i % 6) * 6, -i * 24 + 15);
      cloudGroup.add(cg);
      cloudClusters.push({ group: cg, speed: 0.4 + (i % 3) * 0.25 });
    }
    scene.add(cloudGroup);

    // Clone mutable platform & coin states
    const platforms: PlatformDef[] = level.platforms.map((p) => ({ ...p }));
    const coins = level.coins.map((c) => ({ ...c }));

    const platformMeshes = new Map<string, THREE.Mesh>();
    const platformOrigin = new Map<string, { x: number; y: number; z: number }>();
    const bridgeMeshes = new Map<number, THREE.Mesh[]>();
    const checkpointBeacons: THREE.Mesh[] = [];

    // Build Platforms
    for (const p of platforms) {
      platformOrigin.set(p.id, { x: p.x, y: p.y, z: p.z });
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      let mat: THREE.Material | THREE.Material[];

      if (p.kind === 'answer' && p.answerLetter && p.answerLabel) {
        const topTex = createAnswerPadTexture(p.answerLetter, p.answerLabel, p.color, maxAniso);
        const sideTex = createStudTexture(p.color, maxAniso, 1, 1);
        const sideMat = new THREE.MeshStandardMaterial({
          map: sideTex,
          roughness: 0.45,
          metalness: 0.08,
        });
        const topMat = new THREE.MeshStandardMaterial({
          map: topTex,
          roughness: 0.32,
          metalness: 0.05,
        });
        // +X, -X, +Y (top), -Y, +Z (front facing player), -Z
        mat = [sideMat, sideMat, topMat, sideMat, topMat, sideMat];
      } else if (p.kind === 'bridge' || p.kind === 'jumppad') {
        const studTex = createStudTexture(p.color, maxAniso, Math.max(1, p.w / 2), Math.max(1, p.d / 2));
        mat = new THREE.MeshStandardMaterial({
          map: studTex,
          color: p.kind === 'jumppad' ? 0x22d3ee : 0x10b981,
          emissive: p.kind === 'jumppad' ? 0x06b6d4 : 0x059669,
          emissiveIntensity: 0.15,
          transparent: true,
          opacity: 0.22,
          roughness: 0.35,
          metalness: 0.15,
        });
      } else {
        const studTex = createStudTexture(
          p.color,
          maxAniso,
          Math.max(1, p.w / 2),
          Math.max(1, p.d / 2)
        );
        mat = new THREE.MeshStandardMaterial({
          map: studTex,
          roughness: 0.5,
          metalness: 0.08,
        });
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.castShadow = !isSoftwareGl;
      mesh.receiveShadow = true;
      scene.add(mesh);
      platformMeshes.set(p.id, mesh);

      if (p.unlockOnStage !== undefined) {
        const list = bridgeMeshes.get(p.unlockOnStage) || [];
        list.push(mesh);
        bridgeMeshes.set(p.unlockOnStage, list);
      }

      // Checkpoint flagpole beacon
      if (p.kind === 'checkpoint') {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 2.8, 10),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.25 })
        );
        pole.position.set(p.x - p.w / 2 + 0.5, p.y + p.h / 2 + 1.4, p.z);
        scene.add(pole);

        const beacon = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.55, 0.14),
          new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            emissive: 0x16a34a,
            emissiveIntensity: 0.55,
            roughness: 0.3,
          })
        );
        beacon.position.set(p.x - p.w / 2 + 0.95, p.y + p.h / 2 + 2.45, p.z);
        scene.add(beacon);
        checkpointBeacons.push(beacon);
      }

      // Finish Victory Trophy
      if (p.kind === 'finish') {
        const trophyGroup = new THREE.Group();
        trophyGroup.position.set(p.x, p.y + p.h / 2 + 0.1, p.z);
        const goldMat = new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          roughness: 0.18,
          metalness: 0.88,
          emissive: 0xca8a04,
          emissiveIntensity: 0.25,
        });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.45, 18), goldMat);
        base.position.y = 0.22;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 1.1, 14), goldMat);
        stem.position.y = 0.95;
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.45, 1.3, 18), goldMat);
        cup.position.y = 2.05;
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), goldMat);
        star.position.y = 3.2;
        trophyGroup.add(base, stem, cup, star);
        scene.add(trophyGroup);
        checkpointBeacons.push(star);
      }
    }

    // Build 3D Question Totem Signs
    const signEntities: {
      z: number;
      y: number;
      stageIndex: number;
      group: THREE.Group;
      materials: THREE.MeshStandardMaterial[];
      currentOpacity: number;
    }[] = [];

    for (const sign of level.signs) {
      const signGroup = new THREE.Group();
      signGroup.position.set(sign.x, sign.y, sign.z);

      const qTex = createQuestionSignTexture(
        sign.stageIndex + 1,
        level.questions.length,
        sign.topic,
        sign.prompt,
        level.world.accentColor
      );

      const boardMaterials: THREE.MeshStandardMaterial[] = [
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, transparent: true }),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, transparent: true }),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, transparent: true }),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, transparent: true }),
        new THREE.MeshStandardMaterial({
          map: qTex,
          roughness: 0.35,
          metalness: 0.05,
          transparent: true,
        }),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, transparent: true }),
      ];

      const board = new THREE.Mesh(new THREE.BoxGeometry(8.6, 4.3, 0.35), boardMaterials);
      board.castShadow = !isSoftwareGl;
      signGroup.add(board);

      // Supporting pillars down to Arena
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.4,
        metalness: 0.5,
        transparent: true,
      });
      const leftPillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 4.4, 10),
        pillarMat
      );
      leftPillar.position.set(-3.8, -2.2, 0);
      const rightPillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 4.4, 10),
        pillarMat
      );
      rightPillar.position.set(3.8, -2.2, 0);
      signGroup.add(leftPillar, rightPillar);

      scene.add(signGroup);
      signEntities.push({
        z: sign.z,
        y: sign.y,
        stageIndex: sign.stageIndex,
        group: signGroup,
        materials: [...boardMaterials, pillarMat],
        currentOpacity: 1,
      });
    }

    // Build Collectible BloxCoins
    const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.16, 16);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xeab308,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.85,
    });
    const coinMeshes = new Map<string, THREE.Mesh>();
    for (const c of coins) {
      const m = new THREE.Mesh(coinGeo, coinMat);
      m.position.set(c.x, c.y, c.z);
      scene.add(m);
      coinMeshes.set(c.id, m);
    }

    // Build R6 Avatar
    const avatarRig: AvatarRig = createAvatarRig(
      student.avatarColor,
      student.equippedHat,
      student.equippedJersey
    );
    scene.add(avatarRig.root);

    // Particle Pool
    const particles: ParticleItem[] = [];
    const particleGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const spawnBurst = (x: number, y: number, z: number, colorHex: number, count: number) => {
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.6,
        roughness: 0.3,
      });
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(particleGeo, mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        particles.push({
          mesh,
          vx: (Math.random() - 0.5) * 7,
          vy: 2 + Math.random() * 6,
          vz: (Math.random() - 0.5) * 7,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.35,
        });
      }
    };

    // Physics State
    const GRAVITY = -28.0;
    const JUMP_VEL = 11.5;
    const JUMPPAD_VEL = 18.8;
    const BASE_SPEED = 7.5;
    const BOOST_SPEED = 10.5;
    const COYOTE_MAX = 0.12;
    const BUFFER_MAX = 0.12;
    const HALF_W = 0.4;
    const HALF_D = 0.4;
    const AVATAR_H = 2.4;

    const startCp = level.stageCheckpoints[0];
    let activeCheckpoint = { x: startCp.x, y: startCp.y + 0.1, z: startCp.z, stageIndex: 0 };

    const pos = { x: activeCheckpoint.x, y: activeCheckpoint.y, z: activeCheckpoint.z };
    const vel = { x: 0, y: 0, z: 0 };
    let isGrounded = false;
    let coyoteTimer = 0;
    let jumpBufferTimer = 0;
    let standingPlatformId: string | null = null;
    const prevPlatformPos = new Map<string, { x: number; y: number; z: number }>();
    for (const p of platforms) {
      prevPlatformPos.set(p.id, { x: p.x, y: p.y, z: p.z });
    }

    // Gameplay Session State
    let currentStage = 0;
    let streak = 0;
    let bestStreakSession = 0;
    let speedBoostTimer = 0;
    let sessionXp = 0;
    let sessionCoins = 0;
    let sessionAnswered = 0;
    let sessionCorrect = 0;
    const completedStages = new Set<number>();
    let victoryTriggered = false;
    let pendingTrap: TrapFeedback | null = null;
    let trailTimer = 0;
    let lastHudEmit = 0;

    // Camera State
    let cameraYaw = 0;
    let cameraPitch = 0.42;
    const CAM_DIST = 9.8;

    // Input Tracking (Keyboard + Pointer Drag for Camera)
    const keys = new Set<string>();
    let prevJumpDown = false;
    let draggingCam = false;
    let camPointerId: number | null = null;
    let lastCamX = 0;
    let lastCamY = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'Space') {
        jumpBufferTimer = BUFFER_MAX;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };

    const onCanvasPointerDown = (e: PointerEvent) => {
      if (camPointerId !== null) return;
      camPointerId = e.pointerId;
      draggingCam = true;
      lastCamX = e.clientX;
      lastCamY = e.clientY;
    };
    const onCanvasPointerMove = (e: PointerEvent) => {
      if (!draggingCam || e.pointerId !== camPointerId) return;
      const dx = e.clientX - lastCamX;
      const dy = e.clientY - lastCamY;
      lastCamX = e.clientX;
      lastCamY = e.clientY;
      cameraYawTargetRef.current -= dx * 0.0065;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.005, 0.14, 1.08);
    };
    const onCanvasPointerUp = (e: PointerEvent) => {
      if (e.pointerId === camPointerId) {
        draggingCam = false;
        camPointerId = null;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
    window.addEventListener('pointermove', onCanvasPointerMove);
    window.addEventListener('pointerup', onCanvasPointerUp);
    window.addEventListener('pointercancel', onCanvasPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Helper to respawn player at activeCheckpoint
    const respawnAtCheckpoint = () => {
      pos.x = activeCheckpoint.x;
      pos.y = activeCheckpoint.y + 0.25;
      pos.z = activeCheckpoint.z;
      vel.x = 0;
      vel.y = 0;
      vel.z = 0;
      isGrounded = false;
      coyoteTimer = 0;
      standingPlatformId = null;
    };

    const emitHud = (force = false, elapsed = 0) => {
      if (!force && elapsed - lastHudEmit < 0.08) return;
      lastHudEmit = elapsed;
      const activeQuestion =
        level.questions[Math.min(currentStage, level.questions.length - 1)] || null;
      callbacksRef.current.onHudUpdate({
        currentStage,
        totalStages: level.questions.length,
        streak,
        speedBoostLeft: Math.max(0, speedBoostTimer),
        sessionXp,
        sessionCoins,
        sessionAnswered,
        sessionCorrect,
        activeQuestion,
        completedStages: Array.from(completedStages),
        victory: victoryTriggered,
      });
    };

    emitHud(true, 0);

    // Pre-warm shaders on GPU devices
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;

      const delta = Math.min(clock.getDelta(), 0.045);
      const elapsed = clock.getElapsedTime();

      // Animate lava & clouds regardless of pause
      lavaTex.offset.x = (elapsed * 0.03) % 1;
      lavaTex.offset.y = (elapsed * 0.02) % 1;
      lavaMat.emissiveIntensity = 0.85 + Math.sin(elapsed * 2.2) * 0.18;

      for (const c of cloudClusters) {
        c.group.position.x += c.speed * delta * 0.6;
        if (c.group.position.x > 75) c.group.position.x = -75;
      }

      for (const hb of horizonBoats) {
        hb.group.position.z += hb.speed * delta;
        hb.group.position.y = -8.0 + Math.sin(elapsed * 2.3 + hb.phase) * 0.14;
      }

      soundEngine.setTowerIntensity(currentStage >= 7);

      for (const b of checkpointBeacons) {
        b.rotation.y += delta * 1.8;
      }

      // Spin coins
      for (const c of coins) {
        if (c.collected) continue;
        const cm = coinMeshes.get(c.id);
        if (cm) {
          cm.rotation.y += delta * 2.8;
          cm.position.y = c.y + Math.sin(elapsed * 3.2 + c.z) * 0.18;
        }
      }

      if (!pausedRef.current && !victoryTriggered) {
        // 1. Update Moving Platforms
        for (const p of platforms) {
          const prev = prevPlatformPos.get(p.id)!;
          prev.x = p.x;
          prev.y = p.y;
          prev.z = p.z;

          if (p.kind === 'moving' && p.moveAxis && p.moveRange && p.moveSpeed) {
            const origin = platformOrigin.get(p.id)!;
            const offset = Math.sin(elapsed * p.moveSpeed + (p.movePhase || 0)) * p.moveRange;
            if (p.moveAxis === 'x') p.x = origin.x + offset;
            if (p.moveAxis === 'y') p.y = origin.y + offset;
            if (p.moveAxis === 'z') p.z = origin.z + offset;
            const mesh = platformMeshes.get(p.id);
            if (mesh) mesh.position.set(p.x, p.y, p.z);
          }
        }

        // Carry player with standing moving platform
        if (isGrounded && standingPlatformId) {
          const sp = platforms.find((pl) => pl.id === standingPlatformId);
          const prev = prevPlatformPos.get(standingPlatformId);
          if (sp && prev) {
            pos.x += sp.x - prev.x;
            pos.y += sp.y - prev.y;
            pos.z += sp.z - prev.z;
          }
        }

        // 2. Read Inputs (Keyboard + Virtual Joystick)
        let inputX = mobileInputRef.current.moveX;
        let inputY = mobileInputRef.current.moveY; // +1 forward

        if (keys.has('KeyA') || keys.has('ArrowLeft')) inputX -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) inputX += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) inputY += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) inputY -= 1;

        const inputMag = Math.hypot(inputX, inputY);
        if (inputMag > 1) {
          inputX /= inputMag;
          inputY /= inputMag;
        }

        const jumpTouchDown = mobileInputRef.current.jumpPressed;
        if (jumpTouchDown && !prevJumpDown) {
          jumpBufferTimer = BUFFER_MAX;
        }
        prevJumpDown = jumpTouchDown;

        // Smooth camera yaw
        cameraYaw = THREE.MathUtils.damp(cameraYaw, cameraYawTargetRef.current, 12, delta);

        // Compute world movement vector relative to cameraYaw
        if (speedBoostTimer > 0) speedBoostTimer = Math.max(0, speedBoostTimer - delta);
        const currentSpeed = speedBoostTimer > 0 ? BOOST_SPEED : BASE_SPEED;

        const sinY = Math.sin(cameraYaw);
        const cosY = Math.cos(cameraYaw);
        // Forward in world is (-sinY, -cosY), Right is (cosY, -sinY)
        const worldVx = (inputX * cosY - inputY * sinY) * currentSpeed;
        const worldVz = (-inputX * sinY - inputY * cosY) * currentSpeed;

        vel.x = THREE.MathUtils.damp(vel.x, worldVx, 16, delta);
        vel.z = THREE.MathUtils.damp(vel.z, worldVz, 16, delta);

        // Rotate avatar to face movement direction
        const horizSpeed = Math.hypot(vel.x, vel.z);
        if (horizSpeed > 0.6) {
          const targetAngle = Math.atan2(vel.x, vel.z);
          // Shortest angular interpolation
          let diff = targetAngle - avatarRig.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          avatarRig.root.rotation.y += diff * Math.min(1, delta * 14);
        }

        // 3. Coyote Time & Jump Buffer
        if (isGrounded) coyoteTimer = COYOTE_MAX;
        else coyoteTimer = Math.max(0, coyoteTimer - delta);

        if (jumpBufferTimer > 0) jumpBufferTimer = Math.max(0, jumpBufferTimer - delta);

        if (jumpBufferTimer > 0 && coyoteTimer > 0) {
          vel.y = JUMP_VEL;
          isGrounded = false;
          coyoteTimer = 0;
          jumpBufferTimer = 0;
          standingPlatformId = null;
          soundEngine.playJump();
        }

        // Apply Gravity
        vel.y += GRAVITY * delta;
        if (vel.y < -36) vel.y = -36;

        // 4. Axis-Separated AABB Physics Resolution
        // Y axis
        pos.y += vel.y * delta;
        isGrounded = false;
        standingPlatformId = null;

        for (const p of platforms) {
          if (!p.solid) continue;
          const overlapX = pos.x + HALF_W > p.x - p.w / 2 && pos.x - HALF_W < p.x + p.w / 2;
          const overlapZ = pos.z + HALF_D > p.z - p.d / 2 && pos.z - HALF_D < p.z + p.d / 2;
          if (!overlapX || !overlapZ) continue;

          const pTop = p.y + p.h / 2;
          const pBottom = p.y - p.h / 2;

          if (vel.y <= 0 && pos.y <= pTop + 0.08 && pos.y >= pTop - 0.85) {
            pos.y = pTop;
            vel.y = 0;
            isGrounded = true;
            standingPlatformId = p.id;
          } else if (vel.y > 0 && pos.y + AVATAR_H >= pBottom && pos.y + AVATAR_H <= pBottom + 0.6) {
            pos.y = pBottom - AVATAR_H;
            vel.y = 0;
          }
        }

        // X axis
        pos.x += vel.x * delta;
        for (const p of platforms) {
          if (!p.solid) continue;
          const pTop = p.y + p.h / 2;
          const pBottom = p.y - p.h / 2;
          if (pos.y >= pTop - 0.12 || pos.y + AVATAR_H <= pBottom + 0.05) continue;
          const overlapZ = pos.z + HALF_D > p.z - p.d / 2 && pos.z - HALF_D < p.z + p.d / 2;
          if (!overlapZ) continue;

          const pLeft = p.x - p.w / 2;
          const pRight = p.x + p.w / 2;
          if (pos.x + HALF_W > pLeft && pos.x - HALF_W < pRight) {
            if (vel.x > 0) pos.x = pLeft - HALF_W;
            else if (vel.x < 0) pos.x = pRight + HALF_W;
            vel.x = 0;
          }
        }

        // Z axis
        pos.z += vel.z * delta;
        for (const p of platforms) {
          if (!p.solid) continue;
          const pTop = p.y + p.h / 2;
          const pBottom = p.y - p.h / 2;
          if (pos.y >= pTop - 0.12 || pos.y + AVATAR_H <= pBottom + 0.05) continue;
          const overlapX = pos.x + HALF_W > p.x - p.w / 2 && pos.x - HALF_W < p.x + p.w / 2;
          if (!overlapX) continue;

          const pFront = p.z + p.d / 2;
          const pBack = p.z - p.d / 2;
          if (pos.z + HALF_D > pBack && pos.z - HALF_D < pFront) {
            if (vel.z > 0) pos.z = pBack - HALF_D;
            else if (vel.z < 0) pos.z = pFront + HALF_D;
            vel.z = 0;
          }
        }

        // 5. Platform Triggers (Checkpoints, Arena, Answer Pads, Jump Pads, Finish)
        if (standingPlatformId) {
          const stood = platforms.find((pl) => pl.id === standingPlatformId);
          if (stood) {
            // Update current stage view
            if (stood.stageIndex < level.questions.length) {
              currentStage = Math.max(currentStage, stood.stageIndex);
            }

            // Checkpoint or Arena updates respawn point safely
            if (stood.kind === 'checkpoint' || stood.kind === 'arena') {
              const targetY = stood.y + stood.h / 2 + 0.1;
              if (
                stood.stageIndex > activeCheckpoint.stageIndex ||
                (stood.stageIndex === activeCheckpoint.stageIndex && stood.kind === 'arena')
              ) {
                const isNewStageCp = stood.stageIndex > activeCheckpoint.stageIndex;
                activeCheckpoint = {
                  x: stood.x,
                  y: targetY,
                  z: stood.z,
                  stageIndex: stood.stageIndex,
                };
                if (isNewStageCp) {
                  soundEngine.playCheckpoint();
                  spawnBurst(pos.x, pos.y + 0.8, pos.z, 0x22c55e, 10);
                }
              }
            }

            // Jump Pad Launch
            if (stood.kind === 'jumppad') {
              vel.y = JUMPPAD_VEL;
              vel.z = -7.2; // Gentle forward carry toward next stage checkpoint
              isGrounded = false;
              standingPlatformId = null;
              soundEngine.playJumpPad();
              spawnBurst(pos.x, pos.y + 0.3, pos.z, 0x22d3ee, 14);
            }

            // Answer Bridge Choice!
            if (stood.kind === 'answer' && !stood.triggered) {
              const q = level.questions[stood.stageIndex];
              if (stood.isTrap) {
                // TRAP! Platform turns red & loses collision
                stood.triggered = true;
                stood.solid = false;
                standingPlatformId = null;
                isGrounded = false;
                streak = 0;
                speedBoostTimer = 0;
                sessionAnswered += 1;

                const trapMesh = platformMeshes.get(stood.id);
                if (trapMesh) {
                  trapMesh.position.y -= 0.45;
                  const mats = Array.isArray(trapMesh.material)
                    ? trapMesh.material
                    : [trapMesh.material];
                  for (const m of mats) {
                    if (m instanceof THREE.MeshStandardMaterial) {
                      m.color.setHex(0xef4444);
                      m.emissive.setHex(0x991b1b);
                      m.emissiveIntensity = 0.7;
                      m.transparent = true;
                      m.opacity = 0.65;
                    }
                  }
                }

                soundEngine.playTrapFall();
                spawnBurst(pos.x, pos.y + 0.5, pos.z, 0xef4444, 14);

                callbacksRef.current.onProgressEvent({
                  xpGain: 0,
                  coinsGain: 0,
                  answeredDelta: 1,
                  correctDelta: 0,
                  streak: 0,
                });

                pendingTrap = {
                  stageIndex: stood.stageIndex,
                  question: q,
                  chosenLetter: stood.answerLetter || 'A',
                  chosenAnswer: stood.answerLabel || '',
                };
              } else {
                // CORRECT ANSWER!
                stood.triggered = true;
                completedStages.add(stood.stageIndex);
                streak += 1;
                bestStreakSession = Math.max(bestStreakSession, streak);
                if (streak >= 2) speedBoostTimer = 5.0;

                const rewardMult = level.difficulty.rewardMultiplier || 1;
                const xpGain = Math.round(
                  (50 + (streak > 1 ? Math.min(40, streak * 10) : 0)) * rewardMult
                );
                const coinsGain = level.difficulty.coinsPerQuestion || 10;
                sessionXp += xpGain;
                sessionCoins += coinsGain;
                sessionAnswered += 1;
                sessionCorrect += 1;

                // Glow correct pad green
                const padMesh = platformMeshes.get(stood.id);
                if (padMesh) {
                  const mats = Array.isArray(padMesh.material)
                    ? padMesh.material
                    : [padMesh.material];
                  for (const m of mats) {
                    if (m instanceof THREE.MeshStandardMaterial) {
                      m.emissive.setHex(0x10b981);
                      m.emissiveIntensity = 0.55;
                    }
                  }
                }

                // Unlock Exit Bridge & Jump Pad for this stage
                for (const unlockP of platforms) {
                  if (unlockP.unlockOnStage === stood.stageIndex) {
                    unlockP.solid = true;
                  }
                }
                const unlockMeshes = bridgeMeshes.get(stood.stageIndex) || [];
                for (const um of unlockMeshes) {
                  const m = um.material;
                  if (m instanceof THREE.MeshStandardMaterial) {
                    m.opacity = 1.0;
                    m.transparent = false;
                    m.emissiveIntensity = 0.45;
                  }
                }

                soundEngine.playCorrect();
                spawnBurst(pos.x, pos.y + 1.0, pos.z, 0x10b981, 20);

                callbacksRef.current.onProgressEvent({
                  xpGain,
                  coinsGain,
                  answeredDelta: 1,
                  correctDelta: 1,
                  streak,
                });
              }
              emitHud(true, elapsed);
            }

            // Victory Platform!
            if (stood.kind === 'finish' && !victoryTriggered) {
              victoryTriggered = true;
              const rewardMult = level.difficulty.rewardMultiplier || 1;
              const bonusXp = Math.round(150 * rewardMult);
              const bonusCoins = level.difficulty.completionBonusCoins || 50;
              sessionXp += bonusXp;
              sessionCoins += bonusCoins;
              soundEngine.playVictory();
              spawnBurst(pos.x, pos.y + 2, pos.z, 0xfacc15, 28);
              callbacksRef.current.onProgressEvent({
                xpGain: bonusXp,
                coinsGain: bonusCoins,
                answeredDelta: 0,
                correctDelta: 0,
                streak,
              });
              callbacksRef.current.onVictory({
                sessionXp,
                sessionCoins,
                sessionAnswered,
                sessionCorrect,
                bestStreak: bestStreakSession,
              });
              emitHud(true, elapsed);
            }
          }
        }

        // 6. Coin Pickups
        for (const c of coins) {
          if (c.collected) continue;
          const dx = pos.x - c.x;
          const dy = pos.y + 1.1 - c.y;
          const dz = pos.z - c.z;
          if (dx * dx + dy * dy + dz * dz < 1.9) {
            c.collected = true;
            const cm = coinMeshes.get(c.id);
            if (cm) cm.visible = false;
            const rewardMult = level.difficulty.rewardMultiplier || 1;
            const coinGain = Math.round(10 * rewardMult);
            const xpGain = Math.round(10 * rewardMult);
            sessionCoins += coinGain;
            sessionXp += xpGain;
            soundEngine.playCoin();
            spawnBurst(c.x, c.y, c.z, 0xfacc15, 8);
            callbacksRef.current.onProgressEvent({
              xpGain,
              coinsGain: coinGain,
              answeredDelta: 0,
              correctDelta: 0,
              streak,
            });
            emitHud(true, elapsed);
          }
        }

        // 7. Lava Fall / Out-of-Bounds Respawn
        if (pos.y <= -6.8 || pos.y < activeCheckpoint.y - 12) {
          spawnBurst(pos.x, Math.max(-6.5, pos.y), pos.z, 0xff5500, 12);
          respawnAtCheckpoint();
          if (pendingTrap) {
            const trapToShow = pendingTrap;
            pendingTrap = null;
            callbacksRef.current.onTrapTriggered(trapToShow);
          } else {
            soundEngine.playTrapFall();
          }
        }

        // Speed Boost foot trail particles
        if (speedBoostTimer > 0 && horizSpeed > 1.2) {
          trailTimer += delta;
          if (trailTimer > 0.06) {
            trailTimer = 0;
            spawnBurst(pos.x, pos.y + 0.15, pos.z, 0x38bdf8, 2);
          }
        }

        // Update Avatar Transform & Procedural Animation
        avatarRig.root.position.set(pos.x, pos.y, pos.z);
        animateAvatarRig(
          avatarRig,
          horizSpeed,
          isGrounded,
          elapsed,
          delta,
          null,
          student.movementStyle || 'classic'
        );
      }

      // Update Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life += delta;
        if (pt.life >= pt.maxLife) {
          scene.remove(pt.mesh);
          particles.splice(i, 1);
          continue;
        }
        pt.vy -= 14 * delta;
        pt.mesh.position.x += pt.vx * delta;
        pt.mesh.position.y += pt.vy * delta;
        pt.mesh.position.z += pt.vz * delta;
        const s = 1 - pt.life / pt.maxLife;
        pt.mesh.scale.setScalar(Math.max(0.05, s));
      }

      // Update Key Light to follow avatar elevation cleanly
      keyLight.position.set(pos.x + 18, pos.y + 32, pos.z + 20);
      keyLight.target.position.set(pos.x, pos.y, pos.z - 6);
      keyLight.target.updateMatrixWorld();

      // Update Orbital Chase Camera (with immediate sign pass-through so the sign never stays in front of the camera)
      _camTarget.set(pos.x, pos.y + 1.85, pos.z);
      const cosYCam = Math.cos(cameraYaw);
      const sinYCam = Math.sin(cameraYaw);

      let effectiveCamDist = CAM_DIST;
      const baseHorizDist = Math.cos(cameraPitch) * CAM_DIST;
      const unclampedCamZ = _camTarget.z + cosYCam * baseHorizDist;

      for (const sEnt of signEntities) {
        // Check if player has crossed in front of the sign (pos.z < sEnt.z) while the default camera would still sit behind the sign (unclampedCamZ > sEnt.z - 0.5)
        const playerPassedSign = pos.z < sEnt.z - 0.15 && pos.z > sEnt.z - 14.5;
        const signBetweenCamAndPlayer =
          pos.z < sEnt.z + 0.4 && unclampedCamZ > sEnt.z - 0.4 && Math.abs(pos.y - sEnt.y) < 9.5;

        if (playerPassedSign && cosYCam > 0.2) {
          // Pull the camera immediately past the sign so it stays right behind the character
          const maxZ = sEnt.z - 0.65;
          const allowedHoriz = Math.max(2.6, (maxZ - _camTarget.z) / cosYCam);
          const clampedDist = allowedHoriz / Math.max(0.25, Math.cos(cameraPitch));
          effectiveCamDist = Math.min(effectiveCamDist, clampedDist);
        }

        // Also fade the sign out smoothly if the player has passed it or if it ever sits between camera and player
        const targetOpacity = playerPassedSign || signBetweenCamAndPlayer ? 0.08 : 1.0;
        sEnt.currentOpacity = THREE.MathUtils.damp(sEnt.currentOpacity, targetOpacity, 16, delta);
        const showShadow = sEnt.currentOpacity > 0.5 && !isSoftwareGl;
        sEnt.group.children.forEach((child: THREE.Object3D) => {
          child.castShadow = showShadow;
        });
        for (const mat of sEnt.materials) {
          mat.opacity = sEnt.currentOpacity;
          mat.depthWrite = sEnt.currentOpacity > 0.5;
        }
      }

      const horizDist = Math.cos(cameraPitch) * effectiveCamDist;
      const vertDist = Math.sin(cameraPitch) * effectiveCamDist;
      _desiredCamPos.set(
        _camTarget.x + sinYCam * horizDist,
        _camTarget.y + vertDist,
        _camTarget.z + cosYCam * horizDist
      );
      camera.position.lerp(_desiredCamPos, Math.min(1, delta * 14));
      camera.lookAt(_camTarget);

      emitHud(false, elapsed);
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onCanvasPointerMove);
      window.removeEventListener('pointerup', onCanvasPointerUp);
      window.removeEventListener('pointercancel', onCanvasPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [level, student.avatarColor, student.equippedHat, student.equippedJersey]);

  if (contextLost) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 p-6 text-center">
        <div className="max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="font-display text-lg font-bold text-white">Contexto 3D interrompido</p>
          <p className="mt-2 text-sm text-slate-400">
            O navegador pausou a placa gráfica. Recarregue ou volte para a torre para continuar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className="touch-none-select h-full w-full cursor-grab active:cursor-grabbing"
    />
  );
}
