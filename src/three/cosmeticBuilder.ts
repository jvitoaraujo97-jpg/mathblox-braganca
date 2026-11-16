import * as THREE from 'three';

export interface BuiltCosmetic {
  group: THREE.Group;
  fireParticles: THREE.Mesh[];
  hasFireAura: boolean;
}

export function normalizeCosmeticId(rawId: string | null | undefined): string | null {
  if (!rawId) return null;
  switch (rawId) {
    case 'tophat':
    case 'hat-tophat':
      return 'top_hat';
    case 'glasses':
    case 'hat-glasses':
      return 'cyber_glasses';
    case 'helmet':
    case 'hat-helmet':
      return 'astronaut';
    case 'hat-crown':
      return 'crown';
    case 'hat-fire-aura':
      return 'fire_aura';
    case 'lightning_aura':
      return 'speed_trail';
    default:
      return rawId;
  }
}

export function buildCosmeticMesh(itemId: string): THREE.Group {
  return buildCosmeticRig(itemId).group;
}

export function buildCosmeticRig(rawItemId: string | null): BuiltCosmetic {
  const itemId = normalizeCosmeticId(rawItemId);
  const group = new THREE.Group();
  const fireParticles: THREE.Mesh[] = [];
  let hasFireAura = false;

  if (!itemId) {
    return { group, fireParticles, hasFireAura };
  }

  // Note: hatContainer is attached at headPivot (y = 1.78) + (y = 0.64) => world y = 2.42 when standing.
  // So y = 0 is top of head, y = -1.12 is torso center, and y = -2.38 is ground level at the feet.

  if (itemId === 'top_hat') {
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.35,
      metalness: 0.15,
    });
    const redBandMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.3,
      metalness: 0.4,
    });
    const goldBuckleMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.2,
      metalness: 0.85,
    });

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.08, 24), blackMat);
    brim.position.y = 0.04;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.65, 24), blackMat);
    crown.position.y = 0.38;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 24), redBandMat);
    band.position.y = 0.13;
    const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.05), goldBuckleMat);
    goldTrim.position.set(0, 0.13, 0.43);

    group.add(brim, crown, band, goldTrim);
  } else if (itemId === 'racer_helmet') {
    // 1. Capacete de Piloto Pro (Aerodynamic red/white racing helmet with dark mirrored visor)
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.22,
      metalness: 0.45,
    });
    const whiteStripeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.3,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      roughness: 0.08,
      metalness: 0.9,
    });

    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.56, 24, 20), redMat);
    shell.position.set(0, -0.24, -0.02);
    shell.scale.set(1.0, 0.96, 1.08);

    const chinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.24, 0.56), redMat);
    chinGuard.position.set(0, -0.46, 0.12);

    const racingStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.92), whiteStripeMat);
    racingStripe.position.set(0, -0.05, -0.02);

    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.24, 20, 1, false, -Math.PI * 0.38, Math.PI * 0.76), visorMat);
    visor.position.set(0, -0.22, 0.12);

    const rearSpoiler = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.28), whiteStripeMat);
    rearSpoiler.position.set(0, -0.1, -0.52);
    rearSpoiler.rotation.x = 0.3;

    group.add(shell, chinGuard, racingStripe, visor, rearSpoiler);
  } else if (itemId === 'ninja_bandana') {
    // 2. Bandana Ninja (Black headband + metallic forehead plate + 2 floating tails behind head)
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.65,
      metalness: 0.1,
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.2,
      metalness: 0.88,
    });

    const band = new THREE.Mesh(new THREE.BoxGeometry(0.69, 0.15, 0.67), clothMat);
    band.position.set(0, -0.12, 0);

    const metalPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.11, 0.05), plateMat);
    metalPlate.position.set(0, -0.12, 0.34);

    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), clothMat);
    knot.position.set(0, -0.12, -0.36);

    const tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.55), clothMat);
    tail1.position.set(-0.14, -0.16, -0.62);
    tail1.rotation.set(-0.25, -0.28, 0.15);
    tail1.name = 'ninja_tail_1';

    const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.5), clothMat);
    tail2.position.set(0.14, -0.22, -0.58);
    tail2.rotation.set(-0.35, 0.25, -0.15);
    tail2.name = 'ninja_tail_2';

    group.add(band, metalPlate, knot, tail1, tail2);
  } else if (itemId === 'cowboy_hat') {
    // 3. Chapéu Cowboy (Curved leather brim + shaped crown + golden buckle)
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.65,
      metalness: 0.08,
    });
    const darkBandMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      roughness: 0.5,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.2,
      metalness: 0.85,
    });

    const brimCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.78, 0.06, 24), leatherMat);
    brimCenter.position.y = 0.03;
    brimCenter.scale.set(1.05, 1, 1.15);

    const leftCurl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.9), leatherMat);
    leftCurl.position.set(-0.68, 0.09, 0);
    leftCurl.rotation.z = -0.45;

    const rightCurl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.9), leatherMat);
    rightCurl.position.set(0.68, 0.09, 0);
    rightCurl.rotation.z = 0.45;

    const crownMain = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.42, 20), leatherMat);
    crownMain.position.y = 0.24;

    const crownLobeL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), leatherMat);
    crownLobeL.position.set(-0.14, 0.42, 0);
    crownLobeL.scale.set(0.8, 0.6, 1.35);

    const crownLobeR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), leatherMat);
    crownLobeR.position.set(0.14, 0.42, 0);
    crownLobeR.scale.set(0.8, 0.6, 1.35);

    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.46, 0.08, 20), darkBandMat);
    ribbon.position.y = 0.09;

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), goldMat);
    buckle.position.set(0, 0.09, 0.45);

    group.add(brimCenter, leftCurl, rightCurl, crownMain, crownLobeL, crownLobeR, ribbon, buckle);
  } else if (itemId === 'cat_ears_neon') {
    // 4. Orelhas Neon Gamer (Black headband with two triangular ears with pink/cyan emissive trim)
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.3,
      metalness: 0.6,
    });
    const pinkNeonMat = new THREE.MeshStandardMaterial({
      color: 0xec4899,
      emissive: 0xec4899,
      emissiveIntensity: 1.5,
      roughness: 0.15,
    });
    const cyanNeonMat = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      emissive: 0x00f5d4,
      emissiveIntensity: 1.5,
      roughness: 0.15,
    });

    const headband = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.14), bandMat);
    headband.position.set(0, 0.03, 0);

    const makeEar = (xSign: number, neonMat: THREE.Material) => {
      const earGroup = new THREE.Group();
      earGroup.position.set(xSign * 0.26, 0.2, 0);
      earGroup.rotation.z = -xSign * 0.22;

      const outerCone = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 4), bandMat);
      outerCone.rotation.y = Math.PI / 4;

      const innerNeon = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 4), neonMat);
      innerNeon.rotation.y = Math.PI / 4;
      innerNeon.position.set(0, -0.02, 0.05);

      earGroup.add(outerCone, innerNeon);
      return earGroup;
    };

    group.add(headband, makeEar(-1, pinkNeonMat), makeEar(1, cyanNeonMat));
  } else if (itemId === 'ice_crown') {
    // 5. Coroa de Cristal de Gelo (Translucent glowing ice-blue crystal spikes around the head)
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x0284c7,
      emissiveIntensity: 1.1,
      roughness: 0.12,
      metalness: 0.35,
      transparent: true,
      opacity: 0.88,
    });
    const frostBrightMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.4,
      roughness: 0.1,
    });

    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.05, 10, 24), iceMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.05;
    group.add(baseRing);

    const spikes = 8;
    for (let i = 0; i < spikes; i++) {
      const ang = (i / spikes) * Math.PI * 2;
      const isTall = i % 2 === 0;
      const h = isTall ? 0.44 : 0.28;
      const crystal = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, h, 5),
        isTall ? frostBrightMat : iceMat
      );
      crystal.position.set(Math.cos(ang) * 0.4, h / 2 + 0.04, Math.sin(ang) * 0.4);
      crystal.rotation.x = Math.sin(ang) * 0.18;
      crystal.rotation.z = -Math.cos(ang) * 0.18;
      group.add(crystal);
    }
  } else if (itemId === 'crown') {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.8,
      roughness: 0.2,
    });
    const rubyMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.5,
      roughness: 0.15,
      metalness: 0.25,
    });
    const sapphireMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.5,
      roughness: 0.15,
      metalness: 0.25,
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.41, 0.18, 24), goldMat);
    base.position.y = 0.09;
    group.add(base);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 10, 24), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.03;
    group.add(rim);

    const numSpikes = 6;
    for (let i = 0; i < numSpikes; i++) {
      const angle = (i / numSpikes) * Math.PI * 2;
      const r = 0.39;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 12), goldMat);
      spike.position.set(Math.cos(angle) * r, 0.3, Math.sin(angle) * r);
      group.add(spike);

      const tipPearl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), goldMat);
      tipPearl.position.set(Math.cos(angle) * r, 0.44, Math.sin(angle) * r);
      group.add(tipPearl);

      const jewel = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 12),
        i % 2 === 0 ? rubyMat : sapphireMat
      );
      jewel.position.set(Math.cos(angle) * 0.43, 0.09, Math.sin(angle) * 0.43);
      group.add(jewel);
    }
  } else if (itemId === 'astronaut') {
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.65,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.7,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      emissive: 0x00f5d4,
      emissiveIntensity: 1.5,
      roughness: 0.1,
    });

    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 24), visorMat);
    dome.position.y = -0.25;
    dome.renderOrder = 2;

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.16, 24), collarMat);
    collar.position.y = -0.62;

    const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.045, 12, 24), accentMat);
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.y = -0.55;

    const earPod = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16), collarMat);
    earPod.rotation.z = Math.PI / 2;
    earPod.position.set(0.68, -0.25, 0);

    const antennaRod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.48, 10), accentMat);
    antennaRod.position.set(0.72, 0.05, 0);

    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 14), beaconMat);
    antennaTip.position.set(0.72, 0.32, 0);

    group.add(dome, collar, collarRing, earPod, antennaRod, antennaTip);
  } else if (itemId === 'cyber_glasses') {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.3,
      metalness: 0.7,
    });
    const cyanLensMat = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      emissive: new THREE.Color('#00F5D4'),
      emissiveIntensity: 1.4,
      roughness: 0.1,
      metalness: 0.3,
    });
    const magentaLensMat = new THREE.MeshStandardMaterial({
      color: 0xf72585,
      emissive: new THREE.Color('#F72585'),
      emissiveIntensity: 1.4,
      roughness: 0.1,
      metalness: 0.3,
    });

    const eyeY = -0.24;
    const frontFrame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.2, 0.06), frameMat);
    frontFrame.position.set(0, eyeY, 0.33);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 0.08), frameMat);
    topBar.position.set(0, eyeY + 0.09, 0.34);
    const leftLens = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.05), cyanLensMat);
    leftLens.position.set(-0.17, eyeY, 0.355);
    const rightLens = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.05), magentaLensMat);
    rightLens.position.set(0.17, eyeY, 0.355);
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.56), frameMat);
    leftArm.position.set(-0.35, eyeY, 0.08);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.56), frameMat);
    rightArm.position.set(0.35, eyeY, 0.08);

    group.add(frontFrame, topBar, leftLens, rightLens, leftArm, rightArm);
  } else if (itemId === 'wizard_hat') {
    const purpleMat = new THREE.MeshStandardMaterial({
      color: 0x6d28d9,
      roughness: 0.55,
      metalness: 0.1,
    });
    const goldRibbonMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.8,
    });

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.06, 24), purpleMat);
    brim.position.y = 0.03;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.47, 0.1, 20), goldRibbonMat);
    band.position.y = 0.09;
    const lowerCone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.65, 20), purpleMat);
    lowerCone.position.y = 0.38;
    const upperTip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 18), purpleMat);
    upperTip.position.set(0, 0.78, -0.1);
    upperTip.rotation.x = -0.32;
    upperTip.rotation.z = 0.15;

    group.add(brim, band, lowerCone, upperTip);

    const starPositions = [
      { x: 0, y: 0.36, z: 0.32 },
      { x: 0.26, y: 0.46, z: 0.12 },
      { x: -0.25, y: 0.42, z: 0.14 },
      { x: 0.14, y: 0.62, z: -0.18 },
      { x: -0.16, y: 0.28, z: -0.28 },
    ];
    for (const sp of starPositions) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), goldRibbonMat);
      star.position.set(sp.x, sp.y, sp.z);
      group.add(star);
    }
  } else if (itemId === 'jetpack_wings') {
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.8,
    });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 1.1,
      roughness: 0.2,
      metalness: 0.4,
    });
    const backY = -1.05;
    const backZ = -0.32;

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.2), metalMat);
    core.position.set(0, backY, backZ);
    const leftThruster = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.58, 14), metalMat);
    leftThruster.position.set(-0.22, backY, backZ - 0.04);
    const rightThruster = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.58, 14), metalMat);
    rightThruster.position.set(0.22, backY, backZ - 0.04);
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.24, 0.05), wingMat);
    leftWing.position.set(-0.56, backY + 0.1, backZ - 0.05);
    leftWing.rotation.z = 0.28;
    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.24, 0.05), wingMat);
    rightWing.position.set(0.56, backY + 0.1, backZ - 0.05);
    rightWing.rotation.z = -0.28;

    group.add(core, leftThruster, rightThruster, leftWing, rightWing);
  } else if (itemId === 'golden_cape' || itemId === 'hero_cape') {
    // 6. Capa de Super-Herói / Manto Real Dourado (Shoulder-mounted cape that waves)
    const isHero = itemId === 'hero_cape';
    const capeMat = new THREE.MeshStandardMaterial({
      color: isHero ? 0xdc2626 : 0xb91c1c,
      roughness: 0.5,
      metalness: 0.12,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.85,
    });
    const backY = -1.15;
    const backZ = -0.28;

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.52), goldMat);
    collar.position.set(0, -0.7, 0);

    const capePivot = new THREE.Group();
    capePivot.position.set(0, -0.7, backZ);
    capePivot.name = 'waving_cape_pivot';

    const capeBody = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.18, 0.06), capeMat);
    capeBody.position.set(0, -0.52, 0);
    capeBody.rotation.x = 0.16;

    const capeTrim = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.07), goldMat);
    capeTrim.position.set(0, -1.06, -0.08);

    if (isHero) {
      const heroCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), goldMat);
      heroCrest.position.set(0, -0.45, -0.04);
      heroCrest.scale.set(1.2, 1.2, 0.35);
      capePivot.add(heroCrest);
    }

    capePivot.add(capeBody, capeTrim);
    group.add(collar, capePivot);
    group.position.y = backY + 1.15;
  } else if (itemId === 'nitro_twin') {
    // 7. Propulsor Nitro Duplo (Two metallic blue cylindrical tanks with pipes and blue flame at base)
    const blueTankMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.22,
      metalness: 0.8,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.18,
      metalness: 0.9,
    });
    const blueFlameMat = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      emissive: 0x00f5d4,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    });

    const backY = -1.05;
    const backZ = -0.34;

    const manifold = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.18), chromeMat);
    manifold.position.set(0, backY + 0.15, backZ + 0.06);
    group.add(manifold);

    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.68, 16), blueTankMat);
      tank.position.set(side * 0.22, backY, backZ);

      const domeTop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), chromeMat);
      domeTop.position.set(side * 0.22, backY + 0.34, backZ);

      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.14, 12), chromeMat);
      nozzle.position.set(side * 0.22, backY - 0.38, backZ);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 10), blueFlameMat);
      flame.position.set(side * 0.22, backY - 0.56, backZ);
      flame.rotation.x = Math.PI;
      flame.name = `nitro_flame_${side}`;

      group.add(tank, domeTop, nozzle, flame);
    }
  } else if (itemId === 'legend_shield') {
    // 8. Escudo Lendário (Hexagonal metallic gold and royal blue shield strapped to the back)
    const goldFrameMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.88,
    });
    const royalBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1e40af,
      roughness: 0.35,
      metalness: 0.55,
    });
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.3,
    });

    const backY = -1.06;
    const backZ = -0.28;

    const hexOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 6), goldFrameMat);
    hexOuter.rotation.x = Math.PI / 2;
    hexOuter.position.set(0, backY, backZ);

    const hexInner = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 6), royalBlueMat);
    hexInner.rotation.x = Math.PI / 2;
    hexInner.position.set(0, backY, backZ - 0.01);

    const centerCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), gemMat);
    centerCrest.position.set(0, backY, backZ - 0.07);

    group.add(hexOuter, hexInner, centerCrest);
  } else if (
    itemId === 'speed_trail' ||
    itemId === 'star_orbit' ||
    itemId === 'fire_aura' ||
    itemId === 'shadow_aura' ||
    itemId === 'champion_aura'
  ) {
    hasFireAura = true;
    const auraRoot = new THREE.Group();
    auraRoot.name = 'equipped_aura_root';
    auraRoot.userData.auraType = itemId;

    // Ground level relative to hatContainer (y = 2.42) is y = -2.35; torso center is y = -1.1
    const feetY = -2.32;
    const bodyCenterY = -1.15;

    if (itemId === 'speed_trail') {
      // 1. Aura Elétrica (Eletricidade Real em 3D):
      // 5 zig-zag 3D lightning arcs + 2 concentric spinning foot rings + 10 electric sparks
      const boltCyanMat = new THREE.LineBasicMaterial({ color: 0x00f5d4 });
      const boltBlueMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
      const bolts: THREE.Line[] = [];

      for (let b = 0; b < 5; b++) {
        const points: THREE.Vector3[] = [];
        const segments = 8;
        const baseAngle = (b / 5) * Math.PI * 2;
        for (let s = 0; s <= segments; s++) {
          const t = s / segments;
          const py = feetY + t * 2.45;
          const rad = 0.68 + Math.sin(t * Math.PI) * 0.18;
          const ang = baseAngle + (s % 2 === 0 ? 0.18 : -0.18);
          points.push(new THREE.Vector3(Math.cos(ang) * rad, py, Math.sin(ang) * rad));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, b % 2 === 0 ? boltCyanMat : boltBlueMat);
        line.userData.baseAngle = baseAngle;
        auraRoot.add(line);
        bolts.push(line);
      }

      const ringMat1 = new THREE.MeshStandardMaterial({
        color: 0x00f5d4,
        emissive: 0x00f5d4,
        emissiveIntensity: 1.6,
        roughness: 0.1,
      });
      const ringMat2 = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.5,
        roughness: 0.1,
      });

      const footRingOuter = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.035, 10, 28), ringMat1);
      footRingOuter.rotation.x = Math.PI / 2;
      footRingOuter.position.y = feetY + 0.05;

      const footRingInner = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.03, 10, 24), ringMat2);
      footRingInner.rotation.x = Math.PI / 2;
      footRingInner.position.y = feetY + 0.08;

      auraRoot.add(footRingOuter, footRingInner);

      const sparks: THREE.Mesh[] = [];
      const sparkGeo = new THREE.OctahedronGeometry(0.085, 0);
      for (let i = 0; i < 10; i++) {
        const sp = new THREE.Mesh(sparkGeo, i % 2 === 0 ? ringMat1 : ringMat2);
        const ang = (i / 10) * Math.PI * 2;
        sp.position.set(Math.cos(ang) * 0.85, feetY + (i / 10) * 2.2, Math.sin(ang) * 0.85);
        auraRoot.add(sp);
        sparks.push(sp);
        fireParticles.push(sp);
      }

      auraRoot.userData.bolts = bolts;
      auraRoot.userData.lastBoltUpdate = 0;
      auraRoot.userData.footRingOuter = footRingOuter;
      auraRoot.userData.footRingInner = footRingInner;
      auraRoot.userData.sparks = sparks;
    } else if (itemId === 'star_orbit') {
      // 2. Aura Energia Estelar: 2 tilted glowing rings rotating on opposite axes + 6 orbiting 3D stars
      const goldRingMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 1.4,
        roughness: 0.15,
      });
      const cyanRingMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x00f5d4,
        emissiveIntensity: 1.4,
        roughness: 0.15,
      });

      const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.032, 12, 36), goldRingMat);
      ringA.position.y = bodyCenterY;
      ringA.rotation.x = 0.65;

      const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.032, 12, 36), cyanRingMat);
      ringB.position.y = bodyCenterY;
      ringB.rotation.x = -0.65;

      auraRoot.add(ringA, ringB);

      const stars: THREE.Mesh[] = [];
      const starGeo = new THREE.OctahedronGeometry(0.14, 0);
      for (let i = 0; i < 6; i++) {
        const star = new THREE.Mesh(starGeo, i % 2 === 0 ? goldRingMat : cyanRingMat);
        const ang = (i / 6) * Math.PI * 2;
        star.position.set(Math.cos(ang) * 0.95, bodyCenterY + (i - 2.5) * 0.25, Math.sin(ang) * 0.95);
        auraRoot.add(star);
        stars.push(star);
        fireParticles.push(star);
      }

      auraRoot.userData.ringA = ringA;
      auraRoot.userData.ringB = ringB;
      auraRoot.userData.stars = stars;
    } else if (itemId === 'fire_aura') {
      // 3. Aura de Fogo Supremo: Ember ring at base + 12 flame particles rising continuously in loop
      const orangeFlameMat = new THREE.MeshStandardMaterial({
        color: 0xff5400,
        emissive: 0xff5400,
        emissiveIntensity: 1.6,
        roughness: 0.15,
      });
      const yellowFlameMat = new THREE.MeshStandardMaterial({
        color: 0xffbd00,
        emissive: 0xffbd00,
        emissiveIntensity: 1.7,
        roughness: 0.15,
      });

      const emberRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.88, 0.045, 12, 32),
        orangeFlameMat
      );
      emberRing.rotation.x = Math.PI / 2;
      emberRing.position.y = feetY + 0.06;
      auraRoot.add(emberRing);

      const flames: THREE.Mesh[] = [];
      const flameGeo = new THREE.OctahedronGeometry(0.15, 0);
      for (let i = 0; i < 12; i++) {
        const flame = new THREE.Mesh(flameGeo, i % 2 === 0 ? orangeFlameMat : yellowFlameMat);
        flame.scale.set(0.8, 1.45, 0.8);
        const ang = (i / 12) * Math.PI * 2;
        flame.position.set(
          Math.cos(ang) * 0.82,
          feetY + ((i / 12) * 2.1),
          Math.sin(ang) * 0.82
        );
        auraRoot.add(flame);
        flames.push(flame);
        fireParticles.push(flame);
      }

      auraRoot.userData.emberRing = emberRing;
      auraRoot.userData.flames = flames;
    } else if (itemId === 'shadow_aura') {
      // 4. Aura Sombria Roxa: Vortex of dark purple rings (#7C3AED) + floating crystals
      const purpleMat = new THREE.MeshStandardMaterial({
        color: 0x7c3aed,
        emissive: 0x6d28d9,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      });
      const magentaMat = new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        emissive: 0x9333ea,
        emissiveIntensity: 1.6,
        roughness: 0.15,
      });

      const rings: THREE.Mesh[] = [];
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.75 + r * 0.14, 0.03, 10, 28),
          r % 2 === 0 ? purpleMat : magentaMat
        );
        ring.rotation.x = Math.PI / 2 + (r - 1) * 0.22;
        ring.position.y = feetY + 0.35 + r * 0.65;
        auraRoot.add(ring);
        rings.push(ring);
      }

      const crystals: THREE.Mesh[] = [];
      const crystalGeo = new THREE.OctahedronGeometry(0.13, 0);
      for (let i = 0; i < 8; i++) {
        const cr = new THREE.Mesh(crystalGeo, i % 2 === 0 ? magentaMat : purpleMat);
        cr.scale.set(0.7, 1.5, 0.7);
        const ang = (i / 8) * Math.PI * 2;
        cr.position.set(Math.cos(ang) * 0.9, bodyCenterY, Math.sin(ang) * 0.9);
        auraRoot.add(cr);
        crystals.push(cr);
        fireParticles.push(cr);
      }

      auraRoot.userData.rings = rings;
      auraRoot.userData.crystals = crystals;
    } else if (itemId === 'champion_aura') {
      // 5. Aura Arco-Íris Campeão: Energy rings + crystals that cycle smoothly across the HSL spectrum
      const hslMaterials: THREE.MeshStandardMaterial[] = [];
      const rings: THREE.Mesh[] = [];

      for (let r = 0; r < 3; r++) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0xff0055,
          emissive: 0xff0055,
          emissiveIntensity: 1.5,
          roughness: 0.15,
        });
        hslMaterials.push(mat);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.035, 12, 36), mat);
        ring.position.y = bodyCenterY;
        ring.rotation.x = (r * Math.PI) / 3;
        auraRoot.add(ring);
        rings.push(ring);
      }

      const orbs: THREE.Mesh[] = [];
      const orbGeo = new THREE.OctahedronGeometry(0.14, 0);
      for (let i = 0; i < 8; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x00f5d4,
          emissive: 0x00f5d4,
          emissiveIntensity: 1.6,
          roughness: 0.1,
        });
        hslMaterials.push(mat);
        const orb = new THREE.Mesh(orbGeo, mat);
        const ang = (i / 8) * Math.PI * 2;
        orb.position.set(Math.cos(ang) * 1.0, bodyCenterY, Math.sin(ang) * 1.0);
        auraRoot.add(orb);
        orbs.push(orb);
        fireParticles.push(orb);
      }

      auraRoot.userData.rings = rings;
      auraRoot.userData.orbs = orbs;
      auraRoot.userData.hslMaterials = hslMaterials;
    }

    group.add(auraRoot);
  }

  return { group, fireParticles, hasFireAura };
}

/**
 * Atualiza em tempo real (60 FPS) todas as Auras 3D e acessórios dinâmicos (capa, chamas de nitro, bandana)
 * tanto no Palco 3D da Loja quanto em todas as modalidades 3D (Praça, Obby, Sobrevivência, Corrida e Kart).
 */
export function animateEquippedAuras(
  avatarRoot: THREE.Object3D,
  elapsedTime: number,
  isFarmingAura = false
): void {
  const feetY = -2.32;
  const bodyCenterY = -1.15;
  const effectiveElapsed = isFarmingAura ? elapsedTime * 2.2 : elapsedTime;
  const targetScale = isFarmingAura ? 1.85 : 1.0;

  avatarRoot.traverse((obj) => {
    if (obj.name === 'waving_cape_pivot') {
      obj.rotation.x = 0.18 + Math.sin(effectiveElapsed * 6.5) * 0.12;
    } else if (obj.name.startsWith('nitro_flame_')) {
      const s = 0.85 + Math.sin(effectiveElapsed * 28) * 0.25;
      obj.scale.set(1, s, 1);
    } else if (obj.name === 'ninja_tail_1') {
      obj.rotation.x = -0.25 + Math.sin(effectiveElapsed * 8) * 0.15;
    } else if (obj.name === 'ninja_tail_2') {
      obj.rotation.x = -0.35 + Math.cos(effectiveElapsed * 8) * 0.15;
    }

    if (obj.name !== 'equipped_aura_root') return;
    obj.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15);
    const auraType = obj.userData.auraType as string;

    if (auraType === 'speed_trail') {
      // 1. Aura Elétrica: Recalculate zig-zag lightning vertices every 0.08s
      const bolts = (obj.userData.bolts as THREE.Line[]) || [];
      const lastUpdate = (obj.userData.lastBoltUpdate as number) || 0;
      const interval = isFarmingAura ? 0.04 : 0.08;
      if (elapsedTime - lastUpdate >= interval) {
        obj.userData.lastBoltUpdate = elapsedTime;
        bolts.forEach((line, bIdx) => {
          const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
          const segments = posAttr.count - 1;
          const baseAngle = (bIdx / 5) * Math.PI * 2 + effectiveElapsed * 1.8;
          for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const py = feetY + t * 2.45;
            const jitterAng = baseAngle + (Math.random() - 0.5) * 0.55;
            const jitterRad = 0.62 + (Math.random() - 0.5) * 0.28;
            posAttr.setXYZ(
              s,
              Math.cos(jitterAng) * jitterRad,
              py,
              Math.sin(jitterAng) * jitterRad
            );
          }
          posAttr.needsUpdate = true;
        });
      }

      const outerRing = obj.userData.footRingOuter as THREE.Mesh | undefined;
      const innerRing = obj.userData.footRingInner as THREE.Mesh | undefined;
      if (outerRing) outerRing.rotation.z = effectiveElapsed * 3.5;
      if (innerRing) innerRing.rotation.z = -effectiveElapsed * 4.5;

      const sparks = (obj.userData.sparks as THREE.Mesh[]) || [];
      sparks.forEach((sp, idx) => {
        const ang = effectiveElapsed * 5.2 + (idx / sparks.length) * Math.PI * 2;
        const r = 0.78 + Math.sin(effectiveElapsed * 12 + idx) * 0.14;
        sp.position.x = Math.cos(ang) * r;
        sp.position.z = Math.sin(ang) * r;
        sp.position.y = feetY + 0.2 + ((effectiveElapsed * 2.4 + idx * 0.22) % 2.1);
        sp.rotation.x += 0.15;
        sp.rotation.y += 0.2;
      });
    } else if (auraType === 'star_orbit') {
      // 2. Aura Estelar: 2 tilted rings rotating on opposite axes + 6 stars orbiting
      const ringA = obj.userData.ringA as THREE.Mesh | undefined;
      const ringB = obj.userData.ringB as THREE.Mesh | undefined;
      if (ringA) {
        ringA.rotation.y = effectiveElapsed * 2.2;
        ringA.rotation.z = effectiveElapsed * 1.1;
      }
      if (ringB) {
        ringB.rotation.y = -effectiveElapsed * 2.2;
        ringB.rotation.z = -effectiveElapsed * 1.3;
      }
      const stars = (obj.userData.stars as THREE.Mesh[]) || [];
      stars.forEach((st, idx) => {
        const ang = effectiveElapsed * 2.6 + (idx / stars.length) * Math.PI * 2;
        st.position.x = Math.cos(ang) * 0.96;
        st.position.z = Math.sin(ang) * 0.96;
        st.position.y = bodyCenterY + Math.sin(effectiveElapsed * 3.2 + idx * 1.1) * 0.55;
        st.rotation.y = effectiveElapsed * 4;
      });
    } else if (auraType === 'fire_aura') {
      // 3. Aura de Fogo Supremo: 12 flame particles rising from feet to above shoulders and shrinking
      const emberRing = obj.userData.emberRing as THREE.Mesh | undefined;
      if (emberRing) emberRing.rotation.z = effectiveElapsed * 2.0;

      const flames = (obj.userData.flames as THREE.Mesh[]) || [];
      flames.forEach((fl, idx) => {
        const cycle = (effectiveElapsed * 0.95 + idx / flames.length) % 1;
        const ang = (idx / flames.length) * Math.PI * 2 + cycle * 2.2;
        const radius = 0.82 * (1 - cycle * 0.25);
        fl.position.x = Math.cos(ang) * radius;
        fl.position.z = Math.sin(ang) * radius;
        fl.position.y = feetY + 0.1 + cycle * 2.25;
        const scale = Math.max(0.15, 1.15 * (1 - cycle * 0.75));
        fl.scale.set(scale * 0.8, scale * 1.4, scale * 0.8);
        fl.rotation.y = effectiveElapsed * 3 + idx;
      });
    } else if (auraType === 'shadow_aura') {
      // 4. Aura Sombria Roxa: Vortex rings + floating crystals
      const rings = (obj.userData.rings as THREE.Mesh[]) || [];
      rings.forEach((r, idx) => {
        r.rotation.z = effectiveElapsed * (idx % 2 === 0 ? 2.5 : -2.5);
        r.position.y = feetY + 0.35 + idx * 0.65 + Math.sin(effectiveElapsed * 3 + idx) * 0.08;
      });
      const crystals = (obj.userData.crystals as THREE.Mesh[]) || [];
      crystals.forEach((cr, idx) => {
        const ang = -effectiveElapsed * 2.4 + (idx / crystals.length) * Math.PI * 2;
        cr.position.x = Math.cos(ang) * 0.88;
        cr.position.z = Math.sin(ang) * 0.88;
        cr.position.y = bodyCenterY + Math.cos(effectiveElapsed * 3 + idx) * 0.5;
        cr.rotation.y = effectiveElapsed * 3.5;
      });
    } else if (auraType === 'champion_aura') {
      // 5. Aura Arco-Íris Campeão: Smooth HSL color cycling + multi-axis rings
      const rings = (obj.userData.rings as THREE.Mesh[]) || [];
      rings.forEach((r, idx) => {
        r.rotation.y = effectiveElapsed * (1.8 + idx * 0.5);
        r.rotation.z = effectiveElapsed * (idx % 2 === 0 ? 1.4 : -1.4);
      });
      const orbs = (obj.userData.orbs as THREE.Mesh[]) || [];
      orbs.forEach((orb, idx) => {
        const ang = effectiveElapsed * 3.0 + (idx / orbs.length) * Math.PI * 2;
        orb.position.x = Math.cos(ang) * 0.98;
        orb.position.z = Math.sin(ang) * 0.98;
        orb.position.y = bodyCenterY + Math.sin(effectiveElapsed * 4 + idx) * 0.52;
        orb.rotation.x = effectiveElapsed * 3;
        orb.rotation.y = effectiveElapsed * 4;
      });
      const mats = (obj.userData.hslMaterials as THREE.MeshStandardMaterial[]) || [];
      mats.forEach((m, idx) => {
        const hue = (effectiveElapsed * 0.35 + idx * 0.09) % 1;
        m.color.setHSL(hue, 0.95, 0.55);
        m.emissive.setHSL(hue, 0.95, 0.48);
      });
    }
  });
}

const thumbnailCache = new Map<string, string>();
let sharedThumbRenderer: THREE.WebGLRenderer | null = null;

export function getCosmeticThumbnailDataUrl(itemId: string): string {
  const cached = thumbnailCache.get(itemId);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';

  try {
    if (!sharedThumbRenderer) {
      sharedThumbRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      sharedThumbRenderer.setSize(220, 220);
      sharedThumbRenderer.setPixelRatio(1);
      sharedThumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
      sharedThumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      sharedThumbRenderer.toneMappingExposure = 1.15;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.1);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfffbeb, 2.0);
    dir.position.set(3, 5, 4);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0x38bdf8, 1.0);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    const meshGroup = buildCosmeticMesh(itemId);
    scene.add(meshGroup);

    const box = new THREE.Box3().setFromObject(meshGroup);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    meshGroup.position.sub(center);
    meshGroup.rotation.y = 0.45;
    meshGroup.rotation.x = 0.12;

    const maxDim = Math.max(size.x, size.y, size.z, 0.8);
    camera.position.set(0, maxDim * 0.25, maxDim * 2.05);
    camera.lookAt(0, 0, 0);

    sharedThumbRenderer.render(scene, camera);
    const dataUrl = sharedThumbRenderer.domElement.toDataURL('image/png');
    thumbnailCache.set(itemId, dataUrl);

    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });

    return dataUrl;
  } catch {
    return '';
  }
}
