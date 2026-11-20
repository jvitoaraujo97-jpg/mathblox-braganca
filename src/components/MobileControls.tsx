import { ArrowUp, Camera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface MobileInputState {
  moveX: number; // -1..1
  moveY: number; // -1..1 (up is -1 on screen, forward is +1 in game)
  jumpPressed: boolean;
  cameraYawDelta: number;
}

interface MobileControlsProps {
  inputRef: React.MutableRefObject<MobileInputState>;
  onRotateCameraStep: () => void;
  hideCameraButton?: boolean;
}

export function MobileControls({
  inputRef,
  onRotateCameraStep,
  hideCameraButton = false,
}: MobileControlsProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [jumpActive, setJumpActive] = useState(false);
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  useEffect(() => {
    const updateOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  const maxRadius = isPortrait ? 36 : 40;
  const deadzone = 0.1;

  const updateStick = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobOffset({ x: dx, y: dy });

    const normX = dx / maxRadius;
    const normY = -dy / maxRadius; // up on screen = +1 forward
    const mag = Math.hypot(normX, normY);

    if (mag < deadzone) {
      inputRef.current.moveX = 0;
      inputRef.current.moveY = 0;
    } else {
      const scaled = (mag - deadzone) / (1 - deadzone);
      inputRef.current.moveX = (normX / mag) * Math.min(1, scaled);
      inputRef.current.moveY = (normY / mag) * Math.min(1, scaled);
    }
  };

  const resetStick = () => {
    activePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
  };

  return (
    <>
      {/* Left: Virtual Analog Joystick in Mandatory Bottom Safe Zone (bottom: calc(108px + safe-area), left: 20px) */}
      <div
        ref={baseRef}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (activePointerId.current !== null) return;
          activePointerId.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          updateStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (activePointerId.current !== e.pointerId) return;
          updateStick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (activePointerId.current === e.pointerId) {
            resetStick();
          }
        }}
        onPointerCancel={(e) => {
          if (activePointerId.current === e.pointerId) {
            resetStick();
          }
        }}
        style={{
          bottom: 'calc(108px + env(safe-area-inset-bottom))',
          left: '20px',
        }}
        className={`pointer-events-auto touch-none-select fixed z-50 flex items-center justify-center rounded-full border-2 border-white/25 bg-slate-950/50 shadow-lg ${
          isPortrait ? 'h-[106px] w-[106px]' : 'h-[116px] w-[116px]'
        }`}
        aria-label="Joystick virtual de movimento"
      >
        <div className="pointer-events-none absolute inset-4 rounded-full border border-white/10" />
        <div
          style={{
            transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
          }}
          className={`pointer-events-none rounded-full border-2 border-white/70 bg-white/85 shadow-md transition-transform duration-75 ${
            isPortrait ? 'h-11 w-11' : 'h-12 w-12'
          }`}
        />
      </div>

      {/* Discreet Mid-Right Camera Rotate Button (completely separated from Jump button) */}
      {!hideCameraButton && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onRotateCameraStep();
          }}
          className="pointer-events-auto fixed right-[18px] top-1/2 -translate-y-1/2 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/60 text-sky-300 shadow-md backdrop-blur-sm active:scale-95 transition-transform"
          aria-label="Girar câmera"
          title="Girar câmera"
        >
          <Camera className="h-5 w-5" />
        </button>
      )}

      {/* Right: Isolated High-Contrast JUMP Button (68px portrait / 72px landscape, z-60, Bottom Safe Zone >= 112px) */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          inputRef.current.jumpPressed = true;
          setJumpActive(true);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          inputRef.current.jumpPressed = false;
          setJumpActive(false);
        }}
        onPointerCancel={() => {
          inputRef.current.jumpPressed = false;
          setJumpActive(false);
        }}
        style={{
          bottom: 'calc(112px + env(safe-area-inset-bottom))',
          right: '20px',
        }}
        className={`pointer-events-auto touch-none-select fixed z-[60] flex flex-col items-center justify-center rounded-full border-4 border-emerald-200/90 text-white shadow-2xl transition-transform ${
          isPortrait ? 'h-[68px] w-[68px]' : 'h-[72px] w-[72px]'
        } ${jumpActive ? 'scale-90 bg-emerald-600' : 'bg-emerald-500 hover:bg-emerald-400'}`}
        aria-label="Pular"
      >
        <ArrowUp className="h-6 w-6 stroke-[3]" />
        <span className="font-display text-[11px] font-black tracking-wide leading-none mt-0.5">
          PULAR
        </span>
      </button>
    </>
  );
}
