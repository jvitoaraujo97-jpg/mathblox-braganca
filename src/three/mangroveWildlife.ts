import * as THREE from 'three';
import { GraphicsQuality } from './graphicsEngine';

export interface MangroveTreeAnchor {
  x: number;
  y: number;
  z: number;
  scale: number;
  distFromEdge: number;
  side: number;
  s: number;
}

export interface WildlifeBridgeSpan {
  startS: number;
  endS: number;
  midS: number;
}

export type SplineSamplerFn = (
  s: number,
  outPos: THREE.Vector3,
  outTan: THREE.Vector3,
  outRight: THREE.Vector3
) => { yaw: number; curvature: number };

export interface MangroveWildlifeSystem {
  group: THREE.Group;
  update: (dt: number, tSec: number, kartPos: THREE.Vector3) => void;
}

export interface MangroveWildlifeConfig {
  sampleSplineAtS: SplineSamplerFn;
  bridges: WildlifeBridgeSpan[];
  nearTrees: MangroveTreeAnchor[];
  beachStartS: number;
  trackWidth: number;
  mudY: number;
  waterY: number;
  quality: GraphicsQuality;
}

// Module-scope zero-GC scratch vectors
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _r = new THREE.Vector3();
const _dummy = new THREE.Object3D();

interface FlyingGuaraActor {
  root: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  bridgePos: THREE.Vector3;
  bridgeRight: THREE.Vector3;
  bridgeTan: THREE.Vector3;
  orbitRadiusX: number;
  orbitRadiusZ: number;
  baseAlt: number;
  phase: number;
  speed: number;
  formationOffset: number;
}

interface HeronActor {
  root: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  neckPivot: THREE.Group;
  homePos: THREE.Vector3;
  homeYaw: number;
  flightDir: THREE.Vector3;
  canTakeOff: boolean;
  flightT: number; // 0 = grounded, >0 = airborne arc
  activeFlight: boolean;
  phase: number;
}

interface CrabActor {
  root: THREE.Group;
  clawL: THREE.Mesh;
  clawR: THREE.Mesh;
  homePos: THREE.Vector3;
  scuttleAxis: THREE.Vector3;
  range: number;
  speed: number;
  phase: number;
}

interface MonkeyActor {
  root: THREE.Group;
  swingPivot: THREE.Group;
  tailPivot: THREE.Group;
  phase: number;
  speed: number;
}

interface RaccoonActor {
  root: THREE.Group;
  headPivot: THREE.Group;
  tailPivot: THREE.Group;
  homePos: THREE.Vector3;
  phase: number;
}

interface CaimanActor {
  root: THREE.Group;
  tailSeg1: THREE.Group;
  tailSeg2: THREE.Group;
  homePos: THREE.Vector3;
  driftDir: THREE.Vector3;
  baseYaw: number;
  phase: number;
}

/**
 * Builds the rich, ecologically faithful Bragança-PA mangrove wildlife ecosystem:
 * - 2 flying flocks of Scarlet Ibis (Guarás, Eudocimus ruber) crossing above the 2 elevated bridges + 16 perched on canopies
 * - 14 White Herons (Garças Brancas, Ardea alba) along mudbanks & bridge piers (reactive takeoff on kart approach)
 * - 28 Mangrove Crabs (Caranguejos-Uçá, Ucides cordatus) scuttling sideways across wet mudbanks
 * - 7 Capuchin Monkeys (Macacos-Prego) swinging on high roadside branches
 * - 4 Crab-Eating Raccoons (Mãos-Peladas) foraging near the 4 bridge approaches
 * - 4 Armored Caimans (Jacarés) semi-submerged in the murky estuarine igarapés beneath the 2 bridges
 */
export function createMangroveWildlife(
  config: MangroveWildlifeConfig
): MangroveWildlifeSystem {
  const {
    sampleSplineAtS,
    bridges,
    nearTrees,
    beachStartS,
    trackWidth,
    mudY,
    waterY,
    quality,
  } = config;

  const group = new THREE.Group();
  const halfTrack = trackWidth * 0.5;

  // =========================================================================
  // SHARED MATERIALS & GEOMETRIES (Minimal Draw Calls & Memory)
  // =========================================================================
  const guaraRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0x991b1b,
    emissiveIntensity: 0.24,
    roughness: 0.42,
  });
  const guaraBrightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xb91c1c,
    emissiveIntensity: 0.22,
    roughness: 0.4,
  });
  const darkBeakMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
  });
  const whiteFeatherMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xe2e8f0,
    emissiveIntensity: 0.12,
    roughness: 0.38,
  });
  const yellowBeakMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.38,
  });
  const darkLegMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.72,
  });

  // =========================================================================
  // 1. BANDOS DE GUARÁS (Eudocimus ruber): 2 FLYING FLOCKS ABOVE BRIDGES + 16 PERCHED
  // =========================================================================
  const flyingGuaras: FlyingGuaraActor[] = [];
  const guaraBodyGeo = new THREE.SphereGeometry(0.42, 7, 6);
  const guaraHeadGeo = new THREE.SphereGeometry(0.22, 6, 6);
  const guaraNeckGeo = new THREE.CylinderGeometry(0.08, 0.11, 0.45, 5);
  const guaraBeakBaseGeo = new THREE.ConeGeometry(0.055, 0.36, 5);
  const guaraBeakTipGeo = new THREE.ConeGeometry(0.035, 0.3, 5);
  const guaraWingInnerGeo = new THREE.BoxGeometry(0.95, 0.08, 0.52);
  const guaraWingTipGeo = new THREE.BoxGeometry(0.46, 0.06, 0.36);

  const birdsPerFlock = quality === 'low' ? 6 : 7; // 2 flocks × 6–7 = 12–14 flying scarlet ibises
  bridges.forEach((br, bIdx) => {
    sampleSplineAtS(br.midS, _p, _t, _r);
    const bridgePos = _p.clone();
    const bridgeTan = _t.clone();
    const bridgeRight = _r.clone();

    for (let i = 0; i < birdsPerFlock; i++) {
      const bird = new THREE.Group();
      const bodyMat = i % 2 === 0 ? guaraRedMat : guaraBrightMat;

      const body = new THREE.Mesh(guaraBodyGeo, bodyMat);
      body.scale.set(0.75, 0.65, 1.55);
      bird.add(body);

      const neck = new THREE.Mesh(guaraNeckGeo, bodyMat);
      neck.rotation.x = Math.PI * 0.42;
      neck.position.set(0, 0.08, 0.56);
      bird.add(neck);

      const head = new THREE.Mesh(guaraHeadGeo, bodyMat);
      head.position.set(0, 0.16, 0.8);
      bird.add(head);

      // Curved downward dark ibis beak (2 angled segments)
      const beak1 = new THREE.Mesh(guaraBeakBaseGeo, darkBeakMat);
      beak1.rotation.x = Math.PI * 0.58;
      beak1.position.set(0, 0.11, 1.04);
      const beak2 = new THREE.Mesh(guaraBeakTipGeo, darkBeakMat);
      beak2.rotation.x = Math.PI * 0.78;
      beak2.position.set(0, -0.02, 1.24);
      bird.add(beak1, beak2);

      // Articulated Left & Right Wings with black wingtips
      const wingL = new THREE.Group();
      wingL.position.set(-0.24, 0.06, 0.04);
      const wLIn = new THREE.Mesh(guaraWingInnerGeo, bodyMat);
      wLIn.position.set(-0.48, 0, 0);
      const wLTip = new THREE.Mesh(guaraWingTipGeo, darkBeakMat);
      wLTip.position.set(-1.12, 0, -0.04);
      wingL.add(wLIn, wLTip);

      const wingR = new THREE.Group();
      wingR.position.set(0.24, 0.06, 0.04);
      const wRIn = new THREE.Mesh(guaraWingInnerGeo, bodyMat);
      wRIn.position.set(0.48, 0, 0);
      const wRTip = new THREE.Mesh(guaraWingTipGeo, darkBeakMat);
      wRTip.position.set(1.12, 0, -0.04);
      wingR.add(wRIn, wRTip);

      bird.add(wingL, wingR);
      bird.scale.setScalar(1.22); // Prominent sky silhouette over the elevated bridges
      group.add(bird);

      flyingGuaras.push({
        root: bird,
        wingL,
        wingR,
        bridgePos,
        bridgeRight,
        bridgeTan,
        orbitRadiusX: 34 + (i % 3) * 8,
        orbitRadiusZ: 18 + (i % 4) * 5,
        baseAlt: 10.5 + (i % 3) * 2.2,
        phase: bIdx * 2.4 + i * 0.55,
        speed: 0.52 + (bIdx % 2) * 0.08,
        formationOffset: (i - birdsPerFlock * 0.5) * 2.6,
      });
    }
  });

  // 16 Perched Guarás visibly resting atop roadside mangrove tree canopies (InstancedMesh: 2 draw calls)
  const perchedCount = Math.min(16, nearTrees.length);
  if (perchedCount > 0) {
    const perchedBodyInst = new THREE.InstancedMesh(guaraBodyGeo, guaraBrightMat, perchedCount);
    const perchedBeakInst = new THREE.InstancedMesh(guaraBeakBaseGeo, darkBeakMat, perchedCount);
    const step = Math.max(1, Math.floor(nearTrees.length / perchedCount));

    for (let i = 0; i < perchedCount; i++) {
      const tree = nearTrees[(i * step + 2) % nearTrees.length];
      const yaw = (i * 1.45) % (Math.PI * 2);
      const px = tree.x + Math.cos(yaw) * 0.7;
      const py = tree.y + 6.35 * tree.scale;
      const pz = tree.z + Math.sin(yaw) * 0.7;

      _dummy.position.set(px, py, pz);
      _dummy.rotation.set(0, yaw, 0);
      _dummy.scale.set(1.05, 0.9, 1.55);
      _dummy.updateMatrix();
      perchedBodyInst.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(px + Math.sin(yaw) * 0.62, py + 0.12, pz + Math.cos(yaw) * 0.62);
      _dummy.rotation.set(Math.PI * 0.65, yaw, 0);
      _dummy.scale.set(1.2, 1.3, 1.2);
      _dummy.updateMatrix();
      perchedBeakInst.setMatrixAt(i, _dummy.matrix);
    }
    perchedBodyInst.instanceMatrix.needsUpdate = true;
    perchedBeakInst.instanceMatrix.needsUpdate = true;
    perchedBodyInst.computeBoundingSphere();
    perchedBeakInst.computeBoundingSphere();
    group.add(perchedBodyInst, perchedBeakInst);
  }

  // =========================================================================
  // 2. GARÇAS BRANCAS (Ardea alba): 14 WADING HERONS WITH S-NECK & REACTIVE TAKEOFF
  // =========================================================================
  const herons: HeronActor[] = [];
  const heronLegGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.15, 5);
  const heronBodyGeo = new THREE.SphereGeometry(0.42, 7, 6);
  const heronNeckLowGeo = new THREE.CylinderGeometry(0.08, 0.11, 0.62, 5);
  const heronNeckUpGeo = new THREE.CylinderGeometry(0.065, 0.08, 0.56, 5);
  const heronHeadGeo = new THREE.SphereGeometry(0.16, 6, 6);
  const heronBeakGeo = new THREE.ConeGeometry(0.05, 0.44, 5);
  const heronWingGeo = new THREE.BoxGeometry(1.05, 0.07, 0.52);

  // Place herons near bridge piers/creek banks + along roadside muddy tidal pools
  const heronSpots: { s: number; side: number; dist: number; canTakeOff: boolean }[] = [];
  bridges.forEach((br) => {
    heronSpots.push({ s: br.startS - 8, side: -1, dist: halfTrack + 6.5, canTakeOff: true });
    heronSpots.push({ s: br.midS - 10, side: 1, dist: halfTrack + 9.5, canTakeOff: true });
    heronSpots.push({ s: br.endS + 9, side: 1, dist: halfTrack + 7.0, canTakeOff: true });
  });
  for (let i = 0; i < 8; i++) {
    const sVal = 85 + i * ((beachStartS - 150) / 8);
    if (bridges.some((b) => Math.abs(sVal - b.midS) < 55)) continue;
    heronSpots.push({
      s: sVal,
      side: i % 2 === 0 ? -1 : 1,
      dist: halfTrack + 5.2 + (i % 3) * 2.8,
      canTakeOff: i % 2 === 0,
    });
  }

  heronSpots.forEach((spot, idx) => {
    sampleSplineAtS(spot.s, _p, _t, _r);
    const homePos = new THREE.Vector3(
      _p.x + _r.x * spot.side * spot.dist,
      mudY + 0.04,
      _p.z + _r.z * spot.side * spot.dist
    );

    const hg = new THREE.Group();
    hg.position.copy(homePos);
    const homeYaw = Math.atan2(-_r.x * spot.side, -_r.z * spot.side) + ((idx % 3) - 1) * 0.45;
    hg.rotation.y = homeYaw;

    const legL = new THREE.Mesh(heronLegGeo, darkLegMat);
    legL.position.set(-0.11, 0.56, 0);
    const legR = new THREE.Mesh(heronLegGeo, darkLegMat);
    legR.position.set(0.11, 0.56, 0);

    const body = new THREE.Mesh(heronBodyGeo, whiteFeatherMat);
    body.scale.set(0.82, 0.78, 1.55);
    body.position.set(0, 1.24, 0);

    // Graceful S-curve neck
    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 1.38, 0.42);
    const neckLow = new THREE.Mesh(heronNeckLowGeo, whiteFeatherMat);
    neckLow.position.set(0, 0.24, 0.14);
    neckLow.rotation.x = 0.45;
    const neckUp = new THREE.Mesh(heronNeckUpGeo, whiteFeatherMat);
    neckUp.position.set(0, 0.68, 0.14);
    neckUp.rotation.x = -0.35;
    const head = new THREE.Mesh(heronHeadGeo, whiteFeatherMat);
    head.position.set(0, 0.96, 0.12);
    const beak = new THREE.Mesh(heronBeakGeo, yellowBeakMat);
    beak.rotation.x = Math.PI * 0.52;
    beak.position.set(0, 0.94, 0.39);
    neckPivot.add(neckLow, neckUp, head, beak);

    // Folded wings that open on takeoff
    const wingL = new THREE.Group();
    wingL.position.set(-0.32, 1.32, 0.02);
    const wLM = new THREE.Mesh(heronWingGeo, whiteFeatherMat);
    wLM.position.set(-0.46, 0, 0);
    wingL.add(wLM);
    wingL.rotation.z = 1.15;

    const wingR = new THREE.Group();
    wingR.position.set(0.32, 1.32, 0.02);
    const wRM = new THREE.Mesh(heronWingGeo, whiteFeatherMat);
    wRM.position.set(0.46, 0, 0);
    wingR.add(wRM);
    wingR.rotation.z = -1.15;

    hg.add(legL, legR, body, neckPivot, wingL, wingR);
    hg.scale.setScalar(1.22);
    group.add(hg);

    herons.push({
      root: hg,
      wingL,
      wingR,
      neckPivot,
      homePos,
      homeYaw,
      flightDir: _r.clone().multiplyScalar(spot.side).addScaledVector(_t, 0.55).normalize(),
      canTakeOff: spot.canTakeOff,
      flightT: 0,
      activeFlight: false,
      phase: idx * 1.15,
    });
  });

  // =========================================================================
  // 3. CARANGUEJOS-UÇÁ (Ucides cordatus): 28 SCUTTLING CRABS ON ROADSIDE MUDBANKS
  // =========================================================================
  const crabs: CrabActor[] = [];
  const crabCount = quality === 'low' ? 22 : 28;
  const crabShellMat1 = new THREE.MeshStandardMaterial({ color: 0x5c6d75, roughness: 0.48 }); // bluish-gray uçá carapace
  const crabShellMat2 = new THREE.MeshStandardMaterial({ color: 0x6b5f50, roughness: 0.52 }); // earthy-brown variation
  const crabClawMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.42 }); // bright earthy-orange claws
  const crabLegMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 });

  const crabBodyGeo = new THREE.BoxGeometry(0.76, 0.28, 0.56);
  const crabClawGeo = new THREE.BoxGeometry(0.34, 0.22, 0.44);
  const crabLegGeo = new THREE.BoxGeometry(0.42, 0.08, 0.08);
  const crabEyeGeo = new THREE.SphereGeometry(0.055, 5, 5);

  for (let i = 0; i < crabCount; i++) {
    const sVal = 45 + (i / crabCount) * (beachStartS - 90);
    if (bridges.some((b) => sVal >= b.startS - 12 && sVal <= b.endS + 12)) continue;
    sampleSplineAtS(sVal, _p, _t, _r);

    const side = i % 2 === 0 ? -1 : 1;
    const dist = halfTrack + 3.2 + ((i * 3.7) % 7.5);
    const homePos = new THREE.Vector3(
      _p.x + _r.x * side * dist,
      mudY + 0.16,
      _p.z + _r.z * side * dist
    );

    const cg = new THREE.Group();
    cg.position.copy(homePos);
    cg.rotation.y = Math.atan2(-_r.x * side, -_r.z * side);

    const shell = new THREE.Mesh(crabBodyGeo, i % 2 === 0 ? crabShellMat1 : crabShellMat2);
    cg.add(shell);

    // Prominent raised pincer claws
    const clawL = new THREE.Mesh(crabClawGeo, crabClawMat);
    clawL.position.set(-0.46, 0.12, 0.36);
    clawL.rotation.y = 0.45;
    const clawR = new THREE.Mesh(crabClawGeo, crabClawMat);
    clawR.position.set(0.46, 0.12, 0.36);
    clawR.rotation.y = -0.45;
    cg.add(clawL, clawR);

    // 6 jointed sideways legs
    for (let l = -1; l <= 1; l++) {
      const legL = new THREE.Mesh(crabLegGeo, crabLegMat);
      legL.position.set(-0.5, -0.05, l * 0.18);
      legL.rotation.z = 0.25;
      const legR = new THREE.Mesh(crabLegGeo, crabLegMat);
      legR.position.set(0.5, -0.05, l * 0.18);
      legR.rotation.z = -0.25;
      cg.add(legL, legR);
    }

    // Eye stalks
    const eyeL = new THREE.Mesh(crabEyeGeo, darkBeakMat);
    eyeL.position.set(-0.18, 0.2, 0.26);
    const eyeR = new THREE.Mesh(crabEyeGeo, darkBeakMat);
    eyeR.position.set(0.18, 0.2, 0.26);
    cg.add(eyeL, eyeR);

    const sc = 1.25 + (i % 3) * 0.18; // Enlarged for clear visibility at kart speed
    cg.scale.setScalar(sc);
    group.add(cg);

    crabs.push({
      root: cg,
      clawL,
      clawR,
      homePos,
      scuttleAxis: _t.clone(), // Scuttle sideways parallel to road bank
      range: 1.4 + (i % 3) * 0.55,
      speed: 1.5 + (i % 4) * 0.35,
      phase: i * 0.9,
    });
  }

  // =========================================================================
  // 4. MACACOS-PREGO (Sapajus) NAS COPAS: 7 SWINGING CAPUCHIN MONKEYS
  // =========================================================================
  const monkeys: MonkeyActor[] = [];
  const monkeyFurMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78 });
  const monkeyCapMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.72 });
  const monkeyFaceMat = new THREE.MeshStandardMaterial({ color: 0xd6b08a, roughness: 0.65 });
  const branchMat = new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.9 });

  const monkeyTorsoGeo = new THREE.BoxGeometry(0.48, 0.72, 0.36);
  const monkeyHeadGeo = new THREE.SphereGeometry(0.28, 7, 6);
  const monkeyCapGeo = new THREE.SphereGeometry(0.29, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const monkeyLimbGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.78, 5);
  const monkeyTailGeo = new THREE.CylinderGeometry(0.05, 0.04, 1.15, 5);

  const monkeyCount = Math.min(7, nearTrees.length);
  const monkeyStep = Math.max(1, Math.floor(nearTrees.length / Math.max(1, monkeyCount)));

  for (let i = 0; i < monkeyCount; i++) {
    const tree = nearTrees[(i * monkeyStep + 5) % nearTrees.length];
    const mg = new THREE.Group();
    // Position on a protruding branch facing the road for crisp silhouette visibility
    const towardRoadX = -tree.side;
    mg.position.set(tree.x, tree.y + 4.9 * tree.scale, tree.z);

    // Protruding branch extending toward road
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.16, 3.2, 6),
      branchMat
    );
    branch.rotation.z = Math.PI * 0.5;
    branch.position.set(towardRoadX * 1.4, 0, 0);
    mg.add(branch);

    // Swinging Monkey Pivot hanging from outer branch
    const swingPivot = new THREE.Group();
    swingPivot.position.set(towardRoadX * 2.35, -0.05, 0);

    // Arms gripping branch overhead
    const armL = new THREE.Mesh(monkeyLimbGeo, monkeyFurMat);
    armL.position.set(-0.22, -0.35, 0);
    const armR = new THREE.Mesh(monkeyLimbGeo, monkeyFurMat);
    armR.position.set(0.22, -0.35, 0);

    const torso = new THREE.Mesh(monkeyTorsoGeo, monkeyFurMat);
    torso.position.set(0, -0.95, 0);

    const head = new THREE.Mesh(monkeyHeadGeo, monkeyFaceMat);
    head.position.set(0, -0.52, 0.18);
    const cap = new THREE.Mesh(monkeyCapGeo, monkeyCapMat);
    cap.position.set(0, -0.49, 0.16);

    const legL = new THREE.Mesh(monkeyLimbGeo, monkeyCapMat);
    legL.position.set(-0.16, -1.52, 0.08);
    legL.rotation.x = 0.25;
    const legR = new THREE.Mesh(monkeyLimbGeo, monkeyCapMat);
    legR.position.set(0.16, -1.52, -0.06);
    legR.rotation.x = -0.2;

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, -1.18, -0.18);
    const tail = new THREE.Mesh(monkeyTailGeo, monkeyCapMat);
    tail.position.set(0, -0.45, -0.22);
    tail.rotation.x = 0.45;
    tailPivot.add(tail);

    swingPivot.add(armL, armR, torso, head, cap, legL, legR, tailPivot);
    swingPivot.scale.setScalar(1.3);
    mg.add(swingPivot);
    group.add(mg);

    monkeys.push({
      root: mg,
      swingPivot,
      tailPivot,
      phase: i * 1.35,
      speed: 2.2 + (i % 3) * 0.4,
    });
  }

  // =========================================================================
  // 5. MÃOS-PELADAS (GUAXININS DO MANGUE): 4 FORAGING NEAR BRIDGE APPROACHES
  // =========================================================================
  const raccoons: RaccoonActor[] = [];
  const raccoonFurMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.82 });
  const raccoonDarkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
  const raccoonSnoutMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.72 });

  const raccoonBodyGeo = new THREE.BoxGeometry(0.66, 0.46, 1.05);
  const raccoonHeadGeo = new THREE.BoxGeometry(0.46, 0.36, 0.46);
  const raccoonMaskGeo = new THREE.BoxGeometry(0.49, 0.14, 0.2);
  const raccoonSnoutGeo = new THREE.ConeGeometry(0.14, 0.32, 5);
  const raccoonEarGeo = new THREE.ConeGeometry(0.09, 0.18, 4);
  const raccoonLegGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.42, 5);
  const raccoonTailBandGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.2, 6);

  const raccoonSpots: { s: number; side: number }[] = [];
  bridges.forEach((br, idx) => {
    raccoonSpots.push({ s: br.startS - 14, side: idx % 2 === 0 ? 1 : -1 });
    raccoonSpots.push({ s: br.endS + 14, side: idx % 2 === 0 ? -1 : 1 });
  });

  raccoonSpots.forEach((spot, idx) => {
    sampleSplineAtS(spot.s, _p, _t, _r);
    const homePos = new THREE.Vector3(
      _p.x + _r.x * spot.side * (halfTrack + 4.8),
      mudY + 0.05,
      _p.z + _r.z * spot.side * (halfTrack + 4.8)
    );

    const rg = new THREE.Group();
    rg.position.copy(homePos);
    rg.rotation.y = Math.atan2(-_r.x * spot.side, -_r.z * spot.side);

    const body = new THREE.Mesh(raccoonBodyGeo, raccoonFurMat);
    body.position.set(0, 0.46, 0);
    rg.add(body);

    // 4 dark paws/legs
    for (const lx of [-0.22, 0.22]) {
      for (const lz of [-0.34, 0.34]) {
        const leg = new THREE.Mesh(raccoonLegGeo, raccoonDarkMat);
        leg.position.set(lx, 0.21, lz);
        rg.add(leg);
      }
    }

    // Head with iconic black bandit mask & pointed snout
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.56, 0.52);
    const head = new THREE.Mesh(raccoonHeadGeo, raccoonFurMat);
    head.position.set(0, 0, 0.14);
    const mask = new THREE.Mesh(raccoonMaskGeo, raccoonDarkMat);
    mask.position.set(0, 0.03, 0.28);
    const snout = new THREE.Mesh(raccoonSnoutGeo, raccoonSnoutMat);
    snout.rotation.x = Math.PI * 0.5;
    snout.position.set(0, -0.04, 0.48);
    const earL = new THREE.Mesh(raccoonEarGeo, raccoonDarkMat);
    earL.position.set(-0.16, 0.24, 0.08);
    const earR = new THREE.Mesh(raccoonEarGeo, raccoonDarkMat);
    earR.position.set(0.16, 0.24, 0.08);
    headPivot.add(head, mask, snout, earL, earR);
    rg.add(headPivot);

    // Striped banded tail (alternating gray & black rings)
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.5, -0.52);
    for (let ring = 0; ring < 5; ring++) {
      const seg = new THREE.Mesh(
        raccoonTailBandGeo,
        ring % 2 === 0 ? raccoonDarkMat : raccoonSnoutMat
      );
      seg.rotation.x = Math.PI * 0.42;
      seg.position.set(0, 0.04 + ring * 0.04, -0.14 - ring * 0.17);
      tailPivot.add(seg);
    }
    rg.add(tailPivot);

    rg.scale.setScalar(1.38);
    group.add(rg);

    raccoons.push({
      root: rg,
      headPivot,
      tailPivot,
      homePos,
      phase: idx * 1.7,
    });
  });

  // =========================================================================
  // 6. JACARÉS (Caiman) NOS FUROS DE MARÉ: 4 SEMI-SUBMERGED BELOW THE 2 BRIDGES
  // =========================================================================
  const caimans: CaimanActor[] = [];
  const caimanSkinMat = new THREE.MeshStandardMaterial({ color: 0x2f4228, roughness: 0.65 });
  const caimanRidgeMat = new THREE.MeshStandardMaterial({ color: 0x1e2b19, roughness: 0.72 });
  const caimanEyeMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xca8a04,
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });

  const caimanTorsoGeo = new THREE.BoxGeometry(1.05, 0.42, 2.3);
  const caimanHeadGeo = new THREE.BoxGeometry(0.76, 0.34, 1.35);
  const caimanScuteGeo = new THREE.ConeGeometry(0.14, 0.24, 4);
  const caimanTail1Geo = new THREE.BoxGeometry(0.72, 0.32, 1.35);
  const caimanTail2Geo = new THREE.BoxGeometry(0.38, 0.24, 1.25);
  const caimanEyeGeo = new THREE.SphereGeometry(0.08, 5, 5);

  bridges.forEach((br, bIdx) => {
    sampleSplineAtS(br.midS, _p, _t, _r);
    // 2 jacarés per bridge igarapé: one to the left, one to the right of the elevated deck so players see them clearly!
    const offsets = [
      { side: -1, alongCreek: 15.5, alongRoad: -6.5 },
      { side: 1, alongCreek: 16.5, alongRoad: 7.0 },
    ];

    offsets.forEach((off, oIdx) => {
      const homePos = new THREE.Vector3(
        _p.x + _r.x * off.side * off.alongCreek + _t.x * off.alongRoad,
        waterY - 0.04, // Semi-submerged right at waterline
        _p.z + _r.z * off.side * off.alongCreek + _t.z * off.alongRoad
      );
      const driftDir = _r.clone().multiplyScalar(-off.side).normalize();
      const baseYaw = Math.atan2(driftDir.x, driftDir.z);

      const jg = new THREE.Group();
      jg.position.copy(homePos);
      jg.rotation.y = baseYaw;

      const torso = new THREE.Mesh(caimanTorsoGeo, caimanSkinMat);
      torso.position.set(0, 0.08, 0);
      jg.add(torso);

      // Armored dorsal scutes along spine
      for (let sc = 0; sc < 5; sc++) {
        const ridgeL = new THREE.Mesh(caimanScuteGeo, caimanRidgeMat);
        ridgeL.position.set(-0.22, 0.32, -0.85 + sc * 0.42);
        const ridgeR = new THREE.Mesh(caimanScuteGeo, caimanRidgeMat);
        ridgeR.position.set(0.22, 0.32, -0.85 + sc * 0.42);
        jg.add(ridgeL, ridgeR);
      }

      // Snout & protruding yellow eyes above waterline
      const head = new THREE.Mesh(caimanHeadGeo, caimanSkinMat);
      head.position.set(0, 0.08, 1.65);
      const eyeL = new THREE.Mesh(caimanEyeGeo, caimanEyeMat);
      eyeL.position.set(-0.24, 0.28, 1.38);
      const eyeR = new THREE.Mesh(caimanEyeGeo, caimanEyeMat);
      eyeR.position.set(0.24, 0.28, 1.38);
      jg.add(head, eyeL, eyeR);

      // Articulated 2-segment swimming tail
      const tailSeg1 = new THREE.Group();
      tailSeg1.position.set(0, 0.05, -1.12);
      const t1 = new THREE.Mesh(caimanTail1Geo, caimanSkinMat);
      t1.position.set(0, 0, -0.62);
      const t1Ridge = new THREE.Mesh(caimanScuteGeo, caimanRidgeMat);
      t1Ridge.position.set(0, 0.22, -0.58);
      tailSeg1.add(t1, t1Ridge);

      const tailSeg2 = new THREE.Group();
      tailSeg2.position.set(0, 0, -1.24);
      const t2 = new THREE.Mesh(caimanTail2Geo, caimanRidgeMat);
      t2.position.set(0, 0, -0.58);
      tailSeg2.add(t2);
      tailSeg1.add(tailSeg2);
      jg.add(tailSeg1);

      jg.scale.setScalar(1.38); // Clearly visible (~6.2u total) from the +6.2u bridge deck!
      group.add(jg);

      caimans.push({
        root: jg,
        tailSeg1,
        tailSeg2,
        homePos,
        driftDir,
        baseYaw,
        phase: bIdx * 2.1 + oIdx * 1.4,
      });
    });
  });

  // =========================================================================
  // CONTINUOUS ZERO-GC ANIMATION LOOP FOR ALL SPECIES
  // =========================================================================
  const update = (dt: number, tSec: number, kartPos: THREE.Vector3) => {
    // 1. Flying Scarlet Guarás soaring & flapping across the sky above both bridges
    for (let i = 0; i < flyingGuaras.length; i++) {
      const fg = flyingGuaras[i];
      const angle = tSec * fg.speed + fg.phase;
      const lateralOffset = Math.sin(angle) * fg.orbitRadiusX;
      const forwardOffset = Math.cos(angle * 0.7) * fg.orbitRadiusZ + fg.formationOffset;

      fg.root.position.set(
        fg.bridgePos.x +
          fg.bridgeRight.x * lateralOffset +
          fg.bridgeTan.x * forwardOffset,
        fg.bridgePos.y + fg.baseAlt + Math.sin(tSec * 2.1 + fg.phase) * 1.15,
        fg.bridgePos.z +
          fg.bridgeRight.z * lateralOffset +
          fg.bridgeTan.z * forwardOffset
      );

      // Compute velocity tangent so birds always point forward along their sky arc
      const vx =
        fg.bridgeRight.x * Math.cos(angle) * fg.orbitRadiusX * fg.speed -
        fg.bridgeTan.x * Math.sin(angle * 0.7) * fg.orbitRadiusZ * fg.speed * 0.7;
      const vz =
        fg.bridgeRight.z * Math.cos(angle) * fg.orbitRadiusX * fg.speed -
        fg.bridgeTan.z * Math.sin(angle * 0.7) * fg.orbitRadiusZ * fg.speed * 0.7;
      fg.root.rotation.y = Math.atan2(vx, vz);

      const flap = Math.sin(tSec * 10.5 + fg.phase * 2.0) * 0.58;
      fg.wingL.rotation.z = flap;
      fg.wingR.rotation.z = -flap;
    }

    // 2. White Herons wading & taking short reactive flights when kart approaches
    for (let i = 0; i < herons.length; i++) {
      const h = herons[i];
      if (!h.activeFlight && h.canTakeOff) {
        const dx = kartPos.x - h.homePos.x;
        const dz = kartPos.z - h.homePos.z;
        if (dx * dx + dz * dz < 46 * 46) {
          h.activeFlight = true;
          h.flightT = 0;
        }
      }

      if (h.activeFlight) {
        h.flightT += dt * 0.42;
        if (h.flightT >= 1.0) {
          // Gracefully resettle back after flying arc
          h.activeFlight = false;
          h.flightT = 0;
          h.root.position.copy(h.homePos);
          h.root.rotation.y = h.homeYaw;
          h.wingL.rotation.z = 1.15;
          h.wingR.rotation.z = -1.15;
        } else {
          const arc = Math.sin(h.flightT * Math.PI);
          const distFly = h.flightT * 18;
          h.root.position.set(
            h.homePos.x + h.flightDir.x * distFly,
            h.homePos.y + arc * 7.8,
            h.homePos.z + h.flightDir.z * distFly
          );
          h.root.rotation.y = Math.atan2(h.flightDir.x, h.flightDir.z);
          const flap = Math.sin(tSec * 9.5 + h.phase) * 0.55;
          h.wingL.rotation.z = flap;
          h.wingR.rotation.z = -flap;
        }
      } else {
        // Calm wading head-bob looking for fish in the shallow water
        h.neckPivot.rotation.x = Math.sin(tSec * 1.4 + h.phase) * 0.16;
      }
    }

    // 3. Mangrove Crabs (Caranguejos-Uçá) scuttling sideways periodically
    for (let i = 0; i < crabs.length; i++) {
      const c = crabs[i];
      // Periodic burst-and-pause scuttling motion
      const cycle = Math.sin(tSec * c.speed + c.phase);
      const offset = Math.sign(cycle) * Math.pow(Math.abs(cycle), 0.75) * c.range;
      c.root.position.set(
        c.homePos.x + c.scuttleAxis.x * offset,
        c.homePos.y + Math.abs(Math.sin(tSec * 9 + c.phase)) * 0.04,
        c.homePos.z + c.scuttleAxis.z * offset
      );
      const clawWave = Math.sin(tSec * 4.2 + c.phase) * 0.25;
      c.clawL.rotation.z = clawWave;
      c.clawR.rotation.z = -clawWave;
    }

    // 4. Capuchin Monkeys (Macacos-Prego) swinging playfully in high roadside branches
    for (let i = 0; i < monkeys.length; i++) {
      const m = monkeys[i];
      m.swingPivot.rotation.z = Math.sin(tSec * m.speed + m.phase) * 0.34;
      m.swingPivot.rotation.x = Math.cos(tSec * m.speed * 0.7 + m.phase) * 0.14;
      m.tailPivot.rotation.z = Math.sin(tSec * m.speed * 1.6 + m.phase) * 0.38;
    }

    // 5. Crab-Eating Raccoons (Mãos-Peladas) foraging near bridge approaches
    for (let i = 0; i < raccoons.length; i++) {
      const r = raccoons[i];
      r.headPivot.rotation.x = 0.22 + Math.sin(tSec * 3.1 + r.phase) * 0.24;
      r.headPivot.rotation.y = Math.sin(tSec * 1.7 + r.phase) * 0.32;
      r.tailPivot.rotation.y = Math.sin(tSec * 3.6 + r.phase) * 0.28;
    }

    // 6. Caimans (Jacarés) drifting slowly & swaying tails below the elevated bridges
    for (let i = 0; i < caimans.length; i++) {
      const j = caimans[i];
      const drift = Math.sin(tSec * 0.35 + j.phase) * 4.5;
      j.root.position.set(
        j.homePos.x + j.driftDir.x * drift,
        j.homePos.y + Math.sin(tSec * 1.4 + j.phase) * 0.04,
        j.homePos.z + j.driftDir.z * drift
      );
      j.root.rotation.y = j.baseYaw + Math.sin(tSec * 0.6 + j.phase) * 0.08;
      j.tailSeg1.rotation.y = Math.sin(tSec * 2.1 + j.phase) * 0.24;
      j.tailSeg2.rotation.y = Math.sin(tSec * 2.1 + j.phase - 0.8) * 0.34;
    }
  };

  return { group, update };
}
