const FOUNTAIN_PEN_KEY = 'qaderno_easter_fountain_pen';
const NIGHT_BANNER_DISMISSED_KEY = 'qaderno_night_banner_dismissed';

export function isFountainPenUnlocked(): boolean {
  try {
    return localStorage.getItem(FOUNTAIN_PEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function unlockFountainPen(): void {
  try {
    localStorage.setItem(FOUNTAIN_PEN_KEY, 'true');
  } catch {
    // ignore storage errors
  }
}

export function isBZeroTitle(title: string): boolean {
  return title.trim().toLowerCase() === 'bzero';
}

export function isNightStudyHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 1 && hour < 4;
}

export function isNightBannerDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(NIGHT_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissNightBannerThisSession(): void {
  try {
    sessionStorage.setItem(NIGHT_BANNER_DISMISSED_KEY, '1');
  } catch {
    // ignore storage errors
  }
}
