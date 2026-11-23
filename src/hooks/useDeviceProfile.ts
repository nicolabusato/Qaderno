import { useEffect, useState } from 'react';

export interface DeviceProfile {
  isSmartphone: boolean;
  isTablet: boolean;
  isMobileOrTablet: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  viewportHeight: number;
}

export const SMARTPHONE_SHEET_WIDTH = 420;

export function getSmartphoneSheetMinHeight(viewportHeight: number): number {
  const safeH = viewportHeight > 0 ? viewportHeight : 780;
  return Math.max(820, Math.min(940, Math.round(safeH * 1.12)));
}

export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') {
    return {
      isSmartphone: false,
      isTablet: false,
      isMobileOrTablet: false,
      isIOS: false,
      isAndroid: false,
      isStandalone: false,
      viewportHeight: 800,
    };
  }

  const ua = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;
  const hasCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = maxTouchPoints > 0 || 'ontouchstart' in window || hasCoarsePointer;

  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isIPhoneOrIPod = /iPhone|iPod/i.test(ua);

  const screenShortSide = Math.min(
    window.screen?.width || window.innerWidth,
    window.screen?.height || window.innerHeight
  );
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Strictly smartphones only — excludes iPads (shortSide >= 744), Android tablets (>= 600), and desktops
  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isSmartphone =
    !isIPad &&
    hasTouch &&
    ((isIPhoneOrIPod && viewportWidth < 640) ||
      (screenShortSide < 600 && viewportWidth < 640));

  const isTablet =
    !isSmartphone &&
    hasTouch &&
    (isIPad ||
      (isAndroid && !/Mobile/i.test(ua)) ||
      (isAndroid && screenShortSide >= 600) ||
      /Tablet|Silk|Kindle|PlayBook/i.test(ua) ||
      (hasCoarsePointer && screenShortSide >= 600 && screenShortSide <= 1180));

  const isStandalone =
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  return {
    isSmartphone,
    isTablet,
    isMobileOrTablet: isSmartphone || isTablet,
    isIOS,
    isAndroid,
    isStandalone,
    viewportHeight,
  };
}

export function useDeviceProfile(): DeviceProfile {
  const [profile, setProfile] = useState<DeviceProfile>(() => detectDeviceProfile());

  useEffect(() => {
    const update = () => {
      setProfile((prev) => {
        const next = detectDeviceProfile();
        if (
          prev.isSmartphone === next.isSmartphone &&
          prev.isTablet === next.isTablet &&
          prev.isMobileOrTablet === next.isMobileOrTablet &&
          prev.isIOS === next.isIOS &&
          prev.isAndroid === next.isAndroid &&
          prev.isStandalone === next.isStandalone &&
          Math.abs(prev.viewportHeight - next.viewportHeight) < 24
        ) {
          return prev;
        }
        return next;
      });
    };

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return profile;
}

/**
 * Tracks mobile virtual keyboard inset via window.visualViewport
 * and ensures the active text field stays cleanly visible above the keyboard.
 */
export function useVisualViewportKeyboard(enabled: boolean): number {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setKeyboardInset(0);
      return;
    }

    const vv = window.visualViewport;
    let prevOpen = false;
    let scrollTimer: number | null = null;

    const updateInset = () => {
      const rawInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      // Ignore small browser chrome collapses (< 90px); only treat real software keyboards as open
      const nextInset = rawInset >= 90 ? rawInset : 0;
      setKeyboardInset((prev) => (Math.abs(prev - nextInset) < 4 ? prev : nextInset));

      const isNowOpen = nextInset >= 90;
      if (isNowOpen && !prevOpen) {
        if (scrollTimer !== null) window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => {
          const activeEl = document.activeElement as HTMLElement | null;
          if (
            activeEl &&
            (activeEl.tagName === 'INPUT' ||
              activeEl.tagName === 'TEXTAREA' ||
              activeEl.isContentEditable) &&
            !activeEl.closest('[data-search-bar]')
          ) {
            activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
          scrollTimer = null;
        }, 120);
      }
      prevOpen = isNowOpen;
    };

    updateInset();
    vv.addEventListener('resize', updateInset);
    vv.addEventListener('scroll', updateInset);
    return () => {
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
      vv.removeEventListener('resize', updateInset);
      vv.removeEventListener('scroll', updateInset);
    };
  }, [enabled]);

  return keyboardInset;
}
