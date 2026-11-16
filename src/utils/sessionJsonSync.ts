import {
  AppPreferences,
  DockPosition,
  Folder,
  NoteDocument,
  ShortcutMap,
  ToolType,
} from '../types/qaderno';
import {
  getAllFolders,
  getAllNotes,
  getPdfBlob,
  normalizeNotePages,
  openDB,
  saveFolder,
  saveNote,
  savePdfBlob,
} from './storage';

const STORE_SYNC_HANDLES = 'syncHandles';
const SESSION_HANDLE_KEY = 'local_session_json_file';
const OPFS_SESSION_FILENAME = 'qaderno-sessione.json';
const SESSION_META_KEY = 'qaderno_session_json_meta_v1';

export interface SessionUIState {
  activeFolderId: string | 'all';
  activeNoteId: string | null;
  preferences: AppPreferences;
  shortcuts: ShortcutMap;
  dockPosition: DockPosition;
  zoom: number;
  activeTool: ToolType;
}

export interface FullSessionArchive {
  version: 3;
  exportedAt: number;
  folders: Folder[];
  notes: NoteDocument[];
  pdfBlobs: Array<{ id: string; base64: string }>;
  sessionState?: SessionUIState;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface ExtendedFileSystemFileHandle extends FileSystemFileHandle {
  queryPermission?: (desc?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (desc?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
}

interface WindowWithSaveFilePicker extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandle>;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function isSaveFilePickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as WindowWithSaveFilePicker).showSaveFilePicker === 'function'
  );
}

export function getLastSessionJsonSavedAt(): number | null {
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number };
    return typeof parsed.savedAt === 'number' ? parsed.savedAt : null;
  } catch {
    return null;
  }
}

function recordSessionSavedAt(ts: number): void {
  try {
    localStorage.setItem(SESSION_META_KEY, JSON.stringify({ savedAt: ts }));
  } catch {
    // ignore storage errors
  }
}

export async function saveSessionFileHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SYNC_HANDLES, 'readwrite');
  tx.objectStore(STORE_SYNC_HANDLES).put({ id: SESSION_HANDLE_KEY, handle });
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getSavedSessionFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SYNC_HANDLES, 'readonly');
    const req = tx.objectStore(STORE_SYNC_HANDLES).get(SESSION_HANDLE_KEY) as IDBRequest<
      { id: string; handle: FileSystemFileHandle } | undefined
    >;
    return await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.handle ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearSavedSessionFileHandle(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SYNC_HANDLES, 'readwrite');
  tx.objectStore(STORE_SYNC_HANDLES).delete(SESSION_HANDLE_KEY);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function ensureFileHandlePermission(
  handle: FileSystemFileHandle,
  interactive: boolean
): Promise<boolean> {
  const ext = handle as ExtendedFileSystemFileHandle;
  if (ext.queryPermission) {
    const status = await ext.queryPermission({ mode: 'readwrite' });
    if (status === 'granted') return true;
  }
  if (interactive && ext.requestPermission) {
    const next = await ext.requestPermission({ mode: 'readwrite' });
    return next === 'granted';
  }
  return false;
}

export async function writeJsonToFileHandle(
  handle: FileSystemFileHandle,
  jsonText: string,
  interactive = false
): Promise<boolean> {
  try {
    const ok = await ensureFileHandlePermission(handle, interactive);
    if (!ok) return false;
    const writable = await handle.createWritable();
    await writable.write(jsonText);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function writeSessionJsonToOpfs(jsonText: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return false;
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(OPFS_SESSION_FILENAME, { create: true });
    const writable = await fh.createWritable();
    await writable.write(jsonText);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export async function buildFullSessionJSON(sessionState?: SessionUIState): Promise<string> {
  const folders = await getAllFolders();
  const notes = await getAllNotes();
  const pdfBlobs: Array<{ id: string; base64: string }> = [];

  for (const n of notes) {
    if (n.pdfDataId) {
      const buf = await getPdfBlob(n.pdfDataId);
      if (buf) {
        pdfBlobs.push({ id: n.pdfDataId, base64: arrayBufferToBase64(buf) });
      }
    }
  }

  const payload: FullSessionArchive = {
    version: 3,
    exportedAt: Date.now(),
    folders,
    notes,
    pdfBlobs,
    sessionState,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Triggers a manual session JSON save:
 * - Tries File System Access `showSaveFilePicker` first so future auto-saves can update that exact file on disk.
 * - Falls back cleanly to standard browser download when `showSaveFilePicker` is unavailable or blocked in an iframe.
 * - Always mirrors the latest JSON in local OPFS so all browsers retain an auto-updatable local JSON file.
 */
export async function downloadAndLinkSessionJSON(
  sessionState: SessionUIState,
  fallbackDownload: (blob: Blob, filename: string) => void
): Promise<{
  cancelled: boolean;
  fileHandle: FileSystemFileHandle | null;
  savedAt: number;
  usedPicker: boolean;
}> {
  const jsonText = await buildFullSessionJSON(sessionState);
  const now = Date.now();
  const suggestedName = `qaderno-sessione-${new Date(now).toISOString().slice(0, 10)}.json`;

  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: [
          {
            description: 'File Sessione Qaderno (.json)',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const written = await writeJsonToFileHandle(handle, jsonText, true);
      if (written) {
        await saveSessionFileHandle(handle);
        await writeSessionJsonToOpfs(jsonText);
        recordSessionSavedAt(now);
        return { cancelled: false, fileHandle: handle, savedAt: now, usedPicker: true };
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { cancelled: true, fileHandle: null, savedAt: now, usedPicker: false };
      }
      // SecurityError in iframe or unsupported context -> fall back seamlessly to standard download
    }
  }

  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  fallbackDownload(blob, suggestedName);
  await writeSessionJsonToOpfs(jsonText);
  recordSessionSavedAt(now);
  return { cancelled: false, fileHandle: null, savedAt: now, usedPicker: false };
}

/**
 * Silently persists the full session JSON locally:
 * - Writes to the linked FileSystemFileHandle on disk if available and permitted.
 * - Writes `qaderno-sessione.json` into browser Origin Private File System (OPFS).
 */
export async function autoPersistSessionJSON(
  sessionState: SessionUIState,
  fileHandle: FileSystemFileHandle | null
): Promise<{ savedAt: number; wroteDiskFile: boolean; wroteOpfs: boolean }> {
  const jsonText = await buildFullSessionJSON(sessionState);
  const now = Date.now();
  let wroteDiskFile = false;
  if (fileHandle) {
    wroteDiskFile = await writeJsonToFileHandle(fileHandle, jsonText, false);
  }
  const wroteOpfs = await writeSessionJsonToOpfs(jsonText);
  recordSessionSavedAt(now);
  return { savedAt: now, wroteDiskFile, wroteOpfs };
}

export async function importSessionJSON(jsonText: string): Promise<{
  folders: Folder[];
  notes: NoteDocument[];
  sessionState?: SessionUIState;
}> {
  const parsed = JSON.parse(jsonText) as Partial<FullSessionArchive>;
  if (!parsed || !Array.isArray(parsed.folders) || !Array.isArray(parsed.notes)) {
    throw new Error('Formato file sessione JSON non valido.');
  }

  for (const blob of parsed.pdfBlobs || []) {
    if (blob.id && blob.base64) {
      await savePdfBlob(blob.id, base64ToArrayBuffer(blob.base64));
    }
  }
  for (const folder of parsed.folders) {
    await saveFolder(folder);
  }
  for (const note of parsed.notes) {
    await saveNote(normalizeNotePages(note));
  }

  return {
    folders: await getAllFolders(),
    notes: await getAllNotes(),
    sessionState: parsed.sessionState,
  };
}
