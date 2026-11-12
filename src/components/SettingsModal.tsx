import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Download,
  FileJson,
  FolderCheck,
  FolderSync,
  Keyboard,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sun,
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
}

type SettingsTab = 'general' | 'shortcuts' | 'credits';

export const SettingsModal: React.FC<SettingsModalProps> = ({
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

  const categories: Array<'Modifica' | 'Visualizzazione' | 'Strumenti' | 'Colori'> = [
    'Modifica',
    'Visualizzazione',
    'Strumenti',
    'Colori',
  ];

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: 'general', label: 'Aspetto e Sincronia', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'shortcuts', label: 'Scorciatoie', icon: <Keyboard className="w-3.5 h-3.5" /> },
    { id: 'credits', label: 'Crediti', icon: <User className="w-3.5 h-3.5" /> },
  ];

  const syncSupported = isDirectorySyncSupported();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1C1E]/30 dark:bg-black/55 backdrop-blur-xs p-4 no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 440, damping: 32, mass: 0.8 }}
            className="w-full max-w-xl max-h-[86vh] bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-2xl border border-white/60 dark:border-white/10 shadow-lg flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
          >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[#3C3C43]/12 dark:border-white/10 bg-[#FBFBFD]/80 dark:bg-[#242428]/90 space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="settings-modal-title" className="text-base font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
              Impostazioni
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors"
              aria-label="Chiudi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center p-0.5 rounded-full bg-[#787880]/12 dark:bg-white/8">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 min-h-[32px] px-2.5 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    active
                      ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                      : 'text-[#48484A] dark:text-[#A1A1A6] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="settings-tab-pill"
                      transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                      className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#323236] shadow-xs"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {tab.icon}
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <AnimatePresence mode="wait">
          {activeTab === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-5"
            >
              {/* Theme */}
              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">Tema</h3>
                <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-1.5 grid grid-cols-3 gap-1">
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
                        className={`relative min-h-[38px] rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 ${
                          active
                            ? 'text-[#FBFBFD] dark:text-[#1C1C1E]'
                            : 'text-[#48484A] dark:text-[#A1A1A6] hover:bg-[#787880]/10'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-theme-pill"
                            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                            className="absolute inset-0 rounded-xl bg-[#1C1C1E] dark:bg-[#F5F5F7]"
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
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
                <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10">
                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7]">Sfondo predefinito</span>
                    <select
                      value={preferences.defaultPaperStyle}
                      onChange={(e) =>
                        onUpdatePreferences({
                          ...preferences,
                          defaultPaperStyle: e.target.value as PaperStyle,
                        })
                      }
                      className="h-8 px-3 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] focus:outline-none"
                    >
                      <option value="grid">Quadretti</option>
                      <option value="lined">Righe</option>
                      <option value="dotted">Puntini</option>
                      <option value="blank">Bianca</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7]">Grafia predefinita</span>
                    <select
                      value={preferences.defaultFontFamily}
                      onChange={(e) =>
                        onUpdatePreferences({
                          ...preferences,
                          defaultFontFamily: e.target.value as NoteFontFamily,
                        })
                      }
                      className="h-8 px-3 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] focus:outline-none"
                    >
                      {NOTE_FONTS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 gap-3">
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
                            className={`relative px-2.5 py-1 rounded-full text-[11px] font-medium ${
                              active
                                ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                                : 'text-[#8E8E93]'
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="settings-size-pill"
                                transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                                className="absolute inset-0 rounded-full bg-[#FBFBFD] dark:bg-[#323236] shadow-xs"
                              />
                            )}
                            <span className="relative z-10">{sz.label}</span>
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
                <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10">
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
                </div>
              </section>

              {/* Full Session JSON Auto-Save (enabled in Settings + after manual download) */}
              <section>
                <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">
                  Sessione Completa (.json)
                </h3>
                <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10">
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
              {syncSupported && (
                <section>
                  <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">
                    Sincronizzazione Cartella Locale (.qaderno)
                  </h3>
                  <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-4 space-y-3">
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
            </motion.div>
          )}

          {activeTab === 'shortcuts' && (
            <motion.div
              key="shortcuts"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-5"
            >
              <p className="text-xs text-[#8E8E93] px-1">
                Tocca una combinazione per riassegnarla · Salvate automaticamente in locale
              </p>
              {categories.map((cat) => {
                const defs = SHORTCUT_DEFINITIONS.filter((d) => d.category === cat);
                return (
                  <section key={cat}>
                    <h3 className="text-xs font-medium text-[#8E8E93] px-3 mb-2">{cat}</h3>
                    <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10 overflow-hidden">
                      {defs.map((def) => {
                        const isCapturing = capturingId === def.id;
                        const currentCombo = shortcuts[def.id] || def.defaultCombo;
                        return (
                          <div
                            key={def.id}
                            className="flex items-center justify-between px-4 py-2.5 min-h-[46px]"
                          >
                            <span className="text-sm text-[#1C1C1E] dark:text-[#F5F5F7]">{def.label}</span>
                            <button
                              type="button"
                              onClick={() => setCapturingId(isCapturing ? null : def.id)}
                              className={`min-h-[32px] px-3 rounded-full text-xs font-mono tabular-nums transition-colors whitespace-nowrap ${
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
            </motion.div>
          )}

          {activeTab === 'credits' && (
            <motion.div
              key="credits"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 p-6 flex flex-col items-center text-center space-y-3">
                <QadernoLogo size={68} zoomedTail />
                <div>
                  <h3 className="text-xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7]">
                    Qaderno
                  </h3>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    Creato da <span className="font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">Nicola Busato</span>
                  </p>
                </div>
                <p className="text-sm text-[#48484A] dark:text-[#C7C7CC] leading-relaxed max-w-md">
                  Qaderno nasce con l’obiettivo di unire la naturalezza di un quaderno a quadretti alla
                  precisione della scrittura digitale e all’annotazione diretta dei documenti PDF. Tutto
                  funziona interamente nel tuo browser, offline e senza server esterni: quaderni, schizzi,
                  tabelle e PDF restano sempre privati sul tuo dispositivo, esportabili in formato .qaderno
                  o PDF vettoriale in qualsiasi momento.
                </p>
              </div>

              <div className="bg-[#FBFBFD] dark:bg-[#242428] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 px-4 py-3 flex items-center justify-between text-xs text-[#8E8E93]">
                <span>Architettura</span>
                <span className="text-[#1C1C1E] dark:text-[#F5F5F7] font-medium">
                  100% Client-Side · IndexedDB · JSZip · PDF.js · pdf-lib
                </span>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#3C3C43]/12 dark:border-white/10 bg-[#FBFBFD]/80 dark:bg-[#242428]/90 flex items-center justify-between">
          {activeTab === 'shortcuts' ? (
            <button
              type="button"
              onClick={onResetShortcuts}
              className="min-h-[38px] px-4 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ripristina predefinite</span>
            </button>
          ) : (
            <span className="text-xs text-[#8E8E93]">Preferenze salvate localmente</span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-5 rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Fatto
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
