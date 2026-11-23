import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface CustomColorPickerProps {
  value: string;
  onChange?: (hex: string) => void;
  onApply: (hex: string) => void;
  onReset?: () => void;
  resetLabel?: string;
  applyLabel?: string;
}

interface HsvColor {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeHex(input: string): string | null {
  const cleaned = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split('')
      .map((ch) => ch + ch)
      .join('')
      .toUpperCase();
    return `#${expanded}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }
  return null;
}

function hexToHsv(hexInput: string): HsvColor {
  const norm = normalizeHex(hexInput) || '#1C1C1E';
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / d) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / d + 2);
    } else {
      h = 60 * ((r - g) / d + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToHex({ h, s, v }: HsvColor): string {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toByte = (ch: number) =>
    Math.round(clamp((ch + m) * 255, 0, 255))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({
  value,
  onChange,
  onApply,
  onReset,
  resetLabel = 'Predefinito',
  applyLabel = 'Applica',
}) => {
  const initialHex = normalizeHex(value) || '#1C1C1E';
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(initialHex));
  const [hexDraft, setHexDraft] = useState<string>(initialHex);

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const svDragRef = useRef<number | null>(null);
  const hueDragRef = useRef<number | null>(null);

  useEffect(() => {
    const norm = normalizeHex(value);
    if (!norm) return;
    setHexDraft((prev) => {
      if (prev.toUpperCase() === norm) return prev;
      setHsv(hexToHsv(norm));
      return norm;
    });
  }, [value]);

  const commitHsv = useCallback(
    (next: HsvColor) => {
      setHsv(next);
      const nextHex = hsvToHex(next);
      setHexDraft(nextHex);
      onChange?.(nextHex);
    },
    [onChange]
  );

  const updateSvFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const s = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const v = clamp(1 - (clientY - rect.top) / Math.max(1, rect.height), 0, 1);
      commitHsv({ h: hsv.h, s, v });
    },
    [hsv.h, commitHsv]
  );

  const updateHueFromClient = useCallback(
    (clientX: number) => {
      const el = hueRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      commitHsv({ h: ratio * 360, s: hsv.s, v: hsv.v });
    },
    [hsv.s, hsv.v, commitHsv]
  );

  const currentHex = hsvToHex(hsv);
  const pureHueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div
      className="space-y-2.5 pt-1"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName !== 'INPUT') {
          e.preventDefault();
        }
      }}
    >
      {/* 2D Saturation / Brightness Surface */}
      <div
        ref={svRef}
        role="slider"
        aria-label="Saturazione e luminosità"
        aria-valuetext={currentHex}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          svDragRef.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          updateSvFromClient(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (svDragRef.current !== e.pointerId) return;
          updateSvFromClient(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (svDragRef.current === e.pointerId) {
            svDragRef.current = null;
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
          }
        }}
        onPointerCancel={(e) => {
          if (svDragRef.current === e.pointerId) {
            svDragRef.current = null;
          }
        }}
        style={{ backgroundColor: pureHueHex }}
        className="relative h-32 w-full rounded-xl overflow-hidden border border-black/10 dark:border-white/15 cursor-crosshair touch-none select-none"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, #FFFFFF 0%, rgba(255,255,255,0) 100%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, #000000 0%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div
          className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow-md ring-1 ring-black/25 pointer-events-none"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* Horizontal Hue Bar */}
      <div
        ref={hueRef}
        role="slider"
        aria-label="Tonalità"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          hueDragRef.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          updateHueFromClient(e.clientX);
        }}
        onPointerMove={(e) => {
          if (hueDragRef.current !== e.pointerId) return;
          updateHueFromClient(e.clientX);
        }}
        onPointerUp={(e) => {
          if (hueDragRef.current === e.pointerId) {
            hueDragRef.current = null;
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
          }
        }}
        onPointerCancel={(e) => {
          if (hueDragRef.current === e.pointerId) {
            hueDragRef.current = null;
          }
        }}
        style={{
          background:
            'linear-gradient(to right, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)',
        }}
        className="relative h-3.5 w-full rounded-full border border-black/10 dark:border-white/15 cursor-pointer touch-none select-none"
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-4.5 rounded-full bg-white border border-black/25 shadow-sm pointer-events-none"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>

      {/* Compact HEX Input + Circular Preview */}
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-full border border-black/15 dark:border-white/25 shrink-0 shadow-xs"
          style={{ backgroundColor: currentHex }}
          aria-hidden="true"
        />
        <input
          type="text"
          value={hexDraft}
          maxLength={7}
          spellCheck={false}
          aria-label="Codice colore HEX"
          placeholder="#1C1C1E"
          onChange={(e) => {
            const raw = e.target.value;
            setHexDraft(raw);
            const valid = normalizeHex(raw);
            if (valid) {
              setHsv(hexToHsv(valid));
              onChange?.(valid);
            }
          }}
          onBlur={() => {
            const valid = normalizeHex(hexDraft);
            setHexDraft(valid || currentHex);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const valid = normalizeHex(hexDraft) || currentHex;
              onApply(valid);
            }
          }}
          className="flex-1 min-w-0 h-8 px-2.5 rounded-xl bg-[#787880]/10 dark:bg-white/8 border border-black/8 dark:border-white/10 font-mono text-xs uppercase text-[#1C1C1E] dark:text-[#F5F5F7] focus:outline-none focus:ring-1 focus:ring-[#1C1C1E]/30 dark:focus:ring-white/30"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-0.5">
        {onReset && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onReset}
            className="h-8 px-2.5 rounded-xl ios-control-bg text-[11px] font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-center gap-1 shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{resetLabel}</span>
          </button>
        )}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApply(normalizeHex(hexDraft) || currentHex)}
          className="flex-1 h-8 px-3 rounded-xl bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E] text-[11px] font-semibold hover:opacity-90"
        >
          {applyLabel}
        </button>
      </div>
    </div>
  );
};
