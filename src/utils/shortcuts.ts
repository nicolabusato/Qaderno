import { ShortcutActionId, ShortcutMap } from '../types/qaderno';

const STORAGE_KEY = 'qaderno_shortcuts_v2';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  category: 'Modifica' | 'Visualizzazione' | 'Strumenti' | 'Colori';
  defaultCombo: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'undo', label: 'Annulla', category: 'Modifica', defaultCombo: 'Mod+Z' },
  { id: 'redo', label: 'Ripristina', category: 'Modifica', defaultCombo: 'Mod+Shift+Z' },
  { id: 'copy', label: 'Copia selezione', category: 'Modifica', defaultCombo: 'Mod+C' },
  { id: 'cut', label: 'Taglia selezione', category: 'Modifica', defaultCombo: 'Mod+X' },
  { id: 'paste', label: 'Incolla', category: 'Modifica', defaultCombo: 'Mod+V' },
  { id: 'delete', label: 'Elimina selezione', category: 'Modifica', defaultCombo: 'Backspace' },
  { id: 'zoomIn', label: 'Zoom avanti', category: 'Visualizzazione', defaultCombo: 'Mod+=' },
  { id: 'zoomOut', label: 'Zoom indietro', category: 'Visualizzazione', defaultCombo: 'Mod+-' },
  { id: 'zoomReset', label: 'Reimposta zoom 100%', category: 'Visualizzazione', defaultCombo: 'Mod+0' },
  { id: 'toolText', label: 'Strumento Cursore / Testo', category: 'Strumenti', defaultCombo: 'T' },
  { id: 'toolPen', label: 'Strumento Penna', category: 'Strumenti', defaultCombo: 'P' },
  { id: 'toolHighlighter', label: 'Strumento Evidenziatore', category: 'Strumenti', defaultCombo: 'H' },
  { id: 'toolEraser', label: 'Strumento Gomma', category: 'Strumenti', defaultCombo: 'E' },
  { id: 'toolLasso', label: 'Strumento Lazo', category: 'Strumenti', defaultCombo: 'L' },
  { id: 'toggleSnap', label: 'Attiva/Disattiva Hold-to-Snap', category: 'Strumenti', defaultCombo: 'S' },
  { id: 'color1', label: 'Colore Grafite', category: 'Colori', defaultCombo: '1' },
  { id: 'color2', label: 'Colore Ardesia', category: 'Colori', defaultCombo: '2' },
  { id: 'color3', label: 'Colore Blu Notte', category: 'Colori', defaultCombo: '3' },
  { id: 'color4', label: 'Colore Verde Salvia', category: 'Colori', defaultCombo: '4' },
  { id: 'color5', label: 'Colore Terracotta', category: 'Colori', defaultCombo: '5' },
];

export function getDefaultShortcuts(): ShortcutMap {
  const map = {} as ShortcutMap;
  for (const def of SHORTCUT_DEFINITIONS) {
    map[def.id] = def.defaultCombo;
  }
  return map;
}

export function loadShortcuts(): ShortcutMap {
  const defaults = getDefaultShortcuts();
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('qaderno_shortcuts_v1');
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ShortcutMap>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveShortcuts(map: ShortcutMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota issues
  }
}

export function resetShortcuts(): ShortcutMap {
  const defaults = getDefaultShortcuts();
  saveShortcuts(defaults);
  return defaults;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

export function normalizeKeyName(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Delete') return 'Delete';
  if (key === 'Backspace') return 'Backspace';
  if (key === 'Escape') return 'Escape';
  if (key === '+') return '+';
  if (key === '=') return '=';
  if (key === '-') return '-';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function eventToCombo(e: KeyboardEvent): string | null {
  const ignored = ['Control', 'Meta', 'Shift', 'Alt', 'CapsLock', 'Tab'];
  if (ignored.includes(e.key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(normalizeKeyName(e.key));
  return parts.join('+');
}

export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  const parts = combo.split('+');
  const needsMod = parts.includes('Mod');
  const needsAlt = parts.includes('Alt');
  const needsShift = parts.includes('Shift');
  const targetKey = parts[parts.length - 1];

  const hasMod = e.metaKey || e.ctrlKey;
  if (hasMod !== needsMod) return false;
  if (e.altKey !== needsAlt) return false;

  const pressedKey = normalizeKeyName(e.key);

  // Special-case Mod+= / Mod++ on international keyboards (e.g. Shift+= produces +)
  if ((targetKey === '=' || targetKey === '+') && (pressedKey === '+' || pressedKey === '=' || e.code === 'Equal' || e.code === 'NumpadAdd')) {
    return true;
  }
  if (targetKey === '-' && (pressedKey === '-' || pressedKey === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract')) {
    return true;
  }

  if (e.shiftKey !== needsShift) return false;

  if (targetKey === 'Backspace' && (pressedKey === 'Backspace' || pressedKey === 'Delete')) {
    return true;
  }
  return pressedKey === targetKey;
}

export function formatComboDisplay(combo: string): string {
  const mac = isMacPlatform();
  return combo
    .split('+')
    .map((part) => {
      if (part === 'Mod') return mac ? '⌘' : 'Ctrl';
      if (part === 'Shift') return mac ? '⇧' : 'Shift';
      if (part === 'Alt') return mac ? '⌥' : 'Alt';
      if (part === 'Backspace') return mac ? '⌫' : 'Canc';
      if (part === 'Delete') return 'Canc';
      if (part === '=') return '+';
      return part;
    })
    .join(mac ? '' : '+');
}
