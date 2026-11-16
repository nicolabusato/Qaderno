import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
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
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [capturingId, setCapturingId] = useState<ShortcutActionId | null>(null);
  const jsonInputRef = React.useRef<HTMLInputElement>(null);

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
    if (!open) setCapturingId(null);
  }, [open]);

  if (!open) return null;

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
                    <select
                      value={preferences.defaultPaperStyle}
                      onChange={(e) =>
                        onUpdatePreferences({
                          ...preferences,
                          defaultPaperStyle: e.target.value as PaperStyle,
                        })
                      }
                      className="h-8 px-3 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] focus:outline-none max-w-[55%] shrink-0"
                    >
                      <option value="grid">Quadretti</option>
                      <option value="lined">Righe</option>
                      <option value="dotted">Puntini</option>
                      <option value="blank">Bianca</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between px-3.5 sm:px-4 py-3 gap-2">
                    <span className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7] min-w-0 truncate">
                      Grafia predefinita
                    </span>
                    <select
                      value={preferences.defaultFontFamily}
                      onChange={(e) =>
                        onUpdatePreferences({
                          ...preferences,
                          defaultFontFamily: e.target.value as NoteFontFamily,
                        })
                      }
                      className="h-8 px-3 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] focus:outline-none max-w-[55%] shrink-0"
                    >
                      {NOTE_FONTS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
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
                <QadernoLogo size={68} zoomedTail />
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
