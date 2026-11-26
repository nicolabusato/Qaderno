import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ToolType } from '../types/qaderno';

export interface EraserShavingsHandle {
  recordScrubPoint: (clientX: number, clientY: number) => void;
  endScrub: () => void;
}

interface EraserShavingsOverlayProps {
  activeTool: ToolType;
}

interface ShavingParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  vAngle: number;
  shade: string;
  curve: number;
  restY: number;
  settled: boolean;
  swept: boolean;
  opacity: number;
}

const MAX_SHAVINGS = 30;
const SCRUB_WINDOW_MS = 2500;
const SCRUB_RADIUS_PX = 115;
const MIN_REVERSALS = 5;
const BURST_COOLDOWN_MS = 340;
const GRAVITY = 0.42;

const LIGHT_SHADES = ['#636366', '#7A7A80', '#8E8E93', '#A1A1A6', '#48484A'];
const DARK_SHADES = ['#AEAEB2', '#8E8E93', '#C7C7CC', '#7C7C82', '#D1D1D6'];

export const EraserShavingsOverlay = forwardRef<EraserShavingsHandle, EraserShavingsOverlayProps>(
  ({ activeTool }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<ShavingParticle[]>([]);
    const rafRef = useRef<number | null>(null);
    const [hasParticles, setHasParticles] = useState(false);

    // Scrub gesture tracker
    const scrubRef = useRef<{
      lastX: number;
      lastY: number;
      hasLast: boolean;
      dirX: number;
      dirY: number;
      hasDir: boolean;
      reversals: Array<{ x: number; y: number; t: number }>;
      lastBurstAt: number;
    }>({
      lastX: 0,
      lastY: 0,
      hasLast: false,
      dirX: 0,
      dirY: 0,
      hasDir: false,
      reversals: [],
      lastBurstAt: 0,
    });

    // Previous pointer state for hand sweeping along bottom edge
    const sweepPtrRef = useRef<{ x: number; y: number; t: number; active: boolean }>({
      x: 0,
      y: 0,
      t: 0,
      active: false,
    });

    const drawFrame = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const targetW = Math.round(vw * dpr);
      const targetH = Math.round(vh * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);

      for (const p of particlesRef.current) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.shade;

        // Small organic rubber shaving curl
        const hw = p.w * 0.5;
        const hh = p.h * 0.5;
        ctx.beginPath();
        ctx.moveTo(-hw, 0);
        ctx.quadraticCurveTo(0, -hh - p.curve, hw, -hh * 0.25);
        ctx.quadraticCurveTo(hw * 0.55, hh + p.curve * 0.4, -hw * 0.85, hh * 0.65);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }, []);

    const stepPhysics = useCallback(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const list = particlesRef.current;
      let anyMoving = false;

      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];

        if (!p.settled || p.swept) {
          p.vy += GRAVITY;
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= p.swept ? 0.985 : 0.99;
          p.angle += p.vAngle;

          if (p.swept) {
            if (p.x < -36 || p.x > vw + 36 || p.y > vh + 40) {
              list.splice(i, 1);
              continue;
            }
            if (p.y >= p.restY && p.vy > 0) {
              p.y = p.restY;
              p.vy = -p.vy * 0.16;
              p.vx *= 0.94;
              p.vAngle *= 0.88;
              if (Math.abs(p.vx) < 0.25 && Math.abs(p.vy) < 0.4) {
                p.vx = 0;
                p.vy = 0;
                p.vAngle = 0;
                p.swept = false;
                p.settled = true;
              }
            }
            anyMoving = true;
          } else {
            const floorY = Math.min(p.restY, vh - 5);
            if (p.y >= floorY) {
              p.y = floorY;
              if (Math.abs(p.vy) > 1.35) {
                p.vy = -p.vy * 0.22;
                p.vx *= 0.58;
                p.vAngle *= 0.6;
                anyMoving = true;
              } else {
                p.vy = 0;
                p.vx *= 0.5;
                p.vAngle = 0;
                if (Math.abs(p.vx) < 0.12) {
                  p.vx = 0;
                  p.settled = true;
                } else {
                  anyMoving = true;
                }
              }
            } else {
              anyMoving = true;
            }
          }
        }
      }

      drawFrame();

      if (list.length === 0) {
        rafRef.current = null;
        setHasParticles(false);
        return;
      }

      if (anyMoving) {
        rafRef.current = window.requestAnimationFrame(stepPhysics);
      } else {
        rafRef.current = null;
      }
    }, [drawFrame]);

    const wakeLoop = useCallback(() => {
      if (rafRef.current === null && particlesRef.current.length > 0) {
        rafRef.current = window.requestAnimationFrame(stepPhysics);
      }
    }, [stepPhysics]);

    const spawnBurst = useCallback(
      (originX: number, originY: number) => {
        const isDark = document.documentElement.classList.contains('dark');
        const palette = isDark ? DARK_SHADES : LIGHT_SHADES;
        const vh = window.innerHeight;
        const count = 5 + Math.floor(Math.random() * 4); // 5..8 lightweight shavings

        for (let i = 0; i < count; i++) {
          if (particlesRef.current.length >= MAX_SHAVINGS) {
            particlesRef.current.shift();
          }
          const spreadAngle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
          const speed = 1.2 + Math.random() * 2.8;
          particlesRef.current.push({
            x: originX + (Math.random() - 0.5) * 18,
            y: originY + (Math.random() - 0.5) * 10,
            vx: Math.cos(spreadAngle) * speed + (Math.random() - 0.5) * 1.4,
            vy: Math.sin(spreadAngle) * speed - 0.6,
            w: 4.5 + Math.random() * 5.2,
            h: 2.1 + Math.random() * 2.2,
            angle: Math.random() * Math.PI * 2,
            vAngle: (Math.random() - 0.5) * 0.24,
            shade: palette[Math.floor(Math.random() * palette.length)],
            curve: (Math.random() - 0.5) * 2.6,
            restY: vh - 6 - Math.random() * 9,
            settled: false,
            swept: false,
            opacity: 0.72 + Math.random() * 0.22,
          });
        }

        setHasParticles(true);
        // Ensure canvas is mounted on next frame before stepping
        window.requestAnimationFrame(() => {
          wakeLoop();
        });
      },
      [wakeLoop]
    );

    const recordScrubPoint = useCallback(
      (clientX: number, clientY: number) => {
        const now = performance.now();
        const s = scrubRef.current;

        if (!s.hasLast) {
          s.lastX = clientX;
          s.lastY = clientY;
          s.hasLast = true;
          return;
        }

        const dx = clientX - s.lastX;
        const dy = clientY - s.lastY;
        const dist = Math.hypot(dx, dy);
        if (dist < 4.5) return;

        const nx = dx / dist;
        const ny = dy / dist;

        if (s.hasDir) {
          const dot = nx * s.dirX + ny * s.dirY;
          if (dot < -0.22) {
            s.reversals.push({ x: clientX, y: clientY, t: now });
          }
        }

        s.dirX = nx;
        s.dirY = ny;
        s.hasDir = true;
        s.lastX = clientX;
        s.lastY = clientY;

        // Keep reversals inside the 2.5s window and tight scrub radius
        s.reversals = s.reversals.filter(
          (r) =>
            now - r.t <= SCRUB_WINDOW_MS &&
            Math.hypot(r.x - clientX, r.y - clientY) <= SCRUB_RADIUS_PX
        );

        if (s.reversals.length >= MIN_REVERSALS && now - s.lastBurstAt >= BURST_COOLDOWN_MS) {
          s.lastBurstAt = now;
          // Retain last 2 reversals so sustained scrubbing feels natural without flooding
          s.reversals = s.reversals.slice(-2);
          spawnBurst(clientX, clientY);
        }
      },
      [spawnBurst]
    );

    const endScrub = useCallback(() => {
      scrubRef.current = {
        lastX: 0,
        lastY: 0,
        hasLast: false,
        dirX: 0,
        dirY: 0,
        hasDir: false,
        reversals: [],
        lastBurstAt: scrubRef.current.lastBurstAt,
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        recordScrubPoint,
        endScrub,
      }),
      [recordScrubPoint, endScrub]
    );

    // Sweeping shavings away laterally when Manina ('pan') moves along the bottom margin
    useEffect(() => {
      if (activeTool !== 'pan' || !hasParticles) {
        sweepPtrRef.current.active = false;
        return;
      }

      const handlePointerMove = (e: PointerEvent) => {
        const vh = window.innerHeight;
        const now = performance.now();
        const prev = sweepPtrRef.current;

        if (!prev.active || now - prev.t > 140) {
          sweepPtrRef.current = { x: e.clientX, y: e.clientY, t: now, active: true };
          return;
        }

        const dt = Math.max(4, now - prev.t);
        const dx = e.clientX - prev.x;
        const vxPxPerFrame = (dx / dt) * 16.67;

        sweepPtrRef.current = { x: e.clientX, y: e.clientY, t: now, active: true };

        if (e.clientY < vh - 104 || Math.abs(vxPxPerFrame) < 1.1) {
          return;
        }

        const dir = vxPxPerFrame >= 0 ? 1 : -1;
        let touchedAny = false;

        for (const p of particlesRef.current) {
          const distX = Math.abs(p.x - e.clientX);
          const distY = Math.abs(p.y - e.clientY);
          if (distX <= 84 && distY <= 92) {
            const proximity = 1 - distX / 96;
            const push = Math.max(6.5, Math.min(22, Math.abs(vxPxPerFrame) * 0.92)) * (0.65 + proximity * 0.65);
            p.vx = dir * push + (Math.random() - 0.5) * 1.6;
            p.vy = -(1.4 + Math.random() * 2.4);
            p.vAngle = dir * (0.14 + Math.random() * 0.22);
            p.settled = false;
            p.swept = true;
            touchedAny = true;
          }
        }

        if (touchedAny) {
          wakeLoop();
        }
      };

      const handlePointerReset = () => {
        sweepPtrRef.current.active = false;
      };

      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerup', handlePointerReset, { passive: true });
      window.addEventListener('pointercancel', handlePointerReset, { passive: true });
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerReset);
        window.removeEventListener('pointercancel', handlePointerReset);
      };
    }, [activeTool, hasParticles, wakeLoop]);

    // Reposition settled particles if viewport resizes
    useEffect(() => {
      if (!hasParticles) return;
      const handleResize = () => {
        const vh = window.innerHeight;
        for (const p of particlesRef.current) {
          p.restY = vh - 6 - Math.random() * 9;
          if (p.settled) {
            p.y = p.restY;
          }
        }
        drawFrame();
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [hasParticles, drawFrame]);

    // Clean up RAF on unmount
    useEffect(() => {
      return () => {
        if (rafRef.current !== null) {
          window.cancelAnimationFrame(rafRef.current);
        }
      };
    }, []);

    if (!hasParticles) return null;

    return (
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="fixed inset-0 z-[45] w-full h-full pointer-events-none no-print"
      />
    );
  }
);

EraserShavingsOverlay.displayName = 'EraserShavingsOverlay';
