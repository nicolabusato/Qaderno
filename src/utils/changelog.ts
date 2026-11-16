export const APP_VERSION = '1.2.0';

export const LAST_SEEN_VERSION_STORAGE_KEY = 'qaderno_last_seen_version';

export type ChangelogIconName = 'Hand' | 'Table' | 'PenTool' | 'Sparkles';

export interface ChangelogFeature {
  id: string;
  icon: ChangelogIconName;
  title: string;
  description: string;
}

export interface ChangelogRelease {
  version: string;
  title: string;
  features: ChangelogFeature[];
}

export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: APP_VERSION,
    title: 'Novità in Qaderno',
    features: [
      {
        id: 'hand-and-text',
        icon: 'Hand',
        title: 'Manina e Testo separati',
        description:
          'Usa la Manina per spostarti liberamente sul foglio e lo strumento Testo dedicato per scrivere.',
      },
      {
        id: 'tables-acroform',
        icon: 'Table',
        title: 'Tabelle e Moduli PDF compilabili',
        description:
          'Compila direttamente le celle dei moduli AcroForm e scegli le date dal calendario integrato.',
      },
      {
        id: 'pen-only-mode',
        icon: 'PenTool',
        title: 'Modalità solo penna',
        description:
          'Attiva la spunta nelle Impostazioni per spostare il foglio con il dito e usare gli strumenti solo con la stilo.',
      },
      {
        id: 'hidpi-pdf',
        icon: 'Sparkles',
        title: 'PDF ad altissima nitidezza',
        description:
          'Rendering HiDPI/Retina potenziato e barra strumenti flottante con animazioni fluide iOS.',
      },
    ],
  },
];

export const LATEST_CHANGELOG: ChangelogRelease = CHANGELOG_RELEASES[0];

export function getLastSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastSeenVersion(version: string = APP_VERSION): void {
  try {
    window.localStorage.setItem(LAST_SEEN_VERSION_STORAGE_KEY, version);
  } catch {
    // Ignore storage quota or private-mode restriction
  }
}
