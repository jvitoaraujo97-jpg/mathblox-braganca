import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface GraphicsQualityPreset {
  id: GraphicsQuality;
  label: string;
  subtitle: string;
  maxDpr: number;
  shadows: boolean;
  shadowMapSize: number;
  particleRatio: number;
}

export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsQualityPreset> = {
  low: {
    id: 'low',
    label: 'Baixa',
    subtitle: 'Celular Básico · Máximo 60 FPS',
    maxDpr: 1,
    shadows: false,
    shadowMapSize: 512,
    particleRatio: 0.4,
  },
  medium: {
    id: 'medium',
    label: 'Média',
    subtitle: 'Equilibrado · Recomendado',
    maxDpr: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    particleRatio: 0.75,
  },
  high: {
    id: 'high',
    label: 'Alta',
    subtitle: 'Ultra PBR · Sombras HD',
    maxDpr: 2,
    shadows: true,
    shadowMapSize: 2048,
    particleRatio: 1.0,
  },
};

const QUALITY_STORAGE_KEY = 'mathblox_graphics_quality';
const qualityListeners = new Set<(q: GraphicsQuality) => void>();

export const isSoftwareGl: boolean = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

export function getGraphicsQuality(): GraphicsQuality {
  if (typeof window === 'undefined') return 'medium';
  try {
    const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (saved === 'low' || saved === 'medium' || saved === 'high') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'medium';
}

export function setGraphicsQuality(quality: GraphicsQuality): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, quality);
  } catch {
    // Ignore storage errors
  }
  qualityListeners.forEach((cb) => cb(quality));
}

export function subscribeGraphicsQuality(listener: (q: GraphicsQuality) => void): () => void {
  qualityListeners.add(listener);
  return () => {
    qualityListeners.delete(listener);
  };
}

export function getActiveGraphicsPreset(quality?: GraphicsQuality): GraphicsQualityPreset {
  return GRAPHICS_PRESETS[quality ?? getGraphicsQuality()];
}

/**
 * Creates a standardized PBR WebGLRenderer configured with ACESFilmicToneMapping,
 * SRGBColorSpace, PCFSoftShadowMap and mobile DPR/shadow scaling.
 */
export function createPbrRenderer(
  container: HTMLElement,
  quality?: GraphicsQuality
): {
  renderer: THREE.WebGLRenderer;
  preset: GraphicsQualityPreset;
  maxAnisotropy: number;
} {
  const preset = getActiveGraphicsPreset(quality);
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl && preset.id !== 'low',
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(
    isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, preset.maxDpr)
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !isSoftwareGl && preset.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.appendChild(renderer.domElement);

  const maxAnisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return { renderer, preset, maxAnisotropy };
}

// Singleton Sky Dome texture (tropical daylight gradient: #0284C7 -> #38BDF8 -> #E0F2FE)
let cachedSkyDomeTex: THREE.CanvasTexture | null = null;

function getTropicalSkyDomeTexture(): THREE.CanvasTexture {
  if (cachedSkyDomeTex) return cachedSkyDomeTex;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#0284C7'); // Deep zenith tropical blue
  grad.addColorStop(0.32, '#0EA5E9'); // Mid sky
  grad.addColorStop(0.52, '#38BDF8'); // Bright daylight azure
  grad.addColorStop(0.68, '#BAE6FD'); // Horizon glow
  grad.addColorStop(0.8, '#E0F2FE'); // Mist horizon
  grad.addColorStop(1.0, '#CBD5E1'); // Lower hemisphere bounce
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle warm tropical sun halo on upper hemisphere
  const sunGrad = ctx.createRadialGradient(360, 145, 6, 360, 145, 95);
  sunGrad.addColorStop(0.0, 'rgba(255, 251, 235, 0.92)');
  sunGrad.addColorStop(0.28, 'rgba(254, 240, 138, 0.42)');
  sunGrad.addColorStop(1.0, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.isSharedCachedTexture = true;
  tex.needsUpdate = true;
  cachedSkyDomeTex = tex;
  return tex;
}

export interface TropicalEnvironmentRig {
  skyDome: THREE.Mesh;
  hemiLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  envTexture: THREE.Texture;
  sunOffset: THREE.Vector3;
  updateShadowTarget: (x: number, y: number, z: number) => void;
}

export interface TropicalEnvironmentOptions {
  fogColor?: number | string;
  fogDensity?: number;
  skyRadius?: number;
  shadowFrustum?: number;
  sunOffset?: [number, number, number];
  hemiIntensity?: number;
  sunIntensity?: number;
  quality?: GraphicsQuality;
}

/**
 * Sets up a procedural 3D Tropical Sky Dome, FogExp2, RoomEnvironment PMREM reflections,
 * HemisphereLight + dynamic shadow-following DirectionalLight.
 */
export function setupTropicalEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  options: TropicalEnvironmentOptions = {}
): TropicalEnvironmentRig {
  const preset = getActiveGraphicsPreset(options.quality);
  const fogColor = options.fogColor ?? 0xd8f1fe;
  const fogDensity = options.fogDensity ?? 0.0042;
  const skyRadius = options.skyRadius ?? 260;
  const shadowFrustum = options.shadowFrustum ?? 32;
  const [sx, sy, sz] = options.sunOffset ?? [26, 48, 22];
  const sunOffset = new THREE.Vector3(sx, sy, sz);

  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.FogExp2(fogColor, fogDensity);

  // PMREM Studio-Daylight Environment Reflections for PBR materials
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  pmrem.dispose();

  // Procedural 3D Sky Dome
  const skyGeo = new THREE.SphereGeometry(skyRadius, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: getTropicalSkyDomeTexture(),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.renderOrder = -1;
  scene.add(skyDome);

  // Lightweight 2-light PBR rig (Hemisphere + Key Directional Sun)
  const hemiLight = new THREE.HemisphereLight(
    0xbae6fd,
    0x334155,
    options.hemiIntensity ?? 0.78
  );
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffbeb, options.sunIntensity ?? 1.38);
  sunLight.position.copy(sunOffset);
  sunLight.castShadow = !isSoftwareGl && preset.shadows;
  sunLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
  sunLight.shadow.camera.near = 4;
  sunLight.shadow.camera.far = 140;
  sunLight.shadow.camera.left = -shadowFrustum;
  sunLight.shadow.camera.right = shadowFrustum;
  sunLight.shadow.camera.top = shadowFrustum;
  sunLight.shadow.camera.bottom = -shadowFrustum;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const updateShadowTarget = (x: number, y: number, z: number) => {
    skyDome.position.set(x, y * 0.25, z);
    sunLight.target.position.set(x, y, z);
    sunLight.position.set(x + sunOffset.x, y + sunOffset.y, z + sunOffset.z);
    sunLight.target.updateMatrixWorld();
  };

  return {
    skyDome,
    hemiLight,
    sunLight,
    envTexture,
    sunOffset,
    updateShadowTarget,
  };
}

/**
 * Zero-GC InstancedMesh Object Pool for sparks, dust, water splashes, and aura bursts.
 * Pre-allocates all matrices and particle slots up front; never allocates meshes in tick().
 */
export class ParticlePool {
  public readonly mesh: THREE.InstancedMesh;
  private readonly capacity: number;
  private readonly posX: Float32Array;
  private readonly posY: Float32Array;
  private readonly posZ: Float32Array;
  private readonly velX: Float32Array;
  private readonly velY: Float32Array;
  private readonly velZ: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly gravity: Float32Array;
  private cursor = 0;

  private readonly _dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();

  constructor(maxParticles = 140, quality?: GraphicsQuality) {
    const preset = getActiveGraphicsPreset(quality);
    this.capacity = Math.max(24, Math.round(maxParticles * preset.particleRatio));

    this.posX = new Float32Array(this.capacity);
    this.posY = new Float32Array(this.capacity);
    this.posZ = new Float32Array(this.capacity);
    this.velX = new Float32Array(this.capacity);
    this.velY = new Float32Array(this.capacity);
    this.velZ = new Float32Array(this.capacity);
    this.life = new Float32Array(this.capacity);
    this.maxLife = new Float32Array(this.capacity);
    this.baseSize = new Float32Array(this.capacity);
    this.gravity = new Float32Array(this.capacity);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.capacity);
    this.mesh.frustumCulled = false;

    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    this._color.setHex(0xffffff);
    for (let i = 0; i < this.capacity; i++) {
      this.mesh.setMatrixAt(i, this._dummy.matrix);
      this.mesh.setColorAt(i, this._color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    colorHex: number,
    size = 0.24,
    duration = 0.45,
    gravityVal = 9.8
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;

    this.posX[i] = x;
    this.posY[i] = y;
    this.posZ[i] = z;
    this.velX[i] = vx;
    this.velY[i] = vy;
    this.velZ[i] = vz;
    this.life[i] = duration;
    this.maxLife[i] = duration;
    this.baseSize[i] = size;
    this.gravity[i] = gravityVal;

    this._color.setHex(colorHex);
    this.mesh.setColorAt(i, this._color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public emitBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speed = 5.5,
    size = 0.24,
    duration = 0.5
  ): void {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const spd = speed * (0.4 + Math.random() * 0.7);
      this.emit(
        x,
        y,
        z,
        Math.cos(a) * spd,
        2.2 + Math.random() * speed * 0.8,
        Math.sin(a) * spd,
        colorHex,
        size * (0.7 + Math.random() * 0.5),
        duration * (0.75 + Math.random() * 0.4)
      );
    }
  }

  public update(dt: number): void {
    let anyActive = false;
    for (let i = 0; i < this.capacity; i++) {
      const rem = this.life[i];
      if (rem <= 0) continue;

      anyActive = true;
      const next = rem - dt;
      this.life[i] = next;

      if (next <= 0) {
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      this.velY[i] -= this.gravity[i] * dt;
      this.posX[i] += this.velX[i] * dt;
      this.posY[i] += this.velY[i] * dt;
      this.posZ[i] += this.velZ[i] * dt;

      const t = Math.max(0.01, next / this.maxLife[i]);
      const sc = this.baseSize[i] * t;
      this._dummy.position.set(this.posX[i], this.posY[i], this.posZ[i]);
      this._dummy.rotation.set(next * 5, next * 7, 0);
      this._dummy.scale.set(sc, sc, sc);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }

    if (anyActive) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/**
 * Thoroughly disposes all geometries, materials, and non-shared textures in a scene
 * to prevent WebGL memory leaks when switching between 3D modes on mobile.
 */
export function disposeSceneResources(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  envTexture?: THREE.Texture | null
): void {
  const disposeMat = (mat: THREE.Material) => {
    const anyMat = mat as unknown as Record<string, unknown>;
    const texKeys = [
      'map',
      'bumpMap',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'emissiveMap',
      'alphaMap',
      'aoMap',
    ];
    for (const k of texKeys) {
      const t = anyMat[k];
      if (t instanceof THREE.Texture && !t.userData?.isSharedCachedTexture) {
        t.dispose();
      }
    }
    mat.dispose();
  };

  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).geometry) {
      (obj as THREE.Mesh).geometry.dispose();
    }
    const mat = (obj as THREE.Mesh).material;
    if (Array.isArray(mat)) {
      mat.forEach(disposeMat);
    } else if (mat) {
      disposeMat(mat);
    }
  });

  if (envTexture && !envTexture.userData?.isSharedCachedTexture) {
    envTexture.dispose();
  }
  renderer.dispose();
  if (renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
}
