import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface LaunchSplashProps {
  ready: boolean;
  onComplete: () => void;
}

/**
 * Animated launch splash shown every time Qaderno opens:
 * 1. Draws the longer Q arc top-to-bottom.
 * 2. Draws the shorter Q tail bottom-to-top.
 * 3. Smoothly zooms toward the center while dissolving into the live interface.
 */
export const LaunchSplash: React.FC<LaunchSplashProps> = ({ ready, onComplete }) => {
  const [reducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [drawDone, setDrawDone] = useState(false);
  const [zooming, setZooming] = useState(false);

  // Wait for the Q stroke drawing sequence to finish before allowing zoom-out
  useEffect(() => {
    const drawDurationMs = reducedMotion ? 220 : 800;
    const timer = window.setTimeout(() => {
      setDrawDone(true);
    }, drawDurationMs);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  // Trigger the zoom-into-center exit once both drawing and workspace loading are ready
  useEffect(() => {
    if (!drawDone || !ready || zooming) return;
    setZooming(true);
  }, [drawDone, ready, zooming]);

  // Notify parent when the zoom-out dissolve finishes
  useEffect(() => {
    if (!zooming) return;
    const exitMs = reducedMotion ? 200 : 380;
    const timer = window.setTimeout(() => {
      onComplete();
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [zooming, reducedMotion, onComplete]);

  return (
    <motion.div
      aria-label="Avvio di Qaderno"
      role="status"
      initial={{ opacity: 1 }}
      animate={{ opacity: zooming ? 0 : 1 }}
      transition={{
        duration: reducedMotion ? 0.18 : 0.34,
        delay: zooming && !reducedMotion ? 0.04 : 0,
        ease: [0.32, 0, 0.2, 1],
      }}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#F2F2F7] dark:bg-[#0E0E10] no-ios-select no-print ${
        zooming ? 'pointer-events-none' : ''
      }`}
    >
      <motion.div
        initial={{ scale: reducedMotion ? 1 : 0.92, opacity: 0 }}
        animate={
          zooming
            ? {
                scale: reducedMotion ? 1.04 : 4.2,
                opacity: 0,
              }
            : {
                scale: 1,
                opacity: 1,
              }
        }
        transition={
          zooming
            ? {
                duration: reducedMotion ? 0.2 : 0.38,
                ease: [0.32, 0, 0.2, 1],
              }
            : {
                duration: 0.2,
                ease: [0.22, 1, 0.36, 1],
              }
        }
        className="flex flex-col items-center justify-center will-change-transform"
      >
        <svg
          width={108}
          height={108}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="drop-shadow-[0_12px_28px_rgba(28,28,30,0.08)] dark:drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          <defs>
            <clipPath id="qaderno-splash-clip">
              <rect x="1.5" y="1.5" width="61" height="61" rx="15" />
            </clipPath>
          </defs>

          <rect
            x="1.5"
            y="1.5"
            width="61"
            height="61"
            rx="15"
            className="fill-[#FBFBFD] dark:fill-[#1E1E22] stroke-[#3C3C43]/18 dark:stroke-white/15"
            strokeWidth="1.5"
          />

          <g clipPath="url(#qaderno-splash-clip)">
            {/* Subtle paper grid inside logo */}
            <path
              d="M21 2V62M43 2V62M2 21H62M2 43H62"
              className="stroke-[#E5E5EA]/85 dark:stroke-white/8"
              strokeWidth="0.9"
            />

            {/* Longer Q bowl curve: drawn top-to-bottom */}
            <motion.path
              d="M -3 16 C 6 39.5, 35.75 41.5, 46 14"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="8.25"
              strokeLinecap="round"
              fill="none"
              initial={reducedMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : {
                      pathLength: {
                        delay: 0.08,
                        duration: 0.48,
                        ease: [0.22, 1, 0.36, 1],
                      },
                      opacity: {
                        delay: 0.08,
                        duration: 0.05,
                        ease: 'linear',
                      },
                    }
              }
            />

            {/* Shorter Q tail: reversed Bézier so it draws strictly bottom-to-top */}
            <motion.path
              d="M 55.25 51 C 42.25 48.25, 36.5 39, 28.5 34.25"
              className="stroke-[#1C1C1E] dark:stroke-[#F5F5F7]"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              initial={reducedMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : {
                      pathLength: {
                        delay: 0.36,
                        duration: 0.34,
                        ease: [0.22, 1, 0.36, 1],
                      },
                      opacity: {
                        delay: 0.36,
                        duration: 0.05,
                        ease: 'linear',
                      },
                    }
              }
            />
          </g>
        </svg>
      </motion.div>
    </motion.div>
  );
};
