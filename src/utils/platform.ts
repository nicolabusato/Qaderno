export type CompatibleDesktopOS = 'windows' | 'linux' | 'incompatible';

export const SUPPORT_EMAIL = 'bzeroproject@proton.me';

export const LINUX_APPIMAGE_URL =
  'https://github.com/nicolabusato/Qaderno/releases/latest/download/Qaderno.setup.AppImage';

export const LINUX_DEB_URL =
  'https://github.com/nicolabusato/Qaderno/releases/latest/download/Qaderno.setup.deb';

export function getWindowsDownloadUrl(version: string): string {
  return `https://github.com/nicolabusato/Qaderno/releases/latest/download/QadernoSetup${version}.exe`;
}

interface NavigatorUAData {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (
    hints: string[]
  ) => Promise<{
    architecture?: string;
    bitness?: string;
    platform?: string;
  }>;
}

interface ExtendedNavigator extends Navigator {
  standalone?: boolean;
  userAgentData?: NavigatorUAData;
}

/**
 * Detects whether the current visitor is running in a standard desktop browser
 * on a compatible 64-bit x86 Windows or Linux system.
 */
export async function detectCompatibleDesktopOS(): Promise<CompatibleDesktopOS> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'incompatible';
  }

  const nav = navigator as ExtendedNavigator;
  const ua = nav.userAgent || '';

  // Immediate exclusion: already running inside Electron or installed PWA/standalone
  if (ua.includes('Electron')) {
    return 'incompatible';
  }

  const isStandalone =
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    Boolean(window.matchMedia?.('(display-mode: window-controls-overlay)').matches) ||
    Boolean(nav.standalone);
  if (isStandalone) {
    return 'incompatible';
  }

  // Immediate exclusion: mobile, tablet, macOS, ChromeOS or compact touch screens
  if (/Android|iPhone|iPad|iPod|Macintosh|Mac OS X|CrOS/i.test(ua)) {
    return 'incompatible';
  }

  const hasTouch = (nav.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  if (hasTouch && shortSide < 768) {
    return 'incompatible';
  }

  // Primary check: User-Agent Client Hints (Chromium / Edge / Opera)
  const uaData = nav.userAgentData;
  if (uaData) {
    if (uaData.mobile) {
      return 'incompatible';
    }
    try {
      const hints =
        typeof uaData.getHighEntropyValues === 'function'
          ? await uaData.getHighEntropyValues(['architecture', 'bitness'])
          : undefined;
      const platform = (hints?.platform || uaData.platform || '').trim();
      const architecture = (hints?.architecture || '').toLowerCase();
      const bitness = String(hints?.bitness || '');

      if (platform === 'Windows') {
        if (architecture === 'x86' && bitness === '64') {
          return 'windows';
        }
        if (architecture || bitness) {
          return 'incompatible';
        }
      } else if (platform === 'Linux') {
        if (architecture === 'x86' && bitness === '64') {
          return 'linux';
        }
        if (architecture || bitness) {
          return 'incompatible';
        }
      } else if (platform) {
        return 'incompatible';
      }
    } catch {
      // Fall through to navigator.userAgent fallback
    }
  }

  // Fallback for Firefox and browsers without User-Agent Client Hints
  if (ua.includes('Windows NT') && /\b(Win64|x64|WOW64)\b/i.test(ua)) {
    return 'windows';
  }

  if (ua.includes('Linux') && !ua.includes('Android') && /\b(x86_64|amd64)\b/i.test(ua)) {
    return 'linux';
  }

  return 'incompatible';
}

function detectReadableEnvironment(): { osBrowser: string; mode: string } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { osBrowser: 'Sconosciuto', mode: 'Browser' };
  }

  const nav = navigator as ExtendedNavigator;
  const ua = nav.userAgent || '';

  let os = 'Sconosciuto';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS / iPadOS';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Electron/i.test(ua)) browser = 'Electron';
  else if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  const isElectron = ua.includes('Electron');
  const isStandalone =
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    Boolean(window.matchMedia?.('(display-mode: window-controls-overlay)').matches) ||
    Boolean(nav.standalone);

  const mode = isElectron ? 'Desktop' : isStandalone ? 'PWA' : 'Browser';

  return {
    osBrowser: `${os} / ${browser}`,
    mode,
  };
}

export function buildIssueReportMailtoUrl(version: string): string {
  const { osBrowser, mode } = detectReadableEnvironment();
  const subject = `[Qaderno v${version}] Segnalazione problema`;
  const body = [
    `Versione app: Qaderno v${version}`,
    `Sistema operativo / Browser: ${osBrowser}`,
    `Modalità: ${mode}`,
    '',
    'Descrivi qui il problema riscontrato:',
    '',
  ].join('\n');

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
