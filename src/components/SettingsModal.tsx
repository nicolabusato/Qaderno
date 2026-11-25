import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  FileJson,
  FolderCheck,
  FolderSync,
  Keyboard,
  Layers,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Unlink,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  AppPreferences,
  NOTE_FONTS,
  NoteFontFamily,
  PaperStyle,
  ShortcutActionId,
  ShortcutMap,
  ThemeMode,
} from '../types/qaderno';
import { APP_VERSION } from '../utils/changelog';
import { isDirectorySyncSupported } from '../utils/localFolderSync';
import { eventToCombo, formatComboDisplay, SHORTCUT_DEFINITIONS } from '../utils/shortcuts';
import { CustomSelect } from './CustomSelect';
import { QadernoLogo } from './QadernoLogo';

interface SettingsModalProps {
  open: boolean;
  preferences: AppPreferences;
  shortcuts: ShortcutMap;
  connectedDirName: string | null;
  connectedSessionFileName: string | null;
  lastSessionJsonSavedAt: number | null;
  onClose: () => void;
  onUpdatePreferences: (next: AppPreferences) => void;
  onUpdateShortcut: (actionId: ShortcutActionId, combo: string) => void;
  onResetShortcuts: () => void;
  onConnectLocalFolder: () => void;
  onSyncLocalFolderNow: () => void;
  onDisconnectLocalFolder: () => void;
  onDownloadSessionJson: () => void;
  onImportSessionJson: (file: File) => void;
  onDisconnectSessionFile: () => void;
  onRequestFactoryReset: () => void;
  onOpenWhatsNew: () => void;
  onOpenOnboarding: () => void;
}

type SettingsTab = 'general' | 'shortcuts' | 'credits';

const SHORTCUT_CATEGORIES: Array<'Modifica' | 'Visualizzazione' | 'Strumenti' | 'Colori'> = [
  'Modifica',
  'Visualizzazione',
  'Strumenti',
  'Colori',
];

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  mobileLabel?: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'general',
    label: 'Aspetto e Sincronia',
    mobileLabel: 'Aspetto',
    icon: <Sliders className="w-3.5 h-3.5 shrink-0" />,
  },
  { id: 'shortcuts', label: 'Scorciatoie', icon: <Keyboard className="w-3.5 h-3.5 shrink-0" /> },
  { id: 'credits', label: 'Crediti', icon: <User className="w-3.5 h-3.5 shrink-0" /> },
];

const SYNC_SUPPORTED = isDirectorySyncSupported();

export const SettingsModal: React.FC<SettingsModalProps> = React.memo(({
  open,
  preferences,
  shortcuts,
  connectedDirName,
  connectedSessionFileName,
  lastSessionJsonSavedAt,
  onClose,
  onUpdatePreferences,
  onUpdateShortcut,
  onResetShortcuts,
  onConnectLocalFolder,
  onSyncLocalFolderNow,
  onDisconnectLocalFolder,
  onDownloadSessionJson,
  onImportSessionJson,
  onDisconnectSessionFile,
  onRequestFactoryReset,
  onOpenWhatsNew,
  onOpenOnboarding,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [capturingId, setCapturingId] = useState<ShortcutActionId | null>(null);
  const [logoTaps, setLogoTaps] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptDate, setReceiptDate] = useState<Date>(() => new Date());
  const logoTapTimerRef = useRef<number | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !capturingId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturingId(null);
        return;
      }
      const combo = eventToCombo(e);
      if (combo) {
        onUpdateShortcut(capturingId, combo);
        setCapturingId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, capturingId, onUpdateShortcut]);

  useEffect(() => {
    if (!open) {
      setCapturingId(null);
      setLogoTaps(0);
      if (logoTapTimerRef.current !== null) {
        window.clearTimeout(logoTapTimerRef.current);
        logoTapTimerRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (logoTapTimerRef.current !== null) {
        window.clearTimeout(logoTapTimerRef.current);
      }
    };
  }, []);

  const handleLogoTap = () => {
    if (logoTapTimerRef.current !== null) {
      window.clearTimeout(logoTapTimerRef.current);
      logoTapTimerRef.current = null;
    }
    const next = logoTaps + 1;
    if (next >= 10) {
      setLogoTaps(0);
      setReceiptDate(new Date());
      setShowReceipt(true);
      try {
        navigator.vibrate?.([40, 40]);
      } catch {
        // Ignore unsupported vibration
      }
      return;
    }
    setLogoTaps(next);
    logoTapTimerRef.current = window.setTimeout(() => {
      setLogoTaps(0);
      logoTapTimerRef.current = null;
    }, 3000);
  };

  if (!open) return null;

  const tapIntensity = logoTaps >= 5 ? logoTaps - 4 : 0;
  const formattedReceiptDate = receiptDate.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const formattedReceiptTime = receiptDate.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <motion.div
      key="settings-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-2.5 sm:p-4 no-print"
      onClick={onClose}
    >
      <motion.div
        key="settings-dialog"
        initial={{ opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        style={{ contain: 'layout paint', transform: 'translateZ(0)' }}
        className="w-full max-w-xl max-h-[90dvh] sm:max-h-[86vh] bg-[#F2F2F7]/98 dark:bg-[#1C1C1E]/98 backdrop-blur-sm rounded-2xl border border-white/60 dark:border-white/10 shadow-lg flex flex-col overflow-hidden will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        {/* Header */}
        <div className="px-3.5 sm:px-5 pt-3.5 sm:pt-4 pb-3 border-b border-[#3C3C43]/12 dark:border-white/10 bg-[#FBFBFD] dark:bg-[#242428] space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 id="settings-modal-title" className="text-base font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
              Impostazioni
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors shrink-0"
              aria-label="Chiudi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-full bg-[#787880]/12 dark:bg-white/8 w-full overflow-hidden">
            {SETTINGS_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative min-w-0 min-h-[34px] px-1.5 sm:px-2.5 rounded-full text-[11px] sm:text-xs font-medium flex items-center justify-center gap-1 sm:gap-1.5 transition-colors ${
                    active
                      ? 'bg-[#FBFBFD] dark:bg-[#323236] shadow-xs text-[#1C1C1E] dark:text-[#F5F5F7]'
                      : 'text-[#48484A] dark:text-[#A1A1A6] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  <span className="flex items-center justify-center gap-1 sm:gap-1.5 min-w-0">
                    {tab.icon}
                    {tab.mobileLabel ? (
                      <>
                        <span className="sm:hidden truncate">{tab.mobileLabel}</span>
                        <span className="hidden sm:inline truncate">{tab.label}</span>
                      </>
                    ) : (
                      <span className="truncate">{tab.label}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div
          style={{ contain: 'layout paint', transform: 'translateZ(0)', overscrollBehavior: 'contain' }}
          className="flex-1 overflow-y-auto px-3.5 sm:px-5 py-3.5 sm:py-4 bg-[#F2F2F7] dark:bg-[#1C1C1E]"
        >
          {activeTab === 'general' && (
            <div className="space-y-5">
              {/* Theme */}
              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">Tema</h3>
                <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-1.5 grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'light', label: 'Chiaro', icon: <Sun className="w-3.5 h-3.5" /> },
                      { id: 'dark', label: 'Scuro', icon: <Moon className="w-3.5 h-3.5" /> },
                      { id: 'system', label: 'Sistema', icon: <Monitor className="w-3.5 h-3.5" /> },
                    ] as Array<{ id: ThemeMode; label: string; icon: React.ReactNode }>
                  ).map((opt) => {
                    const active = preferences.theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdatePreferences({ ...preferences, theme: opt.id })}
                        className={`min-h-[38px] rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                          active
                            ? 'bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E]'
                            : 'text-[#48484A] dark:text-[#A1A1A6] hover:bg-[#787880]/10'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {opt.icon}
                          <span>{opt.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Paper & Typography Defaults */}
              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">Nuovi quaderni</h3>
                <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10">
                  <div className="flex items-center justify-between px-3.5 sm:px-4 py-3 gap-2">
                    <span className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7] min-w-0 truncate">
                      Sfondo predefinito
                    </span>
                    <CustomSelect<PaperStyle>
                      ariaLabel="Sfondo predefinito"
                      value={preferences.defaultPaperStyle}
                      menuWidth={184}
                      options={[
                        { value: 'grid', label: 'Quadretti' },
                        { value: 'lined', label: 'Righe' },
                        { value: 'dotted', label: 'Puntini' },
                        { value: 'blank', label: 'Bianca' },
                      ]}
                      onChange={(nextPaper) =>
                        onUpdatePreferences({
                          ...preferences,
                          defaultPaperStyle: nextPaper,
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between px-3.5 sm:px-4 py-3 gap-2">
                    <span className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7] min-w-0 truncate">
                      Grafia predefinita
                    </span>
                    <CustomSelect<NoteFontFamily>
                      ariaLabel="Grafia predefinita"
                      value={preferences.defaultFontFamily}
                      menuWidth={236}
                      options={NOTE_FONTS.map((f) => ({
                        value: f.id,
                        label: f.label,
                        description: f.description,
                        sample: f.sample,
                        optionClassName: `font-note-${f.id}`,
                      }))}
                      onChange={(nextFont) =>
                        onUpdatePreferences({
                          ...preferences,
                          defaultFontFamily: nextFont,
                        })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between px-3.5 sm:px-4 py-3 gap-2">
                    <span className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7]">Dimensione testo</span>
                    <div className="flex items-center p-0.5 rounded-full bg-[#787880]/12 dark:bg-white/8">
                      {(
                        [
                          { id: 'small', label: 'Piccolo' },
                          { id: 'normal', label: 'Normale' },
                          { id: 'large', label: 'Grande' },
                        ] as const
                      ).map((sz) => {
                        const active = preferences.textSizeScale === sz.id;
                        return (
                          <button
                            key={sz.id}
                            type="button"
                            onClick={() => onUpdatePreferences({ ...preferences, textSizeScale: sz.id })}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                              active
                                ? 'bg-[#FBFBFD] dark:bg-[#3A3A3E] shadow-xs text-[#1C1C1E] dark:text-[#F5F5F7]'
                                : 'text-[#8E8E93]'
                            }`}
                          >
                            <span>{sz.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* Handwriting & Smart Tools */}
              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">Inchiostro e Scrittura</h3>
                <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10">
                  <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
                    <div>
                      <div className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7]">Hold-to-Snap all’avvio</div>
                      <div className="text-xs text-[#8E8E93]">
                        Riconosce forme geometriche tenendo fermo il tratto 450 ms
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.defaultHoldToSnap}
                      onChange={(e) =>
                        onUpdatePreferences({ ...preferences, defaultHoldToSnap: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#1C1C1E]"
                    />
                  </label>

                  <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
                    <div>
                      <div className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7]">Rifinitura automatica grafia</div>
                      <div className="text-xs text-[#8E8E93]">
                        Attenua il tremolio dei tratti a mano libera al termine del tratto
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.autoBeautifySnap}
                      onChange={(e) =>
                        onUpdatePreferences({ ...preferences, autoBeautifySnap: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#1C1C1E]"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7]">
                        Sposta il foglio con il dito (strumenti solo con penna)
                      </div>
                      <div className="text-xs text-[#8E8E93] leading-snug">
                        Quando spuntato, il tocco delle dita serve solo per spostarsi e fare zoom, mentre la stilo esegue lo strumento selezionato.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(preferences.fingerPanOnly)}
                      onChange={(e) =>
                        onUpdatePreferences({ ...preferences, fingerPanOnly: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#1C1C1E] shrink-0"
                    />
                  </label>
                </div>
              </section>

              {/* Full Session JSON Auto-Save (enabled in Settings + after manual download) */}
              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">
                  Sessione Completa (.json)
                </h3>
                <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10">
                  <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center gap-1.5">
                        {preferences.autoSaveSessionJson && preferences.sessionJsonManualDownloaded ? (
                          <CheckCircle2 className="w-4 h-4 text-[#3D5A45] shrink-0" />
                        ) : (
                          <FileJson className="w-4 h-4 shrink-0" />
                        )}
                        <span>Salvataggio automatico sessione in .json</span>
                      </div>
                      <p className="text-xs text-[#8E8E93] leading-snug">
                        {!preferences.sessionJsonManualDownloaded
                          ? 'Scarica manualmente il file .json qui sotto almeno una volta per attivare il salvataggio automatico in locale.'
                          : preferences.autoSaveSessionJson
                            ? connectedSessionFileName
                              ? `File collegato "${connectedSessionFileName}" · aggiornato in automatico${
                                  lastSessionJsonSavedAt
                                    ? ` (${new Intl.DateTimeFormat('it-IT', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      }).format(new Date(lastSessionJsonSavedAt))})`
                                    : ''
                                }.`
                              : `Attivo in locale: ogni modifica aggiorna la sessione completa${
                                  lastSessionJsonSavedAt
                                    ? ` (ultimo alle ${new Intl.DateTimeFormat('it-IT', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      }).format(new Date(lastSessionJsonSavedAt))})`
                                    : ''
                                }.`
                            : 'Scaricamento manuale effettuato. Attiva questa opzione per salvare automaticamente tutta la sessione.'}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.autoSaveSessionJson}
                      onChange={(e) =>
                        onUpdatePreferences({
                          ...preferences,
                          autoSaveSessionJson: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#1C1C1E] shrink-0"
                    />
                  </label>

                  <div className="p-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onDownloadSessionJson}
                      className="min-h-[36px] px-4 rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-90"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {connectedSessionFileName
                          ? 'Scarica / Cambia file .json'
                          : 'Scarica sessione (.json)'}
                      </span>
                    </button>

                    <input
                      ref={jsonInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onImportSessionJson(file);
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => jsonInputRef.current?.click()}
                      className="min-h-[34px] px-3.5 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center gap-1.5 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Ripristina da .json</span>
                    </button>

                    {connectedSessionFileName && (
                      <button
                        type="button"
                        onClick={onDisconnectSessionFile}
                        className="min-h-[34px] px-3.5 rounded-full ios-control-bg text-xs font-medium text-[#9A463D] dark:text-[#E07A6E] flex items-center gap-1.5 transition-colors"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>Scollega file</span>
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Optional Local Folder Sync for .qaderno files */}
              {SYNC_SUPPORTED && (
                <section>
                  <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">
                    Sincronizzazione Cartella Locale (.qaderno)
                  </h3>
                  <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center gap-1.5">
                          {connectedDirName ? (
                            <>
                              <FolderCheck className="w-4 h-4 text-[#3D5A45]" />
                              <span>Cartella collegata: {connectedDirName}</span>
                            </>
                          ) : (
                            <>
                              <FolderSync className="w-4 h-4" />
                              <span>Salvataggio automatico su disco</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-[#8E8E93]">
                          {connectedDirName
                            ? 'Ogni modifica aggiorna automaticamente il relativo file .qaderno nella cartella scelta.'
                            : 'Scegli una cartella sul computer per mantenere una copia .qaderno aggiornata automaticamente.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!connectedDirName ? (
                        <button
                          type="button"
                          onClick={onConnectLocalFolder}
                          className="min-h-[36px] px-4 rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-90"
                        >
                          <FolderSync className="w-3.5 h-3.5" />
                          <span>Collega cartella locale</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={onSyncLocalFolderNow}
                            className="min-h-[34px] px-3.5 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center gap-1.5 transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Sincronizza tutti ora</span>
                          </button>
                          <button
                            type="button"
                            onClick={onConnectLocalFolder}
                            className="min-h-[34px] px-3.5 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors"
                          >
                            Cambia cartella
                          </button>
                          <button
                            type="button"
                            onClick={onDisconnectLocalFolder}
                            className="min-h-[34px] px-3.5 rounded-full ios-control-bg text-xs font-medium text-[#9A463D] dark:text-[#E07A6E] flex items-center gap-1.5 transition-colors"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                            <span>Scollega</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </section>
              )}
              {/* Factory Reset / Wipe All Site Data */}
              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">Ripristino completo</h3>
                <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#1C1C1E] dark:text-[#F5F5F7]">
                      Ripristina Qaderno da zero
                    </div>
                    <p className="text-xs text-[#8E8E93] leading-snug">
                      Elimina tutti i quaderni, taccuini, PDF, scorciatoie e impostazioni salvati sul dispositivo e ricomincia come un nuovo utente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onRequestFactoryReset}
                    className="min-h-[38px] px-4 rounded-full bg-[#9A463D]/12 dark:bg-[#E07A6E]/18 text-[#9A463D] dark:text-[#E07A6E] hover:bg-[#9A463D]/20 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ripristina</span>
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-5">
              <p className="text-xs text-[#8E8E93] px-1">
                Tocca una combinazione per riassegnarla · Salvate automaticamente in locale
              </p>
              {SHORTCUT_CATEGORIES.map((cat) => {
                const defs = SHORTCUT_DEFINITIONS.filter((d) => d.category === cat);
                return (
                  <section key={cat}>
                    <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">{cat}</h3>
                    <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10 overflow-hidden">
                      {defs.map((def) => {
                        const isCapturing = capturingId === def.id;
                        const currentCombo = shortcuts[def.id] || def.defaultCombo;
                        return (
                          <div
                            key={def.id}
                            className="flex items-center justify-between gap-2 px-3.5 sm:px-4 py-2.5 min-h-[46px]"
                          >
                            <span className="text-xs sm:text-sm text-[#1C1C1E] dark:text-[#F5F5F7] min-w-0">
                              {def.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCapturingId(isCapturing ? null : def.id)}
                              className={`min-h-[32px] px-2.5 sm:px-3 rounded-full text-[11px] sm:text-xs font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                                isCapturing
                                  ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                                  : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
                              }`}
                            >
                              {isCapturing ? 'Premi i tasti…' : formatComboDisplay(currentCombo)}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {activeTab === 'credits' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-6 flex flex-col items-center text-center space-y-3">
                <motion.button
                  type="button"
                  onClick={handleLogoTap}
                  whileTap={{ scale: 0.94, y: 1.5 }}
                  className="rounded-2xl cursor-pointer no-ios-select focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1C1E]/30 dark:focus-visible:ring-white/30"
                  aria-label="Logo di Qaderno"
                >
                  <motion.div
                    key={logoTaps >= 5 ? `logo-tap-${logoTaps}` : 'logo-idle'}
                    initial={{ y: 0, rotate: 0, scale: 1 }}
                    animate={
                      logoTaps >= 5
                        ? {
                            y: [0, 2 + tapIntensity * 0.7, -(1 + tapIntensity * 0.45), 0],
                            rotate: [
                              0,
                              -(2 + tapIntensity * 1.15),
                              2 + tapIntensity * 1.15,
                              -(1 + tapIntensity * 0.4),
                              0,
                            ],
                            scale: [1, 0.94, 1.03, 1],
                          }
                        : { y: 0, rotate: 0, scale: 1 }
                    }
                    transition={{
                      duration: logoTaps >= 5 ? Math.max(0.085, 0.16 - tapIntensity * 0.015) : 0.12,
                      ease: 'easeOut',
                    }}
                  >
                    <QadernoLogo size={68} zoomedTail />
                  </motion.div>
                </motion.button>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7]">
                    Qaderno
                  </h3>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    Fa parte del <span className="font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">Progetto BZero</span>
                  </p>
                </div>
                <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300 max-w-md">
                  Quaderno digitale ibrido a quadretti con scrittura naturale, disegno vettoriale e
                  annotazione diretta dei documenti PDF, progettato per funzionare interamente offline
                  senza configurazioni complesse.
                </p>

                <AnimatePresence initial={false}>
                  {showReceipt && (
                    <motion.div
                      key="budget-zero-receipt"
                      initial={{ height: 0, opacity: 0, y: -20 }}
                      animate={{ height: 'auto', opacity: 1, y: 0 }}
                      exit={{ height: 0, opacity: 0, y: -10 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                      className="w-full max-w-xs overflow-hidden text-left"
                    >
                      <div className="bg-neutral-50 dark:bg-[#1C1C1E] text-neutral-800 dark:text-neutral-200 border border-dashed border-neutral-300 dark:border-neutral-700 p-4 rounded-xl shadow-inner mt-4 overflow-hidden relative">
                        {/* Serrated thermal paper edge - top */}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 240 6"
                          preserveAspectRatio="none"
                          className="w-[calc(100%+2rem)] h-1.5 -mx-4 -mt-4 mb-3 text-neutral-300/75 dark:text-neutral-700/80 block"
                        >
                          <path
                            d="M0,0 L6,5 L12,0 L18,5 L24,0 L30,5 L36,0 L42,5 L48,0 L54,5 L60,0 L66,5 L72,0 L78,5 L84,0 L90,5 L96,0 L102,5 L108,0 L114,5 L120,0 L126,5 L132,0 L138,5 L144,0 L150,5 L156,0 L162,5 L168,0 L174,5 L180,0 L186,5 L192,0 L198,5 L204,0 L210,5 L216,0 L222,5 L228,0 L234,5 L240,0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>

                        <div className="font-mono text-[11px] sm:text-xs leading-[1.5] text-neutral-700 dark:text-neutral-300 opacity-90 select-text">
                          <div className="text-center whitespace-pre">
                            {'============================\n       PROGETTO BZERO\n    - QADERNO APP ONLINE -\n============================'}
                          </div>
                          <div className="mt-2 whitespace-pre text-[10.5px] sm:text-[11px] text-neutral-600 dark:text-neutral-400">
                            {`DATI UTENTE: LIBERO #0001\nDATA: ${formattedReceiptDate} ore ${formattedReceiptTime}\nSTATO: 100% LOCALE & OFFLINE`}
                          </div>
                          <div className="text-center whitespace-pre mt-1">
                            {'============================'}
                          </div>
                          <div className="mt-1.5 whitespace-pre text-[10.5px] sm:text-[11px]">
                            {'SPAZIO CLOUD ........... €0,00\nABBONAMENTO PRO ........ €0,00\nAI & ASSISTENTE ........ €0,00\nTELEMETRIA/TRACKING .... €0,00\nPUBBLICITA\' & BANNER ... €0,00\nCRIPTO/PAYWALLS ........ €0,00\n------------------------------\nDATI TRACCIATI ..... 0.00 Byte\nPRIVACY & SICUREZZA .. INCLUSA'}
                          </div>
                          <div className="text-center whitespace-pre mt-1">
                            {'============================'}
                          </div>
                          <div className="whitespace-pre font-bold text-neutral-900 dark:text-neutral-100 py-0.5 text-center">
                            {'TOTALE DOVUTO :       € 0,00'}
                          </div>
                          <div className="text-center whitespace-pre">
                            {'============================'}
                          </div>
                          <div className="text-center whitespace-pre mt-2.5 text-[10.5px] sm:text-[11px] text-neutral-600 dark:text-neutral-400">
                            {'Grazie per non aver speso nulla!\n\nOfferto liberamente a Budget Zero\n* cert. BZero - ID: Q-42-O1 *'}
                          </div>
                          <div className="text-center mt-3">
                            <div className="tracking-[-0.06em] text-sm font-bold text-neutral-800 dark:text-neutral-200 leading-none select-none">
                              || | ||||| | ||| || ||| | |||
                            </div>
                            <div className="text-[10px] tracking-wider text-neutral-500 dark:text-neutral-400 mt-1">
                              * GRATIS PER SEMPRE *
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setShowReceipt(false);
                            setLogoTaps(0);
                          }}
                          className="text-xs text-neutral-400 dark:text-neutral-500 underline hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer text-center mt-3 block mx-auto"
                        >
                          Strappa scontrino
                        </button>

                        {/* Serrated thermal paper edge - bottom */}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 240 6"
                          preserveAspectRatio="none"
                          className="w-[calc(100%+2rem)] h-1.5 -mx-4 -mb-4 mt-3 text-neutral-300/75 dark:text-neutral-700/80 block"
                        >
                          <path
                            d="M0,6 L6,1 L12,6 L18,1 L24,6 L30,1 L36,6 L42,1 L48,6 L54,1 L60,6 L66,1 L72,6 L78,1 L84,6 L90,1 L96,6 L102,1 L108,6 L114,1 L120,6 L126,1 L132,6 L138,1 L144,6 L150,1 L156,6 L162,1 L168,6 L174,1 L180,6 L186,1 L192,6 L198,1 L204,6 L210,1 L216,6 L222,1 L228,6 L234,1 L240,6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">L&apos;iniziativa</h3>
                <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-4 sm:p-5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Layers className="w-4 h-4 text-[#48484A] dark:text-[#C7C7CC] shrink-0" />
                      <h4 className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                        Progetto BZero
                      </h4>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-[#787880]/10 dark:bg-white/10 text-[11px] font-medium text-[#48484A] dark:text-[#C7C7CC] shrink-0">
                      Budget Zero
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                    Il <strong className="font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">Progetto BZero</strong> (<em>Budget Zero</em>) nasce con l&apos;obiettivo di offrire alternative gratuite, intuitive e altrettanto produttive ai tradizionali software a pagamento, rendendo finalmente accessibili a chiunque strumenti digitali ormai indispensabili nello studio e nel lavoro quotidiano. Tutte le applicazioni dell&apos;ecosistema sono sviluppate interamente a costo zero e messe a disposizione in modo totalmente gratuito, senza abbonamenti, pubblicità o barriere d&apos;accesso.
                  </p>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">Sicurezza e Riservatezza</h3>
                <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-4 sm:p-5 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#48484A] dark:text-[#C7C7CC] shrink-0" />
                    <h4 className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                      Privacy e Architettura 100% Locale
                    </h4>
                  </div>
                  <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                    Grande priorità è riservata alla <strong className="font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">tutela della privacy</strong>: l&apos;intero funzionamento avviene in locale direttamente sul tuo dispositivo (<em>client-side</em>). Appunti, documenti e file PDF vengono elaborati e salvati esclusivamente nella memoria del browser, senza mai transitare su server esterni né richiedere registrazioni, account o sistemi di tracciamento. I tuoi contenuti restano sempre e soltanto sotto il tuo controllo, anche completamente offline.
                  </p>
                </div>
              </section>

              <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10 overflow-hidden">
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8E8E93]">
                  <span>Architettura</span>
                  <span className="text-[#1C1C1E] dark:text-[#F5F5F7] font-medium text-right">
                    100% Client-Side · IndexedDB · JSZip · PDF.js · pdf-lib
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWhatsNew();
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 text-xs sm:text-[13px] font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-neutral-50 dark:hover:bg-[#323234] transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-[#48484A] dark:text-[#C7C7CC] shrink-0" />
                    <span>Vedi novità della versione ({APP_VERSION})</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenOnboarding();
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 text-xs sm:text-[13px] font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-neutral-50 dark:hover:bg-[#323234] transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <BookOpen className="w-3.5 h-3.5 text-[#48484A] dark:text-[#C7C7CC] shrink-0" />
                    <span>Rivedi guida introduttiva</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 border-t border-[#3C3C43]/12 dark:border-white/10 bg-[#FBFBFD] dark:bg-[#242428] flex flex-wrap items-center justify-between gap-2 shrink-0">
          {activeTab === 'shortcuts' ? (
            <button
              type="button"
              onClick={() => {
                onResetShortcuts();
                onClose();
              }}
              className="min-h-[36px] sm:min-h-[38px] px-3.5 sm:px-4 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ripristina predefinite</span>
            </button>
          ) : (
            <span className="text-[11px] sm:text-xs text-[#8E8E93]">Preferenze salvate localmente</span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] sm:min-h-[38px] px-5 rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap ml-auto"
          >
            Fatto
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
});
