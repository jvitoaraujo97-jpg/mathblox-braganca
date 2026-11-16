import * as THREE from 'three';
import { AvatarRig, createAvatarRig } from '../game/avatarBuilder';
import { animateEquippedAuras } from './cosmeticBuilder';
import { getJerseyConfig } from './jerseyBuilder';

export type VehicleModelStyle = 'sport_kart' | 'beach_buggy' | 'urban_jeep' | 'turbo_kart';

export interface KartRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  frontLeftSteerPivot: THREE.Group;
  frontRightSteerPivot: THREE.Group;
  wheels: THREE.Group[];
  steeringWheel: THREE.Group;
  nitroFlames: THREE.Mesh[];
  driverRig: AvatarRig;
}

export function createKartRig(
  avatarColorHex: string,
  equippedHat: string | null,
  equippedJersey?: string | null,
  modelStyle: VehicleModelStyle = 'sport_kart',
  overrideBodyPrimary?: string,
  overrideBodySecondary?: string
): KartRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  const clubCfg = getJerseyConfig(equippedJersey);
  const bodyPrimaryHex =
    overrideBodyPrimary || (clubCfg ? clubCfg.primary : avatarColorHex);
  const bodySecondaryHex =
    overrideBodySecondary || (clubCfg ? clubCfg.secondary : '#f8fafc');

  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(bodyPrimaryHex),
    roughness: 0.28,
    metalness: 0.45,
  });

  const stripeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.25,
    metalness: 0.2,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(bodySecondaryHex),
    roughness: 0.35,
    metalness: 0.5,
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.75,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.9,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.78,
    metalness: 0.1,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfacc15,
    emissiveIntensity: 1.5,
    roughness: 0.1,
  });

  // 1. Main Blocky Chassis (facing -Z forward)
  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.28, 3.2), darkMetalMat);
  floorPan.position.set(0, 0.42, 0);
  floorPan.castShadow = true;
  chassisGroup.add(floorPan);

  // Front Hood / Nose Cone (customized by modelStyle)
  const isJeep = modelStyle === 'urban_jeep';
  const isBuggy = modelStyle === 'beach_buggy';

  const frontNose = new THREE.Mesh(
    new THREE.BoxGeometry(isJeep ? 1.65 : 1.45, isJeep ? 0.58 : 0.36, 1.15),
    bodyMat
  );
  frontNose.position.set(0, isJeep ? 0.74 : 0.64, -1.05);
  frontNose.rotation.x = isJeep ? 0.02 : 0.12;
  frontNose.castShadow = true;
  chassisGroup.add(frontNose);

  // White Center Racing Stripe along the hood
  const hoodStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, isJeep ? 0.6 : 0.38, 1.18),
    stripeMat
  );
  hoodStripe.position.set(0, isJeep ? 0.75 : 0.65, -1.05);
  hoodStripe.rotation.x = isJeep ? 0.02 : 0.12;
  chassisGroup.add(hoodStripe);

  // Side Bumpers / Side Pods
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, isJeep ? 0.54 : 0.38, 1.95),
      bodyMat
    );
    pod.position.set(side * 0.88, isJeep ? 0.62 : 0.54, 0.05);
    pod.castShadow = true;

    const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 1.85), stripeMat);
    sideStripe.position.set(side * 0.88, isJeep ? 0.68 : 0.58, 0.05);

    chassisGroup.add(pod, sideStripe);
  }

  // Variant extras:
  if (isBuggy) {
    // Roll cage bars for Beach Buggy
    const cageGroup = new THREE.Group();
    for (const side of [-0.72, 0.72]) {
      const frontPillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8),
        accentMat
      );
      frontPillar.position.set(side, 1.25, -0.35);
      frontPillar.rotation.x = 0.25;
      const rearPillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8),
        accentMat
      );
      rearPillar.position.set(side, 1.25, 0.85);
      rearPillar.rotation.x = -0.2;
      cageGroup.add(frontPillar, rearPillar);
    }
    const roofCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.52, 0.08, 1.25),
      accentMat
    );
    roofCanopy.position.set(0, 1.84, 0.25);
    cageGroup.add(roofCanopy);
    chassisGroup.add(cageGroup);
  } else if (isJeep) {
    // Windshield frame + spare tire on back for Mini-Jeep Urbano
    const windshieldFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.58, 0.65, 0.1),
      darkMetalMat
    );
    windshieldFrame.position.set(0, 1.28, -0.45);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.48, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.55,
        roughness: 0.1,
      })
    );
    glass.position.set(0, 1.28, -0.45);
    const spareTire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16),
      tireMat
    );
    spareTire.rotation.x = Math.PI / 2;
    spareTire.position.set(0, 1.05, 1.62);
    chassisGroup.add(windshieldFrame, glass, spareTire);
  }

  // Front Bumper + Glowing Headlights
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.22, 0.28), accentMat);
  frontBumper.position.set(0, 0.42, -1.68);
  chassisGroup.add(frontBumper);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 14), headlightMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.52, 0.68, -1.62);
    chassisGroup.add(lamp);
  }

  // Driver Bucket Seat
  const seatBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.9), darkMetalMat);
  seatBase.position.set(0, 0.6, 0.3);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.85, 0.2), darkMetalMat);
  seatBack.position.set(0, 1.0, 0.72);
  seatBack.rotation.x = -0.15;
  chassisGroup.add(seatBase, seatBack);

  // Steering Column + Steering Wheel
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 10), darkMetalMat);
  column.position.set(0, 0.92, -0.46);
  column.rotation.x = -0.65;
  chassisGroup.add(column);

  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(0, 1.15, -0.24);
  steeringWheel.rotation.x = -0.65;
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.038, 10, 20), darkMetalMat);
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), accentMat);
  wheelHub.rotation.x = Math.PI / 2;
  steeringWheel.add(wheelRim, wheelHub);
  chassisGroup.add(steeringWheel);

  // Rear Engine Deck & Aerofólio (Rear Wing Spoiler)
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.45, 0.75), darkMetalMat);
  engineBlock.position.set(0, 0.72, 1.18);
  chassisGroup.add(engineBlock);

  if (!isJeep) {
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.58, 0.24), darkMetalMat);
      strut.position.set(side * 0.55, 1.15, 1.42);
      strut.rotation.x = -0.2;
      chassisGroup.add(strut);
    }

    const wingBlade = new THREE.Mesh(
      new THREE.BoxGeometry(modelStyle === 'turbo_kart' ? 2.05 : 1.85, 0.1, 0.48),
      bodyMat
    );
    wingBlade.position.set(0, 1.44, 1.48);
    wingBlade.rotation.x = 0.18;
    const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.11, 0.49), stripeMat);
    wingStripe.position.set(0, 1.44, 1.48);
    wingStripe.rotation.x = 0.18;
    chassisGroup.add(wingBlade, wingStripe);
  }

  // Twin Rear Exhaust Pipes + Nitro Flames (blue/orange)
  const nitroFlames: THREE.Mesh[] = [];
  const nitroBlueMat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4,
    emissive: 0x00f5d4,
    emissiveIntensity: 2.0,
    roughness: 0.1,
  });
  const nitroOrangeMat = new THREE.MeshStandardMaterial({
    color: 0xff5400,
    emissive: 0xff5400,
    emissiveIntensity: 1.9,
    roughness: 0.1,
  });

  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 14), chromeMat);
    pipe.rotation.x = Math.PI / 2 + 0.18;
    pipe.position.set(side * 0.36, 0.68, 1.66);
    chassisGroup.add(pipe);

    const flameOuter = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.85, 12),
      side === -1 ? nitroBlueMat : nitroOrangeMat
    );
    flameOuter.rotation.x = Math.PI / 2;
    flameOuter.position.set(side * 0.36, 0.72, 2.15);
    flameOuter.visible = false;
    chassisGroup.add(flameOuter);
    nitroFlames.push(flameOuter);
  }

  // 2. Build 4 Cylindrical Wheels with Metallic Hubcaps
  const wheels: THREE.Group[] = [];
  const wheelRadius = isJeep || isBuggy ? 0.46 : 0.42;
  const makeWheel = (): THREE.Group => {
    const wGroup = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.38, 20),
      tireMat
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.4, 14), chromeMat);
    rim.rotation.z = Math.PI / 2;

    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.38), bodyMat);
    wGroup.add(tire, rim, spoke);
    wheels.push(wGroup);
    return wGroup;
  };

  const frontLeftSteerPivot = new THREE.Group();
  frontLeftSteerPivot.position.set(-1.02, wheelRadius, -1.08);
  frontLeftSteerPivot.add(makeWheel());

  const frontRightSteerPivot = new THREE.Group();
  frontRightSteerPivot.position.set(1.02, wheelRadius, -1.08);
  frontRightSteerPivot.add(makeWheel());

  const rearLeftWheel = makeWheel();
  rearLeftWheel.position.set(-1.05, wheelRadius, 1.08);

  const rearRightWheel = makeWheel();
  rearRightWheel.position.set(1.05, wheelRadius, 1.08);

  root.add(frontLeftSteerPivot, frontRightSteerPivot, rearLeftWheel, rearRightWheel);

  // 3. Seated Student Avatar at the Wheel (wearing their Jersey, Hat & Animated Aura)
  const driverRig = createAvatarRig(avatarColorHex, equippedHat, equippedJersey);
  // Rotate avatar to face -Z (forward along the track) and position seated in the bucket seat
  driverRig.root.rotation.y = Math.PI;
  driverRig.root.position.set(0, 0.05, 0.26);
  // Seated pose: legs bent forward, arms reaching for steering wheel
  driverRig.leftLegPivot.rotation.x = -1.35;
  driverRig.rightLegPivot.rotation.x = -1.35;
  driverRig.leftArmPivot.rotation.x = -1.15;
  driverRig.rightArmPivot.rotation.x = -1.15;
  driverRig.leftArmPivot.rotation.z = 0.15;
  driverRig.rightArmPivot.rotation.z = -0.15;

  chassisGroup.add(driverRig.root);

  return {
    root,
    chassisGroup,
    frontLeftSteerPivot,
    frontRightSteerPivot,
    wheels,
    steeringWheel,
    nitroFlames,
    driverRig,
  };
}

export function animateKartRig(
  kart: KartRig,
  forwardSpeed: number,
  steerInput: number, // -1 left to +1 right
  isNitroActive: boolean,
  spinAngle: number,
  elapsed: number,
  delta: number
): void {
  // 1. Spin all 4 wheels proportional to forward speed
  const wheelSpinDelta = -forwardSpeed * delta * 2.2;
  for (const w of kart.wheels) {
    w.rotation.x += wheelSpinDelta;
  }

  // 2. Steer front wheels and steering wheel + subtle driver head look
  const targetSteerAngle = -steerInput * 0.42;
  kart.frontLeftSteerPivot.rotation.y = THREE.MathUtils.damp(
    kart.frontLeftSteerPivot.rotation.y,
    targetSteerAngle,
    14,
    delta
  );
  kart.frontRightSteerPivot.rotation.y = THREE.MathUtils.damp(
    kart.frontRightSteerPivot.rotation.y,
    targetSteerAngle,
    14,
    delta
  );
  kart.steeringWheel.rotation.z = targetSteerAngle * 1.6;
  kart.driverRig.headPivot.rotation.y = targetSteerAngle * 0.55;

  // 3. Subtle chassis suspension roll on turns + engine vibration + 360° spin-out rotation
  kart.chassisGroup.rotation.z = THREE.MathUtils.damp(
    kart.chassisGroup.rotation.z,
    steerInput * 0.08,
    12,
    delta
  );
  kart.chassisGroup.rotation.y = spinAngle;
  kart.chassisGroup.position.y =
    Math.abs(forwardSpeed) > 0.3 ? Math.sin(elapsed * 28) * 0.015 : 0;

  // 4. Exhaust Nitro Flames
  kart.nitroFlames.forEach((flame, idx) => {
    flame.visible = isNitroActive;
    if (isNitroActive) {
      const pulse = 0.85 + Math.sin(elapsed * 36 + idx * 1.5) * 0.3;
      flame.scale.set(1, pulse, 1);
    }
  });

  // 5. Update driver's 3D Aura (electricity, fire, star orbit, shadow, rainbow)
  if (kart.driverRig.root.visible) {
    animateEquippedAuras(kart.driverRig.root, elapsed);
  }
}
