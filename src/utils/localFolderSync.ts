import { Folder, NoteDocument } from '../types/qaderno';
import { exportQadernoArchive } from './qadernoArchive';
import { openDB } from './storage';

const STORE_SYNC_HANDLES = 'syncHandles';
const HANDLE_KEY = 'local_directory';

interface DirectoryHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface ExtendedFileSystemDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (desc?: DirectoryHandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (desc?: DirectoryHandlePermissionDescriptor) => Promise<PermissionState>;
}

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

export function isDirectorySyncSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithDirectoryPicker).showDirectoryPicker === 'function';
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SYNC_HANDLES, 'readwrite');
  tx.objectStore(STORE_SYNC_HANDLES).put({ id: HANDLE_KEY, handle });
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SYNC_HANDLES, 'readonly');
    const req = tx.objectStore(STORE_SYNC_HANDLES).get(HANDLE_KEY) as IDBRequest<
      { id: string; handle: FileSystemDirectoryHandle } | undefined
    >;
    return await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.handle ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearSavedDirectoryHandle(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SYNC_HANDLES, 'readwrite');
  tx.objectStore(STORE_SYNC_HANDLES).delete(HANDLE_KEY);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function pickAndConnectDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker({ mode: 'readwrite' });
  await saveDirectoryHandle(handle);
  return handle;
}

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  interactive: boolean
): Promise<boolean> {
  const ext = handle as ExtendedFileSystemDirectoryHandle;
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

export async function writeNoteToDirectory(
  handle: FileSystemDirectoryHandle,
  note: NoteDocument,
  folders: Folder[],
  interactive = false
): Promise<boolean> {
  try {
    const allowed = await ensureDirectoryPermission(handle, interactive);
    if (!allowed) return false;
    const { blob, filename } = await exportQadernoArchive(note, folders);
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export async function syncAllNotesToDirectory(
  handle: FileSystemDirectoryHandle,
  notes: NoteDocument[],
  folders: Folder[]
): Promise<number> {
  const allowed = await ensureDirectoryPermission(handle, true);
  if (!allowed) return 0;
  let count = 0;
  for (const n of notes) {
    const ok = await writeNoteToDirectory(handle, n, folders, false);
    if (ok) count++;
  }
  return count;
}
