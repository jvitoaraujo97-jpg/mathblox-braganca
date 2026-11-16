import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { animateAvatarRig, AvatarRig, createAvatarRig, updateAvatarHat } from '../game/avatarBuilder';

interface AvatarPreview3DProps {
  avatarColor: string;
  equippedHat: string | null;
  className?: string;
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

export function AvatarPreview3D({ avatarColor, equippedHat, className = '' }: AvatarPreview3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<AvatarRig | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 240;
    const height = container.clientHeight || 260;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 1.55, 4.3);
    camera.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.85);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfffbeb, 1.6);
    key.position.set(3, 5, 4);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x38bdf8, 0.7);
    rim.position.set(-3, 3, -3);
    scene.add(rim);

    // Pedestal disc
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.25, 0.18, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.4 })
    );
    pedestal.position.y = -0.1;
    scene.add(pedestal);

    const rig = createAvatarRig(avatarColor, equippedHat);
    rigRef.current = rig;
    scene.add(rig.root);

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
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      if (rigRef.current) {
        rigRef.current.root.rotation.y = Math.sin(elapsed * 0.7) * 0.45 + 0.25;
        animateAvatarRig(rigRef.current, 0, true, elapsed, delta);
      }
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };
    tick();

    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 240;
      const h = container.clientHeight || 260;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update avatar color or hat live without recreating WebGL context
  useEffect(() => {
    const scene = sceneRef.current;
    const prevRig = rigRef.current;
    if (!scene || !prevRig) return;

    const currentRotY = prevRig.root.rotation.y;
    scene.remove(prevRig.root);
    const nextRig = createAvatarRig(avatarColor, equippedHat);
    nextRig.root.rotation.y = currentRotY;
    scene.add(nextRig.root);
    rigRef.current = nextRig;
  }, [avatarColor]);

  useEffect(() => {
    if (rigRef.current) {
      updateAvatarHat(rigRef.current, equippedHat);
    }
  }, [equippedHat]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[220px] ${className}`}
      aria-label="Prévia 3D do Avatar R6"
    />
  );
}
