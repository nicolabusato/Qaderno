export const APP_VERSION = '1.3.1';

export const LAST_SEEN_VERSION_STORAGE_KEY = 'qaderno_last_seen_version';

export type ChangelogIconName =
  | 'Wrench'
  | 'Search'
  | 'Smartphone'
  | 'History'
  | 'Sparkles'
  | 'BookOpen'
  | 'Compass'
  | 'Hand'
  | 'Table'
  | 'PenTool';

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
    title: 'Novità in Qaderno 1.3.1',
    features: [
      {
        id: 'bug-fixes-131',
        icon: 'Wrench',
        title: 'Risoluzione di bug e miglioramenti',
        description:
          "Risolti diversi bug, resa molto più visibile l'evidenziazione del testo anche in tema scuro, migliorata la modalità codice con ''' e reso il cambio font indipendente dalla riga già scritta.",
      },
      {
        id: 'mobile-ui-fix-131',
        icon: 'Smartphone',
        title: 'Interfaccia da cellulare sistemata',
        description:
          "Sistemati layout, proporzioni e controlli dell'interfaccia su smartphone per un'esperienza di scrittura ancora più comoda.",
      },
    ],
  },
  {
    version: '1.3.0',
    title: 'Novità in Qaderno 1.3',
    features: [
      {
        id: 'quick-text-search',
        icon: 'Search',
        title: 'Ricerca rapida nel testo',
        description:
          "Trova istantaneamente parole e frasi specifiche sia negli appunti scritti da tastiera che all'interno dei documenti PDF.",
      },
      {
        id: 'smartphone-interface',
        icon: 'Smartphone',
        title: 'Interfaccia ottimizzata per smartphone',
        description:
          "Foglio verticale proporzionato allo schermo del telefono, testo più leggibile, barra superiore ingrandita e controlli studiati per l'uso a una mano.",
      },
      {
        id: 'qaderno-snapshot',
        icon: 'History',
        title: 'Qaderno Snapshot',
        description:
          'Visualizza e ripristina le versioni precedenti del quaderno attivo direttamente dal suo menu contestuale.',
      },
      {
        id: 'animated-splash',
        icon: 'Sparkles',
        title: 'Nuova Splash Screen animata',
        description:
          "Avvio dell'applicazione ancora più curato e fluido con la nuova schermata iniziale animata.",
      },
      {
        id: 'renewed-welcome',
        icon: 'BookOpen',
        title: 'Schermata di benvenuto rinnovata',
        description:
          'Esperienza iniziale completamente revisionata per accompagnare i nuovi utenti fin dal primo foglio.',
      },
      {
        id: 'hidden-easter-eggs',
        icon: 'Compass',
        title: '4 nuovi Easter egg nascosti',
        description:
          'Abbiamo nascosto quattro nuove sorprese interattive tra fogli, strumenti e titoli: sta a te scoprirle.',
      },
    ],
  },
  {
    version: '1.2.0',
    title: 'Novità in Qaderno 1.2',
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
