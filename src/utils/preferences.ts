import { AppPreferences } from '../types/qaderno';

const PREFS_KEY = 'qaderno_preferences_v1';

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'light',
  defaultPaperStyle: 'grid',
  defaultFontFamily: 'sans',
  textSizeScale: 'normal',
  autoBeautifySnap: false,
  defaultHoldToSnap: true,
  autoSaveSessionJson: false,
  sessionJsonManualDownloaded: false,
};

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<AppPreferences>) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: AppPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota issues
  }
}

export function applyThemeToDocument(theme: AppPreferences['theme']): void {
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldBeDark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', shouldBeDark);

  const nextThemeColor = shouldBeDark ? '#1C1C1E' : '#F5F5F7';
  const existingMetas = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  );
  let primaryMeta = existingMetas.find((m) => !m.hasAttribute('media')) || null;

  for (const m of existingMetas) {
    if (m !== primaryMeta) {
      m.remove();
    }
  }

  if (!primaryMeta) {
    primaryMeta = document.createElement('meta');
    primaryMeta.setAttribute('name', 'theme-color');
    document.head.appendChild(primaryMeta);
  }
  primaryMeta.setAttribute('content', nextThemeColor);
}
