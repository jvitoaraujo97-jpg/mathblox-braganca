import { Camera, ArrowUp } from 'lucide-react';
import { useRef, useState } from 'react';

export interface MobileInputState {
  moveX: number; // -1..1
  moveY: number; // -1..1 (up is -1 on screen, forward is +1 in game)
  jumpPressed: boolean;
  cameraYawDelta: number;
}

interface MobileControlsProps {
  inputRef: React.MutableRefObject<MobileInputState>;
  onRotateCameraStep: () => void;
}

export function MobileControls({ inputRef, onRotateCameraStep }: MobileControlsProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [jumpActive, setJumpActive] = useState(false);

  const maxRadius = 42;
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-5 pb-6 sm:px-8 sm:pb-8 pb-safe">
      {/* Left: Virtual Analog Joystick */}
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
        className="pointer-events-auto touch-none-select relative flex h-32 w-32 items-center justify-center rounded-full border-2 border-white/25 bg-slate-950/55 shadow-lg"
        aria-label="Joystick virtual de movimento"
      >
        <div className="pointer-events-none absolute inset-4 rounded-full border border-white/10" />
        <div
          style={{
            transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
          }}
          className="pointer-events-none h-14 w-14 rounded-full border-2 border-white/60 bg-white/85 shadow-md transition-transform duration-75"
        />
      </div>

      {/* Right: Camera Rotate + Large Jump Button */}
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onRotateCameraStep();
          }}
          className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-xl border border-white/20 bg-slate-950/75 px-3.5 py-2 text-xs font-semibold text-white shadow-md active:scale-95 transition-transform whitespace-nowrap"
          aria-label="Girar câmera"
        >
          <Camera className="h-4 w-4 text-sky-400" />
          <span>Câmera</span>
        </button>

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
          className={`touch-none-select flex h-20 w-20 sm:h-22 sm:w-22 flex-col items-center justify-center rounded-full border-4 border-emerald-300/80 text-white shadow-xl transition-transform ${
            jumpActive ? 'scale-90 bg-emerald-600' : 'bg-emerald-500 hover:bg-emerald-400'
          }`}
          aria-label="Pular"
        >
          <ArrowUp className="h-7 w-7 stroke-[3]" />
          <span className="font-display text-xs font-extrabold tracking-wide">PULAR</span>
        </button>
      </div>
    </div>
  );
}
