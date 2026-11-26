import { Folder, HybridPage, NoteDocument, TextBlock } from '../types/qaderno';

const DB_NAME = 'qaderno_offline_db';
const DB_VERSION = 2;
const STORE_FOLDERS = 'folders';
const STORE_NOTES = 'notes';
const STORE_PDF_BLOBS = 'pdfBlobs';
const STORE_SYNC_HANDLES = 'syncHandles';

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PDF_BLOBS)) {
        db.createObjectStore(STORE_PDF_BLOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_HANDLES)) {
        db.createObjectStore(STORE_SYNC_HANDLES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txPromise<T>(tx: IDBTransaction, request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Ensures any hybrid NoteDocument has a valid `pages` array (migrating legacy single-page notes seamlessly).
 */
export function normalizeNotePages(note: NoteDocument): NoteDocument {
  if (note.documentType === 'pdf') return note;
  if (note.pages && note.pages.length > 0) {
    return {
      ...note,
      blocks: note.pages[0].blocks,
      strokes: note.pages[0].strokes,
    };
  }
  const initialPage: HybridPage = {
    id: `page_${note.id}_1`,
    blocks: note.blocks && note.blocks.length > 0 ? note.blocks : [{ id: `b_${note.id}_1`, type: 'paragraph', content: '' }],
    strokes: note.strokes || [],
  };
  return {
    ...note,
    pages: [initialPage],
  };
}

export async function getAllFolders(): Promise<Folder[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_FOLDERS, 'readonly');
  const store = tx.objectStore(STORE_FOLDERS);
  const items = await txPromise(tx, store.getAll() as IDBRequest<Folder[]>);
  return items.sort((a, b) => a.order - b.order);
}

export async function saveFolder(folder: Folder): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_FOLDERS, 'readwrite');
  tx.objectStore(STORE_FOLDERS).put(folder);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function deleteFolder(folderId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_FOLDERS, 'readwrite');
  tx.objectStore(STORE_FOLDERS).delete(folderId);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getAllNotes(): Promise<NoteDocument[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NOTES, 'readonly');
  const items = await txPromise(tx, tx.objectStore(STORE_NOTES).getAll() as IDBRequest<NoteDocument[]>);
  return items.map(normalizeNotePages).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveNote(note: NoteDocument): Promise<void> {
  const normalized = normalizeNotePages(note);
  const db = await openDB();
  const tx = db.transaction(STORE_NOTES, 'readwrite');
  tx.objectStore(STORE_NOTES).put(normalized);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await openDB();
  const noteTx = db.transaction(STORE_NOTES, 'readonly');
  const existing = await txPromise(
    noteTx,
    noteTx.objectStore(STORE_NOTES).get(noteId) as IDBRequest<NoteDocument | undefined>
  );

  const tx = db.transaction([STORE_NOTES, STORE_PDF_BLOBS], 'readwrite');
  tx.objectStore(STORE_NOTES).delete(noteId);
  if (existing?.pdfDataId) {
    tx.objectStore(STORE_PDF_BLOBS).delete(existing.pdfDataId);
  }
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function savePdfBlob(id: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_PDF_BLOBS, 'readwrite');
  tx.objectStore(STORE_PDF_BLOBS).put({ id, buffer });
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getPdfBlob(id: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_PDF_BLOBS, 'readonly');
  const record = await txPromise(
    tx,
    tx.objectStore(STORE_PDF_BLOBS).get(id) as IDBRequest<{ id: string; buffer: ArrayBuffer } | undefined>
  );
  return record?.buffer ?? null;
}

/**
 * Deletes every persisted record (IndexedDB stores, OPFS session file, localStorage, sessionStorage)
 * so the user restarts completely fresh as a brand-new user.
 */
export async function wipeAllSiteData(): Promise<void> {
  try {
    const db = await openDB();
    const storeNames = [STORE_FOLDERS, STORE_NOTES, STORE_PDF_BLOBS, STORE_SYNC_HANDLES].filter((name) =>
      db.objectStoreNames.contains(name)
    );
    if (storeNames.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeNames, 'readwrite');
        for (const name of storeNames) {
          tx.objectStore(name).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
  } catch {
    // Fallback: attempt full DB deletion
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('qaderno-sessione.json').catch(() => {});
    }
  } catch {
    // ignore OPFS absence
  }

  try {
    localStorage.clear();
  } catch {
    // ignore storage errors
  }

  try {
    sessionStorage.clear();
  } catch {
    // ignore storage errors
  }
}

/**
 * Seeds initial notebook folder & a clean blank quaderno on first launch.
 */
export async function initializeDefaultWorkspace(): Promise<{
  folders: Folder[];
  notes: NoteDocument[];
  isFreshWorkspace: boolean;
}> {
  let folders = await getAllFolders();
  let notes = await getAllNotes();
  let isFreshWorkspace = false;

  if (folders.length === 0 && notes.length === 0) {
    isFreshWorkspace = true;
    const now = Date.now();
    const defaultFolder: Folder = {
      id: 'folder_generale',
      name: 'Quaderni Generali',
      createdAt: now,
      order: 0,
    };

    const firstBlock: TextBlock = {
      id: `b_${now}_1`,
      type: 'paragraph',
      content: '',
    };

    const initialNote: NoteDocument = {
      id: `note_${now}`,
      folderId: defaultFolder.id,
      title: 'Nuovo quaderno',
      pinned: false,
      paperStyle: 'grid',
      documentType: 'hybrid',
      blocks: [firstBlock],
      strokes: [],
      pages: [
        {
          id: `page_${now}_1`,
          blocks: [firstBlock],
          strokes: [],
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    await saveFolder(defaultFolder);
    await saveNote(initialNote);
    folders = [defaultFolder];
    notes = [initialNote];
  }

  return { folders, notes, isFreshWorkspace };
}

/**
 * Full archive JSON export/import helpers (including Base64 PDF blobs).
 */
interface ArchivePayload {
  version: number;
  exportedAt: number;
  folders: Folder[];
  notes: NoteDocument[];
  pdfBlobs: Array<{ id: string; base64: string }>;
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

export async function exportFullArchiveJSON(): Promise<string> {
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

  const payload: ArchivePayload = {
    version: 2,
    exportedAt: Date.now(),
    folders,
    notes,
    pdfBlobs,
  };
  return JSON.stringify(payload, null, 2);
}

export async function importFullArchiveJSON(jsonText: string): Promise<{ folders: Folder[]; notes: NoteDocument[] }> {
  const parsed = JSON.parse(jsonText) as ArchivePayload;
  if (!parsed || !Array.isArray(parsed.folders) || !Array.isArray(parsed.notes)) {
    throw new Error('Formato archivio JSON non valido.');
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
  };
}

export function noteToMarkdown(note: NoteDocument): string {
  const lines: string[] = [`# ${note.title || 'Senza titolo'}`, ''];
  if (note.documentType === 'pdf') {
    lines.push(`*Documento PDF annotato: ${note.pdfFileName || 'Documento.pdf'}*`, '');
    for (const page of note.pdfPages || []) {
      if (page.textBoxes.length > 0) {
        lines.push(`## Pagina ${page.pageIndex + 1}`);
        for (const box of page.textBoxes) {
          if (box.content.trim()) lines.push(box.content);
        }
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  const pages = normalizeNotePages(note).pages || [];
  pages.forEach((page, idx) => {
    if (pages.length > 1) {
      lines.push(`---`, `### Pagina ${idx + 1}`, '');
    }
    for (const b of page.blocks) {
      if (b.type === 'h1') lines.push(`# ${b.content}`);
      else if (b.type === 'h2') lines.push(`## ${b.content}`);
      else if (b.type === 'bullet') lines.push(`- ${b.content}`);
      else if (b.type === 'todo') lines.push(`- [${b.checked ? 'x' : ' '}] ${b.content}`);
      else if (b.type === 'code') lines.push('```', b.content, '```');
      else lines.push(b.content);
    }
    lines.push('');
  });
  return lines.join('\n');
}
