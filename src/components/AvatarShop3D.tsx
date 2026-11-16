import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Check, Coins, Eye, RotateCw, Shield, ShoppingBag, Sparkles, X } from 'lucide-react';
import { SHOP_ITEMS } from '../data/shopItems';
import { animateAvatarRig, AvatarRig, createAvatarRig, updateAvatarHat } from '../game/avatarBuilder';
import { getCosmeticThumbnailDataUrl, normalizeCosmeticId } from '../three/cosmeticBuilder';
import { getJerseyConfig, normalizeJerseyId } from '../three/jerseyBuilder';
import { MovementStyle, ShopCategory, ShopItem, StudentProfile } from '../types/game';

interface AvatarShop3DProps {
  student: StudentProfile;
  onUpdateStudent: (updated: StudentProfile) => void;
}

const MOVEMENT_STYLE_OPTIONS: { id: MovementStyle; label: string; desc: string }[] = [
  { id: 'classic', label: 'Clássico Roblox', desc: 'Balanço tradicional R6' },
  { id: 'ninja', label: 'Corrida Ninja', desc: 'Tronco inclinado + braços para trás' },
  { id: 'levitate', label: 'Flutuar / Voo', desc: 'Avatar levita suavemente acima do chão' },
  { id: 'champion', label: 'Passo Campeão', desc: 'Passada confiante com partículas nos pés' },
];

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

type FilterTab = 'all' | ShopCategory;

export function AvatarShop3D({ student, onUpdateStudent }: AvatarShop3DProps) {
  const [categoryFilter, setCategoryFilter] = useState<FilterTab>('jersey');
  const [selectedItemId, setSelectedItemId] = useState<string>(SHOP_ITEMS[0].id);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [previewWalking, setPreviewWalking] = useState<boolean>(true);

  const stageMountRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<AvatarRig | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const manualYawRef = useRef<number | null>(null);
  const movementStyleRef = useRef<MovementStyle>(student.movementStyle || 'classic');
  const previewWalkingRef = useRef<boolean>(true);

  useEffect(() => {
    movementStyleRef.current = student.movementStyle || 'classic';
  }, [student.movementStyle]);

  useEffect(() => {
    previewWalkingRef.current = previewWalking;
  }, [previewWalking]);

  const selectedItem = useMemo(
    () => SHOP_ITEMS.find((i) => i.id === selectedItemId) || SHOP_ITEMS[0],
    [selectedItemId]
  );

  const isAccessoryCategory = (cat: ShopCategory) =>
    cat === 'head' || cat === 'back' || cat === 'aura';

  // Determine what the 3D stage is currently previewing ("Testar Antes de Comprar")
  const previewHat = useMemo(() => {
    if (selectedItem && isAccessoryCategory(selectedItem.category)) {
      return selectedItem.hatId || null;
    }
    return normalizeCosmeticId(student.equippedHat);
  }, [selectedItem, student.equippedHat]);

  const previewJersey = useMemo(() => {
    if (selectedItem?.category === 'jersey') {
      return selectedItem.jerseyId || null;
    }
    return normalizeJerseyId(student.equippedJersey);
  }, [selectedItem, student.equippedJersey]);

  const previewColor = useMemo(() => {
    if (selectedItem?.category === 'color' && selectedItem.colorHex) {
      return selectedItem.colorHex;
    }
    return student.avatarColor;
  }, [selectedItem, student.avatarColor]);

  // Generate 3D snapshots for all accessory items on mount
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const item of SHOP_ITEMS) {
      if (isAccessoryCategory(item.category) && item.hatId) {
        const url = getCosmeticThumbnailDataUrl(item.hatId);
        if (url) map[item.id] = url;
      }
    }
    setThumbnails(map);
  }, []);

  // Initialize Interactive 360° 3D Stage
  useEffect(() => {
    const container = stageMountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 320;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 1.65, 4.55);
    camera.lookAt(0, 1.25, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.9);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfffbeb, 1.75);
    key.position.set(3.5, 6, 4.5);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rim.position.set(-3.5, 3, -3.5);
    scene.add(rim);

    // Illuminated Stage Pedestal
    const pedestalGroup = new THREE.Group();
    const baseCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.4, 0.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.6 })
    );
    baseCylinder.position.y = -0.1;

    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.22, 0.04, 12, 36),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 1.2,
        roughness: 0.2,
      })
    );
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.01;
    pedestalGroup.add(baseCylinder, glowRing);
    scene.add(pedestalGroup);

    const rig = createAvatarRig(previewColor, previewHat, previewJersey);
    rigRef.current = rig;
    scene.add(rig.root);

    // Drag to rotate 360° manually
    let dragging = false;
    let lastX = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      if (manualYawRef.current === null && rigRef.current) {
        manualYawRef.current = rigRef.current.root.rotation.y;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || manualYawRef.current === null) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      manualYawRef.current += dx * 0.012;
    };
    const onPointerUp = () => {
      dragging = false;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

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
        if (manualYawRef.current !== null && dragging) {
          rigRef.current.root.rotation.y = manualYawRef.current;
        } else {
          const currentY = rigRef.current.root.rotation.y + delta * 0.75;
          rigRef.current.root.rotation.y = currentY;
          manualYawRef.current = currentY;
        }
        animateAvatarRig(
          rigRef.current,
          previewWalkingRef.current ? 7.5 : 0,
          true,
          elapsed,
          delta,
          undefined,
          movementStyleRef.current,
          false
        );
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };
    tick();

    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth || 320;
      const h = container.clientHeight || 320;
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
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update avatar outfit color or Brasileirão jersey live when previewColor / previewJersey changes
  useEffect(() => {
    const scene = sceneRef.current;
    const prevRig = rigRef.current;
    if (!scene || !prevRig) return;

    const currentRotY = prevRig.root.rotation.y;
    scene.remove(prevRig.root);
    const nextRig = createAvatarRig(previewColor, previewHat, previewJersey);
    nextRig.root.rotation.y = currentRotY;
    scene.add(nextRig.root);
    rigRef.current = nextRig;
  }, [previewColor, previewJersey]);

  // Update 3D accessory live when previewHat changes ("Testar Antes de Comprar")
  useEffect(() => {
    if (rigRef.current) {
      updateAvatarHat(rigRef.current, previewHat);
    }
  }, [previewHat]);

  const filteredItems = useMemo(() => {
    if (categoryFilter === 'all') return SHOP_ITEMS;
    return SHOP_ITEMS.filter((i) => i.category === categoryFilter);
  }, [categoryFilter]);

  const isOwned = (item: ShopItem) => {
    const normUnlocked = student.unlockedItems.map((u) => normalizeCosmeticId(u) || normalizeJerseyId(u) || u);
    return (
      normUnlocked.includes(item.id) ||
      (item.hatId ? normUnlocked.includes(item.hatId) : false) ||
      (item.jerseyId ? normUnlocked.includes(item.jerseyId) : false)
    );
  };

  const isEquipped = (item: ShopItem) => {
    if (item.category === 'jersey') {
      return normalizeJerseyId(student.equippedJersey) === item.jerseyId;
    }
    if (isAccessoryCategory(item.category)) {
      return normalizeCosmeticId(student.equippedHat) === item.hatId;
    }
    return !student.equippedJersey && student.avatarColor.toLowerCase() === (item.colorHex || '').toLowerCase();
  };

  const handleAction = (item: ShopItem) => {
    const owned = isOwned(item);
    const equipped = isEquipped(item);

    if (!owned) {
      if (student.coins < item.price) return;
      const nextUnlocked = Array.from(
        new Set([
          ...student.unlockedItems,
          item.id,
          ...(item.hatId ? [item.hatId] : []),
          ...(item.jerseyId ? [item.jerseyId] : []),
        ])
      );
      const updated: StudentProfile = {
        ...student,
        coins: student.coins - item.price,
        unlockedItems: nextUnlocked,
        equippedJersey:
          item.category === 'jersey'
            ? item.jerseyId || null
            : item.category === 'color'
              ? null
              : student.equippedJersey,
        equippedHat: isAccessoryCategory(item.category)
          ? item.hatId || null
          : student.equippedHat,
        avatarColor:
          item.category === 'color' && item.colorHex ? item.colorHex : student.avatarColor,
      };
      onUpdateStudent(updated);
      return;
    }

    if (item.category === 'jersey') {
      onUpdateStudent({
        ...student,
        equippedJersey: equipped ? null : item.jerseyId || null,
      });
    } else if (isAccessoryCategory(item.category)) {
      onUpdateStudent({
        ...student,
        equippedHat: equipped ? null : item.hatId || null,
      });
    } else if (item.category === 'color' && item.colorHex) {
      onUpdateStudent({
        ...student,
        equippedJersey: null,
        avatarColor: item.colorHex,
      });
    }
  };

  const selectedOwned = isOwned(selectedItem);
  const selectedEquipped = isEquipped(selectedItem);
  const selectedCanAfford = student.coins >= selectedItem.price;

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
      {/* Left/Top: Palco 3D Interativo 360° */}
      <section className="lg:col-span-5 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl lg:sticky lg:top-20">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-emerald-400">
              Vestiário & Palco 3D · Giro 360°
            </p>
            <h2 className="font-display text-xl font-extrabold text-white">
              {selectedItem.name}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 font-mono text-sm font-bold text-amber-400 tabular-nums">
            <Coins className="h-4 w-4" />
            <span>{student.coins} BloxCoins</span>
          </div>
        </div>

        {/* 3D Canvas Viewport */}
        <div className="relative mt-4 h-72 sm:h-80 w-full overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900">
          <div
            ref={stageMountRef}
            className="touch-none-select h-full w-full cursor-grab active:cursor-grabbing"
          />

          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-slate-950/90 px-2.5 py-1 text-[11px] font-medium text-slate-300 border border-white/10">
            <Eye className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              {selectedEquipped ? 'Equipado no seu Avatar' : 'Testando no Avatar 3D'}
            </span>
          </div>

          <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-slate-950/90 px-2.5 py-1 text-[11px] text-slate-400 border border-white/10">
            <RotateCw className="h-3 w-3 text-sky-400" />
            <span>Arraste para ver a camisa 10 nas costas</span>
          </div>
        </div>

        {/* Economy Info Pill (No real money, performance only) */}
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-400">
          Conquiste <strong className="text-amber-400">+10 a +35 BloxCoins</strong> por questão correta e{' '}
          <strong className="text-emerald-400">+50 BloxCoins</strong> de bônus ao vencer qualquer partida!
        </div>

        {/* Selected Item Description & Primary Action Button */}
        <div className="mt-3">
          <p className="text-xs leading-relaxed text-slate-300">{selectedItem.description}</p>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={!selectedOwned && !selectedCanAfford}
              onClick={() => handleAction(selectedItem)}
              className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 font-display text-sm font-extrabold transition-all active:scale-[0.98] ${
                selectedEquipped
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                  : selectedOwned
                    ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                    : selectedCanAfford
                      ? 'bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-lg shadow-amber-400/15'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {selectedEquipped ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Equipado ✓ (Clique para Remover)</span>
                </>
              ) : selectedOwned ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Vestir / Equipar Agora</span>
                </>
              ) : selectedCanAfford ? (
                <>
                  <ShoppingBag className="h-4 w-4" />
                  <span>Desbloquear por {selectedItem.price} BloxCoins</span>
                </>
              ) : (
                <span>
                  {selectedItem.price} BloxCoins (Faltam {selectedItem.price - student.coins} Coins)
                </span>
              )}
            </button>

            <div className="flex flex-wrap gap-2">
              {student.equippedJersey && (
                <button
                  type="button"
                  onClick={() => onUpdateStudent({ ...student, equippedJersey: null })}
                  className="flex flex-1 min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <X className="h-3.5 w-3.5 text-rose-400" />
                  <span>Tirar Camisa de Time</span>
                </button>
              )}

              {student.equippedHat && (
                <button
                  type="button"
                  onClick={() => onUpdateStudent({ ...student, equippedHat: null })}
                  className="flex flex-1 min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <X className="h-3.5 w-3.5 text-rose-400" />
                  <span>Tirar Acessório 3D</span>
                </button>
              )}
            </div>
          </div>

          {/* Seletor de Estilo de Movimentação 3D */}
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/90 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-sky-400">
                🏃 Estilo de Movimentação 3D
              </p>
              <button
                type="button"
                onClick={() => setPreviewWalking((prev) => !prev)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-800"
              >
                {previewWalking ? 'Pausar Passo' : 'Testar Passo'}
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {MOVEMENT_STYLE_OPTIONS.map((style) => {
                const isCurrent = (student.movementStyle || 'classic') === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => {
                      setPreviewWalking(true);
                      onUpdateStudent({ ...student, movementStyle: style.id });
                    }}
                    className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-all ${
                      isCurrent
                        ? 'border-sky-400 bg-sky-500/15 text-white'
                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs font-extrabold">
                      {isCurrent ? `✓ ${style.label}` : style.label}
                    </span>
                    <span className="mt-0.5 text-[10px] text-slate-400 line-clamp-1">
                      {style.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Right: Vitrine de Camisas do Brasileirão & Itens 3D */}
      <section className="lg:col-span-7">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Vestiário 3D — 19 Camisas de Times (Pará & Brasileirão) + Acessórios R6
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Clique em qualquer uniforme (Remo, Paysandu, Bragantino-PA e Série A) ou acessório 3D para provar no avatar
            </p>
          </div>

          {/* Category Filter Bar */}
          <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-1.5">
            {[
              { id: 'jersey', label: '⚽ Times (19)' },
              { id: 'all', label: 'Todos (39)' },
              { id: 'head', label: 'Cabeça (10)' },
              { id: 'back', label: 'Costas (5)' },
              { id: 'aura', label: 'Auras 3D (5)' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id as FilterTab)}
                className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === tab.id
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => {
            const owned = isOwned(item);
            const equipped = isEquipped(item);
            const isSelected = item.id === selectedItemId;
            const canAfford = student.coins >= item.price;
            const thumbUrl = thumbnails[item.id];
            const jerseyCfg = item.jerseyId ? getJerseyConfig(item.jerseyId) : null;

            return (
              <div
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className={`group cursor-pointer flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                  isSelected
                    ? 'border-emerald-400 bg-slate-900 ring-2 ring-emerald-500/25'
                    : equipped
                      ? 'border-sky-500/70 bg-slate-900/90'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div>
                  {/* Real 3D / Kit Preview Box */}
                  <div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-800/80 bg-gradient-to-b from-slate-800/40 to-slate-950">
                    {jerseyCfg ? (
                      <div className="flex items-center gap-3">
                        {/* Stylized 3D Kit Card Preview */}
                        <div
                          className="relative flex h-20 w-18 flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-white/25 shadow-lg transition-transform duration-200 group-hover:scale-105"
                          style={{ backgroundColor: jerseyCfg.primary }}
                        >
                          {/* Stripe / Sash accent */}
                          <div
                            className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 opacity-90"
                            style={{ backgroundColor: jerseyCfg.secondary }}
                          />
                          <div
                            className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/40 font-display text-[10px] font-black shadow"
                            style={{
                              backgroundColor: jerseyCfg.secondary,
                              color:
                                jerseyCfg.secondary === '#ffffff' ||
                                jerseyCfg.secondary === '#f8fafc'
                                  ? '#0f172a'
                                  : '#ffffff',
                            }}
                          >
                            {jerseyCfg.shortTag}
                          </div>
                          <span
                            className="relative z-10 mt-1 font-mono text-xs font-black"
                            style={{ color: jerseyCfg.numberColor }}
                          >
                            #10
                          </span>
                        </div>
                      </div>
                    ) : isAccessoryCategory(item.category) && thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="h-28 w-28 object-contain transition-transform duration-200 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <div
                          className="h-14 w-14 rounded-2xl border-2 border-white/30 shadow-lg"
                          style={{ backgroundColor: item.swatchColor }}
                        />
                        <span className="text-[10px] font-semibold text-slate-400">
                          Pintura R6
                        </span>
                      </div>
                    )}

                    <span className="absolute top-2 right-2 font-mono text-xs font-bold text-amber-400 tabular-nums bg-slate-950/90 px-2 py-0.5 rounded-md border border-white/10">
                      {owned ? 'No Vestiário' : `${item.price} Coins`}
                    </span>

                    {item.rarity && (
                      <span
                        className={`absolute top-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-extrabold border ${
                          item.rarity === 'Lendário'
                            ? 'border-amber-400/50 bg-amber-950/90 text-amber-300'
                            : item.rarity === 'Épico'
                              ? 'border-purple-400/50 bg-purple-950/90 text-purple-300'
                              : item.rarity === 'Raro'
                                ? 'border-sky-400/50 bg-sky-950/90 text-sky-300'
                                : 'border-slate-700 bg-slate-900/90 text-slate-300'
                        }`}
                      >
                        {item.rarity}
                      </span>
                    )}

                    {isSelected && (
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/90 px-2 py-0.5 rounded-md border border-emerald-500/30">
                        <Shield className="h-2.5 w-2.5" />
                        <span>Provando 3D</span>
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 font-display text-base font-bold text-white">
                    {item.name}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400 line-clamp-2">
                    {item.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItemId(item.id);
                    handleAction(item);
                  }}
                  disabled={!owned && !canAfford}
                  className={`mt-4 flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                    equipped
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : owned
                        ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                        : canAfford
                          ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {equipped ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Vestindo ✓</span>
                    </>
                  ) : owned ? (
                    <span>Vestir Agora</span>
                  ) : (
                    <span>Trocar por {item.price} BloxCoins</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
