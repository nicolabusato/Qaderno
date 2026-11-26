import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  Compass,
  Hand,
  History,
  Mail,
  Monitor,
  PenTool,
  Search,
  Smartphone,
  Sparkles,
  Table,
  Wrench,
  X,
} from 'lucide-react';
import {
  CHANGELOG_RELEASES,
  ChangelogIconName,
  ChangelogRelease,
  LATEST_CHANGELOG,
} from '../utils/changelog';
import { QadernoLogo } from './QadernoLogo';

interface WhatsNewModalProps {
  open: boolean;
  release?: ChangelogRelease;
  releases?: ChangelogRelease[];
  onClose: () => void;
}

const FEATURE_ICONS: Record<ChangelogIconName, React.ComponentType<{ className?: string }>> = {
  Monitor,
  Mail,
  Wrench,
  Search,
  Smartphone,
  History,
  Sparkles,
  BookOpen,
  Compass,
  Hand,
  Table,
  PenTool,
};

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  open,
  release = LATEST_CHANGELOG,
  releases = CHANGELOG_RELEASES,
  onClose,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<string>(release.version);

  useEffect(() => {
    if (open) {
      setSelectedVersion(release.version);
    }
  }, [open, release.version]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activeRelease =
    releases.find((r) => r.version === selectedVersion) || release || releases[0];
  const hasHistory = releases.length > 1;
  const isLatest = activeRelease.version === releases[0]?.version;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-3 sm:p-4 no-print"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        style={{ contain: 'layout paint', transform: 'translateZ(0)' }}
        className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl bg-[#F2F2F7]/98 dark:bg-[#1C1C1E]/98 border border-black/10 dark:border-white/12 shadow-2xl p-5 sm:p-6 space-y-5 no-ios-select"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 min-h-[34px] min-w-[34px] rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] transition-opacity hover:opacity-80"
          aria-label="Chiudi"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center pt-1 space-y-2.5">
          <QadernoLogo size={54} zoomedTail />
          <div className="space-y-1.5">
            <h2
              id="whats-new-title"
              className="text-xl font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7]"
            >
              {activeRelease.title}
            </h2>
            <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#787880]/12 dark:bg-white/10 text-[11px] font-medium text-[#48484A] dark:text-[#C7C7CC] tabular-nums">
              Versione {activeRelease.version}
              {isLatest ? ' · Attuale' : ' · Precedente'}
            </span>
          </div>

          {/* iOS-style Segmented Version Switcher for Current & Previous Releases */}
          {hasHistory && (
            <div
              role="tablist"
              aria-label="Cronologia versioni di Qaderno"
              className="w-full p-1 rounded-xl bg-[#787880]/12 dark:bg-white/8 flex items-center gap-1 overflow-x-auto no-scrollbar"
            >
              {releases.map((rel, idx) => {
                const selected = rel.version === activeRelease.version;
                return (
                  <button
                    key={rel.version}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setSelectedVersion(rel.version)}
                    className={`flex-1 min-w-[84px] h-8 px-3 rounded-lg text-xs font-medium transition-all tabular-nums whitespace-nowrap ${
                      selected
                        ? 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-[#F5F5F7] shadow-xs'
                        : 'text-[#636366] dark:text-[#AEAEB2] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]'
                    }`}
                  >
                    v{rel.version}
                    {idx === 0 ? ' (Nuova)' : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Feature list */}
        <div className="bg-white dark:bg-[#2C2C2E] rounded-2xl border border-[#3C3C43]/10 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10 overflow-hidden">
          {activeRelease.features.map((feature) => {
            const Icon = FEATURE_ICONS[feature.icon];
            return (
              <div key={feature.id} className="flex items-start gap-3.5 p-3.5 sm:p-4">
                <div className="w-9 h-9 rounded-xl bg-[#F2F2F7] dark:bg-[#3A3A3C] border border-[#3C3C43]/10 dark:border-white/10 flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <h3 className="text-sm font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] leading-snug">
                    {feature.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Primary Action */}
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] px-5 rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all"
        >
          Inizia a usare Qaderno
        </button>
      </motion.div>
    </motion.div>
  );
};
