import * as THREE from 'three';
import {
  animateEquippedAuras,
  buildCosmeticRig,
  normalizeCosmeticId,
} from '../three/cosmeticBuilder';
import { buildJerseyTextures } from '../three/jerseyBuilder';
import { AvatarEmote, MovementStyle } from '../types/game';
import { createFaceTexture } from './textures';

export interface AvatarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  hatContainer: THREE.Group;
  trophyProp: THREE.Group;
  championSparksGroup: THREE.Group;
  farmingAuraGroup: THREE.Group;
  fireParticles: THREE.Mesh[];
  hasFireAura: boolean;
}

export function createAvatarRig(
  avatarColorHex: string,
  equippedHat: string | null,
  equippedJersey?: string | null
): AvatarRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xfcd34d,
    roughness: 0.55,
    metalness: 0.05,
  });

  const jerseyData = equippedJersey ? buildJerseyTextures(equippedJersey) : null;

  const baseOutfitMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(jerseyData ? jerseyData.sleeveColor : avatarColorHex),
    roughness: 0.42,
    metalness: 0.12,
  });

  const pantsMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(jerseyData ? jerseyData.shortsColor : '#1e293b'),
    roughness: 0.65,
    metalness: 0.05,
  });

  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.1,
  });

  const beltMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.5,
  });

  // Legs (pivot at hip y = 0.85)
  const makeLeg = (xOffset: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(xOffset, 0.85, 0);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.65, 0.38), pantsMat);
    upper.position.y = -0.325;
    upper.castShadow = true;
    upper.receiveShadow = true;

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.44), shoeMat);
    shoe.position.set(0, -0.75, 0.03);
    shoe.castShadow = true;
    shoe.receiveShadow = true;

    pivot.add(upper, shoe);
    return pivot;
  };

  const leftLegPivot = makeLeg(-0.2);
  const rightLegPivot = makeLeg(0.2);
  bodyGroup.add(leftLegPivot, rightLegPivot);

  // Torso (y = 0.85 to 1.75)
  let torsoMaterials: THREE.Material | THREE.Material[] = baseOutfitMat;
  if (jerseyData) {
    const frontMat = new THREE.MeshStandardMaterial({
      map: jerseyData.frontMap,
      roughness: 0.4,
      metalness: 0.08,
    });
    const backMat = new THREE.MeshStandardMaterial({
      map: jerseyData.backMap,
      roughness: 0.4,
      metalness: 0.08,
    });
    // +X, -X, +Y, -Y, +Z (front chest), -Z (back with #10)
    torsoMaterials = [
      baseOutfitMat,
      baseOutfitMat,
      baseOutfitMat,
      baseOutfitMat,
      frontMat,
      backMat,
    ];
  }

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.88, 0.44), torsoMaterials);
  torso.position.set(0, 1.3, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);

  // Belt & chest accent (only show default emblem when not wearing a club jersey)
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.12, 0.47), beltMat);
  belt.position.set(0, 0.92, 0);
  bodyGroup.add(belt);

  if (!jerseyData) {
    const emblem = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.3 })
    );
    emblem.position.set(0, 1.38, 0.22);
    bodyGroup.add(emblem);
  }

  // Arms (pivot at shoulder y = 1.66)
  const makeArm = (xOffset: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(xOffset, 1.66, 0);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.56, 0.34), baseOutfitMat);
    sleeve.position.y = -0.22;
    sleeve.castShadow = true;

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), skinMat);
    hand.position.y = -0.62;
    hand.castShadow = true;

    pivot.add(sleeve, hand);
    return pivot;
  };

  const leftArmPivot = makeArm(-0.6);
  const rightArmPivot = makeArm(0.6);
  bodyGroup.add(leftArmPivot, rightArmPivot);

  // Golden Trophy Prop attached to right hand for the "Mostrar Troféu" emote
  const trophyProp = new THREE.Group();
  trophyProp.position.set(0, -0.78, 0.22);
  trophyProp.rotation.x = Math.PI / 2;
  trophyProp.visible = false;
  const goldTrophyMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xca8a04,
    emissiveIntensity: 0.35,
    metalness: 0.85,
    roughness: 0.2,
  });
  const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.08, 12), goldTrophyMat);
  const tStem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 10), goldTrophyMat);
  tStem.position.y = 0.14;
  const tCup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.25, 14), goldTrophyMat);
  tCup.position.y = 0.34;
  trophyProp.add(tBase, tStem, tCup);
  rightArmPivot.add(trophyProp);

  // Head (pivot at neck y = 1.78)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.78, 0);

  const faceTex = createFaceTexture();
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    roughness: 0.45,
    metalness: 0.05,
  });

  // 6 materials for box: +X, -X, +Y, -Y, +Z (front face), -Z
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.62, 0.62), [
    skinMat,
    skinMat,
    skinMat,
    skinMat,
    faceMat,
    skinMat,
  ]);
  headMesh.position.y = 0.33;
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;

  // Classic R6 top stud on head
  const headStud = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16), skinMat);
  headStud.position.y = 0.67;

  headPivot.add(headMesh, headStud);

  // Hat / Back / Aura attachment using shared 3D cosmeticBuilder
  const hatContainer = new THREE.Group();
  hatContainer.position.set(0, 0.64, 0);
  const builtHat = buildCosmeticRig(normalizeCosmeticId(equippedHat));
  hatContainer.add(builtHat.group);
  headPivot.add(hatContainer);

  bodyGroup.add(headPivot);

  // Golden Step Sparkles for "Passo Campeão" (movementStyle === 'champion')
  const championSparksGroup = new THREE.Group();
  championSparksGroup.visible = false;
  const sparkMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xeab308,
    emissiveIntensity: 1.5,
    roughness: 0.15,
  });
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), sparkMat);
    const ang = (i / 6) * Math.PI * 2;
    sp.position.set(Math.cos(ang) * 0.48, 0.12, Math.sin(ang) * 0.48);
    championSparksGroup.add(sp);
  }
  root.add(championSparksGroup);

  // Concentration Energy Rings & Lightning for "Farmar Aura" mode
  const farmingAuraGroup = new THREE.Group();
  farmingAuraGroup.visible = false;
  const farmCyanMat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4,
    emissive: 0x00f5d4,
    emissiveIntensity: 1.7,
    roughness: 0.1,
  });
  const farmGoldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xeab308,
    emissiveIntensity: 1.6,
    roughness: 0.1,
  });
  const farmRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.04, 12, 36), farmCyanMat);
  farmRing1.rotation.x = Math.PI / 2;
  farmRing1.position.y = 0.25;
  farmRing1.name = 'farm_ring_1';

  const farmRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 12, 36), farmGoldMat);
  farmRing2.rotation.x = Math.PI / 2 + 0.35;
  farmRing2.position.y = 1.35;
  farmRing2.name = 'farm_ring_2';

  const farmRing3 = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 12, 36), farmCyanMat);
  farmRing3.rotation.x = Math.PI / 2 - 0.35;
  farmRing3.position.y = 1.35;
  farmRing3.name = 'farm_ring_3';

  farmingAuraGroup.add(farmRing1, farmRing2, farmRing3);
  for (let i = 0; i < 8; i++) {
    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      i % 2 === 0 ? farmGoldMat : farmCyanMat
    );
    shard.scale.set(0.7, 1.8, 0.7);
    const ang = (i / 8) * Math.PI * 2;
    shard.position.set(Math.cos(ang) * 1.25, 0.6 + (i % 3) * 0.65, Math.sin(ang) * 1.25);
    shard.name = `farm_shard_${i}`;
    farmingAuraGroup.add(shard);
  }
  root.add(farmingAuraGroup);

  return {
    root,
    bodyGroup,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    hatContainer,
    trophyProp,
    championSparksGroup,
    farmingAuraGroup,
    fireParticles: builtHat.fireParticles,
    hasFireAura: builtHat.hasFireAura,
  };
}

export function updateAvatarHat(rig: AvatarRig, equippedHat: string | null): void {
  while (rig.hatContainer.children.length > 0) {
    rig.hatContainer.remove(rig.hatContainer.children[0]);
  }
  const built = buildCosmeticRig(normalizeCosmeticId(equippedHat));
  rig.hatContainer.add(built.group);
  rig.fireParticles = built.fireParticles;
  rig.hasFireAura = built.hasFireAura;
}

export function animateAvatarRig(
  rig: AvatarRig,
  horizontalSpeed: number,
  isGrounded: boolean,
  elapsed: number,
  delta: number,
  activeEmote: AvatarEmote = null,
  movementStyle: MovementStyle = 'classic',
  isFarmingAura = false
): void {
  const speedRatio = Math.min(1.3, horizontalSpeed / 7.5);
  rig.trophyProp.visible = activeEmote === 'trophy' && !isFarmingAura;
  rig.farmingAuraGroup.visible = isFarmingAura;
  rig.championSparksGroup.visible =
    !isFarmingAura && movementStyle === 'champion' && speedRatio > 0.08 && isGrounded;

  if (isFarmingAura) {
    // ⚡ Pose de Concentração / Levitação ("Farmar Aura"):
    // Flutua 0.6 unidades acima do chão, cruza os braços carregando energia e inclina levemente para frente
    const hoverY = 0.6 + Math.sin(elapsed * 4.2) * 0.09;
    rig.bodyGroup.position.y = THREE.MathUtils.damp(rig.bodyGroup.position.y, hoverY, 12, delta);
    rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, 0.14, 10, delta);
    rig.bodyGroup.rotation.y = THREE.MathUtils.damp(rig.bodyGroup.rotation.y, 0, 10, delta);

    rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
      rig.leftArmPivot.rotation.x,
      -1.35 + Math.sin(elapsed * 8) * 0.08,
      14,
      delta
    );
    rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
      rig.rightArmPivot.rotation.x,
      -1.35 + Math.cos(elapsed * 8) * 0.08,
      14,
      delta
    );
    rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, -0.52, 14, delta);
    rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, 0.52, 14, delta);

    rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0.28, 12, delta);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, -0.18, 12, delta);

    // Animate energy farming rings & shards
    rig.farmingAuraGroup.children.forEach((child, idx) => {
      if (child.name === 'farm_ring_1') {
        child.rotation.z = elapsed * 4.5;
      } else if (child.name === 'farm_ring_2') {
        child.rotation.z = -elapsed * 3.8;
        child.rotation.y = elapsed * 2.2;
      } else if (child.name === 'farm_ring_3') {
        child.rotation.z = elapsed * 3.8;
        child.rotation.y = -elapsed * 2.2;
      } else if (child.name.startsWith('farm_shard_')) {
        const ang = elapsed * 3.6 + (idx / 8) * Math.PI * 2;
        child.position.x = Math.cos(ang) * 1.25;
        child.position.z = Math.sin(ang) * 1.25;
        child.position.y = 0.35 + ((elapsed * 1.9 + idx * 0.25) % 2.1);
        child.rotation.y = elapsed * 5;
      }
    });
  } else if (activeEmote && horizontalSpeed < 0.8 && isGrounded) {
    rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, 0, 12, delta);
    if (activeEmote === 'wave') {
      rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, -2.6, 14, delta);
      rig.rightArmPivot.rotation.z = Math.sin(elapsed * 10) * 0.38;
      rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, 0.1, 10, delta);
      rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0, 10, delta);
      rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, 0, 10, delta);
      rig.bodyGroup.position.y = Math.sin(elapsed * 4) * 0.04;
    } else if (activeEmote === 'goal') {
      const jumpBounce = Math.abs(Math.sin(elapsed * 7)) * 0.55;
      rig.bodyGroup.position.y = jumpBounce;
      rig.leftArmPivot.rotation.x = -2.75;
      rig.rightArmPivot.rotation.x = -2.75;
      rig.leftArmPivot.rotation.z = -0.25;
      rig.rightArmPivot.rotation.z = 0.25;
      rig.leftLegPivot.rotation.x = Math.sin(elapsed * 7) * 0.35;
      rig.rightLegPivot.rotation.x = -Math.sin(elapsed * 7) * 0.35;
    } else if (activeEmote === 'dance') {
      const beat = elapsed * 9;
      rig.bodyGroup.position.y = Math.abs(Math.sin(beat)) * 0.16;
      rig.bodyGroup.rotation.y = Math.sin(beat * 0.5) * 0.35;
      rig.leftArmPivot.rotation.x = -1.4 + Math.sin(beat) * 0.9;
      rig.rightArmPivot.rotation.x = -1.4 - Math.sin(beat) * 0.9;
      rig.leftLegPivot.rotation.x = Math.cos(beat) * 0.55;
      rig.rightLegPivot.rotation.x = -Math.cos(beat) * 0.55;
    } else if (activeEmote === 'trophy') {
      rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, -1.85, 14, delta);
      rig.rightArmPivot.rotation.z = 0;
      rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, 0.2, 10, delta);
      rig.bodyGroup.position.y = Math.sin(elapsed * 3) * 0.03;
    } else if (activeEmote === 'salute') {
      // Continência / Saudação ("Obrigado, meu prefeito! 🫡")
      rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, -2.35, 16, delta);
      rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, -0.45, 16, delta);
      rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, 0.08, 12, delta);
      rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0.08, 12, delta);
      rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0, 12, delta);
      rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, 0, 12, delta);
      rig.bodyGroup.position.y = THREE.MathUtils.damp(rig.bodyGroup.position.y, 0.02, 12, delta);
    }
  } else {
    rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, 0, 12, delta);
    rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0, 12, delta);
    rig.bodyGroup.rotation.y = THREE.MathUtils.damp(rig.bodyGroup.rotation.y, 0, 12, delta);

    if (!isGrounded) {
      rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, 0, 12, delta);
      rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, -2.5, 14, delta);
      rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, -2.5, 14, delta);
      rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0.35, 12, delta);
      rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, -0.35, 12, delta);
      rig.bodyGroup.position.y = THREE.MathUtils.damp(rig.bodyGroup.position.y, 0, 14, delta);
    } else if (speedRatio > 0.08) {
      if (movementStyle === 'ninja') {
        // 2. Corrida Ninja: Tronco inclinado para frente (18° = 0.314 rad) e ambos os braços estendidos para trás
        const fastSwing = Math.sin(elapsed * 16 * Math.max(0.8, speedRatio)) * 0.95 * Math.min(1, speedRatio);
        rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, 0.314, 14, delta);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, 1.25, 14, delta);
        rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, 1.25, 14, delta);
        rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, -0.18, 12, delta);
        rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, 0.18, 12, delta);
        rig.leftLegPivot.rotation.x = -fastSwing;
        rig.rightLegPivot.rotation.x = fastSwing;
        rig.bodyGroup.position.y = Math.abs(Math.sin(elapsed * 16)) * 0.05;
      } else if (movementStyle === 'levitate') {
        // 3. Flutuar / Voo: Desliza levemente acima do chão (+0.35u) com pernas levemente dobradas
        const floatY = 0.35 + Math.sin(elapsed * 5.0) * 0.06;
        rig.bodyGroup.position.y = THREE.MathUtils.damp(rig.bodyGroup.position.y, floatY, 12, delta);
        rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, 0.12, 10, delta);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
          rig.leftArmPivot.rotation.x,
          0.35 + Math.sin(elapsed * 4) * 0.1,
          10,
          delta
        );
        rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
          rig.rightArmPivot.rotation.x,
          0.35 + Math.cos(elapsed * 4) * 0.1,
          10,
          delta
        );
        rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, -0.25, 10, delta);
        rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, 0.25, 10, delta);
        rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0.28, 10, delta);
        rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, 0.16, 10, delta);
      } else if (movementStyle === 'champion') {
        // 4. Passo Campeão: Passada larga e confiante com braços erguidos comemorando e brilhos dourados nos passos
        const stride = Math.sin(elapsed * 10 * Math.max(0.75, speedRatio)) * 1.05 * Math.min(1, speedRatio);
        rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, -0.06, 12, delta);
        rig.leftArmPivot.rotation.x = -2.25 + stride * 0.35;
        rig.rightArmPivot.rotation.x = -2.25 - stride * 0.35;
        rig.leftArmPivot.rotation.z = -0.28;
        rig.rightArmPivot.rotation.z = 0.28;
        rig.leftLegPivot.rotation.x = -stride;
        rig.rightLegPivot.rotation.x = stride;
        rig.bodyGroup.position.y = Math.abs(Math.sin(elapsed * 10)) * 0.12 * Math.min(1, speedRatio);

        // Animate golden step sparks
        rig.championSparksGroup.rotation.y = elapsed * 5.0;
        rig.championSparksGroup.children.forEach((sp, i) => {
          sp.position.y = 0.08 + Math.abs(Math.sin(elapsed * 10 + i)) * 0.25;
        });
      } else {
        // 1. Clássico Roblox: Balanço alternado tradicional de braços e pernas
        rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, 0, 12, delta);
        const swing = Math.sin(elapsed * 12 * Math.max(0.75, speedRatio)) * 0.85 * Math.min(1, speedRatio);
        rig.leftArmPivot.rotation.x = swing;
        rig.rightArmPivot.rotation.x = -swing;
        rig.leftLegPivot.rotation.x = -swing * 0.95;
        rig.rightLegPivot.rotation.x = swing * 0.95;
        rig.bodyGroup.position.y = Math.abs(Math.sin(elapsed * 12)) * 0.06 * Math.min(1, speedRatio);
      }
    } else {
      // Idle pose (respecting levitate style if selected)
      rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, 0, 10, delta);
      if (movementStyle === 'levitate') {
        const floatIdle = 0.35 + Math.sin(elapsed * 3.0) * 0.05;
        rig.bodyGroup.position.y = THREE.MathUtils.damp(rig.bodyGroup.position.y, floatIdle, 10, delta);
        rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0.22, 10, delta);
        rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, 0.12, 10, delta);
      } else {
        const idleBob = Math.sin(elapsed * 2.4) * 0.025;
        rig.bodyGroup.position.y = idleBob;
        rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0, 12, delta);
        rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, 0, 12, delta);
      }
      rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
        rig.leftArmPivot.rotation.x,
        0.05 * Math.sin(elapsed * 2),
        10,
        delta
      );
      rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
        rig.rightArmPivot.rotation.x,
        -0.05 * Math.sin(elapsed * 2),
        10,
        delta
      );
    }
  }

  // Animate equipped 3D Auras & dynamic back accessories (double size & speed when isFarmingAura is active)
  animateEquippedAuras(rig.root, elapsed, isFarmingAura);
}
