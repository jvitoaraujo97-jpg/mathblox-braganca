import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  ArrowLeft,
  Coins,
  Flame,
  RotateCcw,
  ShieldCheck,
  Timer,
  Trophy,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { AudioSettingsButton } from '../components/AudioSettingsModal';
import { MobileControls, MobileInputState } from '../components/MobileControls';
import { getQuestionsForMode } from '../data/questionEngine';
import { getDifficultyConfig, getWorldById } from '../data/worlds';
import { animateAvatarRig, AvatarRig, createAvatarRig } from '../game/avatarBuilder';
import { createAnswerPadTexture, createLavaTexture, createStudTexture } from '../game/textures';
import { MathQuestion, StudentProfile, TowerDifficulty } from '../types/game';

interface SurvivalArenaGameProps {
  student: StudentProfile;
  worldId: number;
  difficulty: TowerDifficulty;
  muted: boolean;
  onToggleMute: () => void;
  onProgressEvent: (delta: {
    xpGain: number;
    coinsGain: number;
    answeredDelta: number;
    correctDelta: number;
    streak: number;
  }) => void;
  onExit: () => void;
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

const TOTAL_WAVES = 8;
const WAVE_COUNTDOWN_SECONDS = 12;

interface ArenaTile {
  id: string;
  row: number;
  col: number;
  x: number;
  baseY: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  letter: 'A' | 'B' | 'C';
  optionIndex: number;
  solid: boolean;
  mesh: THREE.Mesh;
}

const TILE_LETTERS: ('A' | 'B' | 'C')[] = [
  'A',
  'B',
  'C',
  'B',
  'C',
  'A',
  'C',
  'A',
  'B',
];

const LETTER_COLORS: Record<'A' | 'B' | 'C', string> = {
  A: '#2563eb',
  B: '#d97706',
  C: '#9333ea',
};

export function SurvivalArenaGame({
  student,
  worldId,
  difficulty,
  onProgressEvent,
  onExit,
}: SurvivalArenaGameProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [runKey, setRunKey] = useState(1);
  const [rotateCameraSignal, setRotateCameraSignal] = useState(0);

  const world = useMemo(() => getWorldById(worldId), [worldId]);
  const diffConfig = useMemo(() => getDifficultyConfig(difficulty), [difficulty]);
  const questions = useMemo(
    () => getQuestionsForMode(worldId, 'survival', TOTAL_WAVES),
    [worldId, runKey]
  );

  const [hudState, setHudState] = useState<{
    waveIndex: number;
    timeLeft: number;
    phase: 'countdown' | 'shaking' | 'collapsed' | 'victory' | 'eliminated';
    question: MathQuestion;
    sessionXp: number;
    sessionCoins: number;
    streak: number;
    standingLetter: 'A' | 'B' | 'C' | null;
  }>({
    waveIndex: 0,
    timeLeft: WAVE_COUNTDOWN_SECONDS,
    phase: 'countdown',
    question: questions[0],
    sessionXp: 0,
    sessionCoins: 0,
    streak: 0,
    standingLetter: null,
  });

  const mobileInputRef = useRef<MobileInputState>({
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    cameraYawDelta: 0,
  });

  const cameraYawTargetRef = useRef(0);
  useEffect(() => {
    if (rotateCameraSignal > 0) {
      cameraYawTargetRef.current += Math.PI / 2;
    }
  }, [rotateCameraSignal]);

  const onProgressRef = useRef(onProgressEvent);
  onProgressRef.current = onProgressEvent;

  useEffect(() => {
    soundEngine.startBgm('tower');
    soundEngine.setTowerIntensity(false);

    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x38bdf8);
    scene.fog = new THREE.Fog(0xbae6fd, 58, 210);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 230);
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemiLight = new THREE.HemisphereLight(0xfef3c7, 0x0284c7, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.6);
    keyLight.position.set(16, 32, 18);
    keyLight.castShadow = !isSoftwareGl;
    scene.add(keyLight);

    // Central Lava Pool Below 3x3 Board
    const lavaTex = createLavaTexture(maxAniso);
    const lavaMat = new THREE.MeshStandardMaterial({
      map: lavaTex,
      emissive: new THREE.Color(0xff4500),
      emissiveMap: lavaTex,
      emissiveIntensity: 1.0,
      roughness: 0.65,
    });
    const lavaMesh = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), lavaMat);
    lavaMesh.rotation.x = -Math.PI / 2;
    lavaMesh.position.set(0, -6.4, 0);
    scene.add(lavaMesh);

    // Mirante do Caeté e Ilhas Costeiras de Bragança around the Arena
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.22,
      metalness: 0.15,
    });
    const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), seaMat);
    seaMesh.rotation.x = -Math.PI / 2;
    seaMesh.position.set(0, -6.65, 0);
    scene.add(seaMesh);

    const sandMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.85 });
    const islandGrassMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.75 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.65 });

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const radius = 56 + (i % 3) * 18;
      const ix = Math.cos(angle) * radius;
      const iz = Math.sin(angle) * radius;

      const islandGroup = new THREE.Group();
      islandGroup.position.set(ix, -6.5, iz);

      const sandBase = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 1.8, 12), sandMat);
      sandBase.position.y = 0.7;
      islandGroup.add(sandBase);

      const grassTop = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8.5, 1.3, 10), islandGrassMat);
      grassTop.position.y = 1.9;
      islandGroup.add(grassTop);

      for (let p = 0; p < 2; p++) {
        const palm = new THREE.Group();
        palm.position.set((p - 0.5) * 3.8, 2.4, (p % 2 === 0 ? 1 : -1) * 1.6);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 5.2, 7), trunkMat);
        trunk.position.y = 2.6;
        palm.add(trunk);

        for (let f = 0; f < 5; f++) {
          const a = (f / 5) * Math.PI * 2;
          const frond = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 2.5), frondMat);
          frond.position.set(Math.sin(a) * 1.1, 5.2, Math.cos(a) * 1.1);
          frond.rotation.y = a;
          frond.rotation.x = 0.35;
          palm.add(frond);
        }
        islandGroup.add(palm);
      }

      scene.add(islandGroup);
    }

    // Regional Fishing Boats ("Pô-pô-pô") on the Horizon
    const hullColors = [0xef4444, 0x0ea5e9, 0xf59e0b, 0x10b981];
    const cabinWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const horizonBoats: { group: THREE.Group; baseAngle: number; radius: number; speed: number; phase: number }[] = [];

    for (let b = 0; b < 8; b++) {
      const boat = new THREE.Group();
      const hullMat = new THREE.MeshStandardMaterial({
        color: hullColors[b % hullColors.length],
        roughness: 0.5,
      });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 5.2), hullMat);
      hull.position.y = 0.4;
      boat.add(hull);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 2.1), cabinWhite);
      cabin.position.set(0, 1.3, -0.3);
      boat.add(cabin);

      const baseAngle = (b / 8) * Math.PI * 2;
      const radius = 36 + (b % 3) * 12;
      boat.position.set(Math.cos(baseAngle) * radius, -6.5, Math.sin(baseAngle) * radius);
      scene.add(boat);
      horizonBoats.push({
        group: boat,
        baseAngle,
        radius,
        speed: (b % 2 === 0 ? 1 : -1) * (0.08 + (b % 3) * 0.03),
        phase: b * 0.9,
      });
    }

    // Clouds in the Sky
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const skyClouds: THREE.Group[] = [];
    for (let c = 0; c < 12; c++) {
      const cg = new THREE.Group();
      const main = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 5.2), cloudMat);
      const side = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.7, 4.0), cloudMat);
      side.position.set(3.4, -0.2, 0.7);
      cg.add(main, side);
      const angle = (c / 12) * Math.PI * 2;
      const rad = 60 + (c % 3) * 24;
      cg.position.set(Math.cos(angle) * rad, 24 + (c % 4) * 4, Math.sin(angle) * rad);
      scene.add(cg);
      skyClouds.push(cg);
    }

    // Decorative Stadium Rim Pillars around the 3x3 Arena
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.5,
    });
    const cornerCoords = [
      [-14, -14],
      [14, -14],
      [-14, 14],
      [14, 14],
    ];
    for (const [cx, cz] of cornerCoords) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 18, 12), pillarMat);
      col.position.set(cx, 2, cz);
      scene.add(col);

      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 14, 12),
        new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0xea580c,
          emissiveIntensity: 0.9,
        })
      );
      beacon.position.set(cx, 11.4, cz);
      scene.add(beacon);
    }

    // Build 3x3 Grid of 9 Large Platforms
    const tiles: ArenaTile[] = [];
    const tileW = 6.2;
    const tileD = 6.2;
    const tileH = 1.1;
    const gap = 0.75;
    const step = tileW + gap;

    const rebuildTileTexturesForWave = (waveIdx: number) => {
      const q = questions[waveIdx] || questions[0];
      tiles.forEach((t) => {
        const label = q.options[t.optionIndex] || '';
        const colorHex = LETTER_COLORS[t.letter];
        const topTex = createAnswerPadTexture(t.letter, label, colorHex, maxAniso);
        const sideTex = createStudTexture(colorHex, maxAniso, 2, 2);
        const sideMat = new THREE.MeshStandardMaterial({
          map: sideTex,
          roughness: 0.45,
          metalness: 0.1,
        });
        const topMat = new THREE.MeshStandardMaterial({
          map: topTex,
          roughness: 0.3,
          metalness: 0.05,
        });
        t.mesh.material = [sideMat, sideMat, topMat, sideMat, topMat, sideMat];
      });
    };

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const idx = r * 3 + c;
        const letter = TILE_LETTERS[idx];
        const optionIndex = letter === 'A' ? 0 : letter === 'B' ? 1 : 2;
        const x = (c - 1) * step;
        const z = (r - 1) * step;

        const geo = new THREE.BoxGeometry(tileW, tileH, tileD);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x334155 }));
        mesh.position.set(x, 0, z);
        mesh.castShadow = !isSoftwareGl;
        mesh.receiveShadow = true;
        scene.add(mesh);

        tiles.push({
          id: `tile-${r}-${c}`,
          row: r,
          col: c,
          x,
          baseY: 0,
          y: 0,
          z,
          w: tileW,
          h: tileH,
          d: tileD,
          letter,
          optionIndex,
          solid: true,
          mesh,
        });
      }
    }

    rebuildTileTexturesForWave(0);

    // Build Player R6 Avatar with equipped Brasileirão Jersey & Hat
    const avatarRig: AvatarRig = createAvatarRig(
      student.avatarColor,
      student.equippedHat,
      student.equippedJersey
    );
    scene.add(avatarRig.root);

    // Physics & Wave State
    const pos = { x: 0, y: 1.2, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    let isGrounded = false;
    let coyoteTimer = 0;
    let jumpBufferTimer = 0;
    let standingTile: ArenaTile | null = null;

    const GRAVITY = -28.0;
    const JUMP_VEL = 11.5;
    const MOVE_SPEED = 8.4;
    const HALF_W = 0.4;
    const HALF_D = 0.4;

    let waveIndex = 0;
    let phase: 'countdown' | 'shaking' | 'collapsed' | 'victory' | 'eliminated' = 'countdown';
    let timer = WAVE_COUNTDOWN_SECONDS;
    let sessionXp = 0;
    let sessionCoins = 0;
    let streak = 0;
    let lastHudSync = 0;

    let cameraYaw = 0;
    let cameraPitch = 0.56;
    const CAM_DIST = 14.5;

    const keys = new Set<string>();
    let prevJumpTouch = false;
    let draggingCam = false;
    let camPointerId: number | null = null;
    let lastCamX = 0;
    let lastCamY = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'Space') jumpBufferTimer = 0.12;
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);

    const onPointerDown = (e: PointerEvent) => {
      if (camPointerId !== null) return;
      camPointerId = e.pointerId;
      draggingCam = true;
      lastCamX = e.clientX;
      lastCamY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingCam || e.pointerId !== camPointerId) return;
      const dx = e.clientX - lastCamX;
      const dy = e.clientY - lastCamY;
      lastCamX = e.clientX;
      lastCamY = e.clientY;
      cameraYawTargetRef.current -= dx * 0.0065;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.005, 0.22, 1.15);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId === camPointerId) {
        draggingCam = false;
        camPointerId = null;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const syncHud = (force = false, elapsed = 0) => {
      if (!force && elapsed - lastHudSync < 0.08) return;
      lastHudSync = elapsed;
      setHudState({
        waveIndex,
        timeLeft: Math.max(0, timer),
        phase,
        question: questions[Math.min(waveIndex, questions.length - 1)],
        sessionXp,
        sessionCoins,
        streak,
        standingLetter: standingTile ? standingTile.letter : null,
      });
    };

    syncHud(true, 0);

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

      lavaTex.offset.x = (elapsed * 0.03) % 1;
      lavaTex.offset.y = (elapsed * 0.025) % 1;
      seaMesh.position.y = -6.65 + Math.sin(elapsed * 2.1) * 0.14;

      for (const hb of horizonBoats) {
        const ang = hb.baseAngle + elapsed * hb.speed;
        hb.group.position.x = Math.cos(ang) * hb.radius;
        hb.group.position.z = Math.sin(ang) * hb.radius;
        hb.group.position.y = -6.5 + Math.sin(elapsed * 2.5 + hb.phase) * 0.12;
        hb.group.rotation.y = -ang + (hb.speed > 0 ? 0 : Math.PI);
        hb.group.rotation.z = Math.sin(elapsed * 2.4 + hb.phase) * 0.05;
      }

      for (const cg of skyClouds) {
        cg.position.x += delta * 1.1;
        if (cg.position.x > 110) cg.position.x = -110;
      }

      if (phase !== 'victory' && phase !== 'eliminated') {
        const currentQ = questions[waveIndex];

        // Wave State Machine
        timer -= delta;
        if (phase === 'countdown' && timer <= 0) {
          phase = 'shaking';
          timer = 0.85; // 0.85s shake warning before wrong tiles drop
          soundEngine.playCheckpoint();
          syncHud(true, elapsed);
        } else if (phase === 'shaking') {
          // Shake wrong tiles
          for (const t of tiles) {
            if (t.optionIndex !== currentQ.correctIndex) {
              t.mesh.position.x = t.x + Math.sin(elapsed * 48) * 0.16;
              t.mesh.position.z = t.z + Math.cos(elapsed * 44) * 0.16;
            }
          }
          if (timer <= 0) {
            phase = 'collapsed';
            timer = 2.4;
            soundEngine.playTrapFall();
            for (const t of tiles) {
              if (t.optionIndex !== currentQ.correctIndex) {
                t.solid = false;
              }
            }
            syncHud(true, elapsed);
          }
        } else if (phase === 'collapsed') {
          // Drop non-solid tiles into the lava
          for (const t of tiles) {
            if (!t.solid) {
              t.y = Math.max(-6.2, t.y - 16 * delta);
              t.mesh.position.set(t.x, t.y, t.z);
            }
          }

          if (timer <= 0) {
            // Player survived this wave!
            streak += 1;
            const xpGain = Math.round(60 * diffConfig.rewardMultiplier);
            const coinsGain = diffConfig.coinsPerQuestion;
            sessionXp += xpGain;
            sessionCoins += coinsGain;
            soundEngine.playCorrect();

            onProgressRef.current({
              xpGain,
              coinsGain,
              answeredDelta: 1,
              correctDelta: 1,
              streak,
            });

            if (waveIndex + 1 >= questions.length) {
              // Completed all 8 waves!
              phase = 'victory';
              const bonusXp = Math.round(180 * diffConfig.rewardMultiplier);
              const bonusCoins = diffConfig.completionBonusCoins;
              sessionXp += bonusXp;
              sessionCoins += bonusCoins;
              soundEngine.playVictory();
              onProgressRef.current({
                xpGain: bonusXp,
                coinsGain: bonusCoins,
                answeredDelta: 0,
                correctDelta: 0,
                streak,
              });
              syncHud(true, elapsed);
            } else {
              // Restore all 9 tiles for next wave
              waveIndex += 1;
              soundEngine.setTowerIntensity(waveIndex >= 5);
              phase = 'countdown';
              timer = WAVE_COUNTDOWN_SECONDS;
              for (const t of tiles) {
                t.solid = true;
                t.y = t.baseY;
                t.mesh.position.set(t.x, t.baseY, t.z);
              }
              rebuildTileTexturesForWave(waveIndex);
              syncHud(true, elapsed);
            }
          }
        }

        // Player Movement & AABB Physics
        let inputX = mobileInputRef.current.moveX;
        let inputY = mobileInputRef.current.moveY;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) inputX -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) inputX += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) inputY += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) inputY -= 1;

        const mag = Math.hypot(inputX, inputY);
        if (mag > 1) {
          inputX /= mag;
          inputY /= mag;
        }

        const jumpTouch = mobileInputRef.current.jumpPressed;
        if (jumpTouch && !prevJumpTouch) jumpBufferTimer = 0.12;
        prevJumpTouch = jumpTouch;

        cameraYaw = THREE.MathUtils.damp(cameraYaw, cameraYawTargetRef.current, 12, delta);
        const sinY = Math.sin(cameraYaw);
        const cosY = Math.cos(cameraYaw);
        const worldVx = (inputX * cosY - inputY * sinY) * MOVE_SPEED;
        const worldVz = (-inputX * sinY - inputY * cosY) * MOVE_SPEED;

        vel.x = THREE.MathUtils.damp(vel.x, worldVx, 16, delta);
        vel.z = THREE.MathUtils.damp(vel.z, worldVz, 16, delta);

        const horizSpeed = Math.hypot(vel.x, vel.z);
        if (horizSpeed > 0.5) {
          const targetAngle = Math.atan2(vel.x, vel.z);
          let diff = targetAngle - avatarRig.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          avatarRig.root.rotation.y += diff * Math.min(1, delta * 14);
        }

        if (isGrounded) coyoteTimer = 0.12;
        else coyoteTimer = Math.max(0, coyoteTimer - delta);
        if (jumpBufferTimer > 0) jumpBufferTimer = Math.max(0, jumpBufferTimer - delta);

        if (jumpBufferTimer > 0 && coyoteTimer > 0) {
          vel.y = JUMP_VEL;
          isGrounded = false;
          coyoteTimer = 0;
          jumpBufferTimer = 0;
          soundEngine.playJump();
        }

        vel.y += GRAVITY * delta;
        pos.x += vel.x * delta;
        pos.z += vel.z * delta;
        pos.y += vel.y * delta;

        isGrounded = false;
        standingTile = null;

        for (const t of tiles) {
          if (!t.solid) continue;
          const overlapX = pos.x + HALF_W > t.x - t.w / 2 && pos.x - HALF_W < t.x + t.w / 2;
          const overlapZ = pos.z + HALF_D > t.z - t.d / 2 && pos.z - HALF_D < t.z + t.d / 2;
          if (!overlapX || !overlapZ) continue;

          const top = t.y + t.h / 2;
          if (vel.y <= 0 && pos.y <= top + 0.12 && pos.y >= top - 0.9) {
            pos.y = top;
            vel.y = 0;
            isGrounded = true;
            standingTile = t;
          }
        }

        // Fell into the lava!
        if (pos.y < -5.2) {
          phase = 'eliminated';
          streak = 0;
          soundEngine.playTrapFall();
          onProgressRef.current({
            xpGain: 0,
            coinsGain: 0,
            answeredDelta: 1,
            correctDelta: 0,
            streak: 0,
          });
          syncHud(true, elapsed);
        }

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
      } else if (phase === 'victory') {
        animateAvatarRig(
          avatarRig,
          0,
          true,
          elapsed,
          delta,
          'trophy',
          student.movementStyle || 'classic'
        );
      }

      // Camera Chase
      const targetX = pos.x * 0.45;
      const targetY = Math.max(0, pos.y) + 1.6;
      const targetZ = pos.z * 0.45;
      const hDist = Math.cos(cameraPitch) * CAM_DIST;
      const vDist = Math.sin(cameraPitch) * CAM_DIST;
      camera.position.set(
        targetX + Math.sin(cameraYaw) * hDist,
        targetY + vDist,
        targetZ + Math.cos(cameraYaw) * hDist
      );
      camera.lookAt(targetX, targetY, targetZ);

      syncHud(false, elapsed);
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
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [runKey, worldId, difficulty, student.avatarColor, student.equippedHat, student.equippedJersey]);

  const q = hudState.question;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950 select-none">
      <div
        ref={mountRef}
        className="touch-none-select h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* Top HUD Overlay */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onExit}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Praça / Menu</span>
            </button>
            <AudioSettingsButton />
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-slate-900/95 px-4 py-2">
            <Flame className="h-4 w-4 text-amber-400" />
            <span className="font-display text-xs sm:text-sm font-extrabold text-white">
              Onda {hudState.waveIndex + 1}/{TOTAL_WAVES}
            </span>
            <span className="mx-1 text-slate-600">|</span>
            <Timer className="h-4 w-4 text-sky-400" />
            <span
              className={`font-mono text-sm sm:text-base font-black tabular-nums ${
                hudState.timeLeft <= 3.5 ? 'text-rose-400 animate-pulse' : 'text-amber-300'
              }`}
            >
              {hudState.phase === 'countdown'
                ? `${Math.ceil(hudState.timeLeft)}s`
                : hudState.phase === 'shaking'
                  ? 'CAINDO!'
                  : 'LAVA!'}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2 font-mono text-xs font-bold tabular-nums">
            <span className="text-emerald-400">+{hudState.sessionXp} XP</span>
            <span className="text-amber-400 flex items-center gap-1">
              <Coins className="h-3.5 w-3.5" />+{hudState.sessionCoins}
            </span>
          </div>
        </div>

        {/* Question Banner with Options A, B, C */}
        {q && hudState.phase !== 'victory' && hudState.phase !== 'eliminated' && (
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-950/95 p-3.5 sm:p-4 shadow-2xl">
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
              <span>
                ARENA SOBREVIVÊNCIA · {world.grade.toUpperCase()} · {q.topic.toUpperCase()}
              </span>
              <span>
                {hudState.standingLetter
                  ? `Você está no piso [${hudState.standingLetter}]`
                  : 'Corra para o piso A, B ou C!'}
              </span>
            </div>
            <p className="mt-1 font-display text-sm sm:text-lg font-extrabold text-white">
              {q.prompt}
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {(['A', 'B', 'C'] as const).map((letter, idx) => {
                const isStanding = hudState.standingLetter === letter;
                const badgeBg =
                  letter === 'A'
                    ? 'bg-blue-600'
                    : letter === 'B'
                      ? 'bg-amber-600'
                      : 'bg-purple-600';
                return (
                  <div
                    key={letter}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-bold ${
                      isStanding
                        ? 'border-emerald-400 bg-emerald-500/20 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-200'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-display text-xs font-black text-white ${badgeBg}`}
                    >
                      {letter}
                    </span>
                    <span className="truncate">{q.options[idx]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Eliminated Modal */}
      {hudState.phase === 'eliminated' && q && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-rose-400">Piso Desabou na Onda {hudState.waveIndex + 1}</p>
                <h3 className="font-display text-xl font-extrabold text-white">
                  Você caiu na lava!
                </h3>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs font-semibold text-slate-400">{q.prompt}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                Piso Seguro: [{['A', 'B', 'C'][q.correctIndex]}] {q.options[q.correctIndex]}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{q.explanation}</p>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={onExit}
                className="flex-1 min-h-[46px] rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-200"
              >
                Voltar à Praça
              </button>
              <button
                type="button"
                onClick={() => setRunKey((k) => k + 1)}
                className="flex-1 flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-amber-400 font-display text-xs font-extrabold text-slate-950 hover:bg-amber-300"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Jogar Novamente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory Modal */}
      {hudState.phase === 'victory' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/50 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
              <Trophy className="h-9 w-9" />
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-amber-400">
              Sobrevivente Mestre · 8/8 Ondas
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
              Arena Sobrevivência Concluída!
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Você permaneceu nos pisos corretos em todas as 8 rodadas!
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">XP Ganho</p>
                <p className="mt-1 font-mono text-xl font-black text-emerald-400">
                  +{hudState.sessionXp} XP
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">BloxCoins (+50 Bônus)</p>
                <p className="mt-1 font-mono text-xl font-black text-amber-400">
                  +{hudState.sessionCoins} Coins
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={onExit}
                className="flex-1 min-h-[48px] rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-200"
              >
                Voltar à Praça
              </button>
              <button
                type="button"
                onClick={() => setRunKey((k) => k + 1)}
                className="flex-1 min-h-[48px] rounded-xl bg-emerald-500 font-display text-xs font-extrabold text-slate-950 hover:bg-emerald-400"
              >
                Nova Partida
              </button>
            </div>
          </div>
        </div>
      )}

      {hudState.phase !== 'victory' && hudState.phase !== 'eliminated' && (
        <MobileControls
          inputRef={mobileInputRef}
          onRotateCameraStep={() => setRotateCameraSignal((n) => n + 1)}
        />
      )}
    </div>
  );
}
