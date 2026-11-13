import { Folder, HybridPage, NoteDocument, ShortcutActionId, Stroke, TextBlock } from '../types/qaderno';
import { buildPointsFromShapeMeta } from './shapeRecognizer';
import { formatComboDisplay, loadShortcuts, SHORTCUT_DEFINITIONS } from './shortcuts';

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

function buildWelcomeShortcutsBlockText(): string {
  const shortcuts = loadShortcuts();
  const combo = (id: ShortcutActionId): string => {
    const def = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
    return formatComboDisplay(shortcuts[id] || def?.defaultCombo || '');
  };

  const toolsLine = `Strumenti:  ${combo('toolPan')} Manina · ${combo('toolText')} Testo · ${combo('toolPen')} Penna · ${combo('toolHighlighter')} Evidenziatore · ${combo('toolEraser')} Gomma · ${combo('toolLasso')} Lazo · ${combo('toggleSnap')} Snap`;
  const viewLine = `Vista:      ${combo('zoomIn')} / ${combo('zoomOut')} / ${combo('zoomReset')} Zoom`;
  const editLine = `Modifica:   ${combo('undo')} Annulla · ${combo('redo')} Ripristina`;
  return `${toolsLine}\n${viewLine}\n${editLine}`;
}

function buildModernWelcomeNote(options: {
  id?: string;
  folderId: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}): NoteDocument {
  const welcomeShapeCircle: Stroke = {
    id: 'stroke_welcome_circle',
    tool: 'pen',
    color: '#2B4162',
    width: 2.8,
    anchorBlockId: 'b_spacer_1',
    anchorDy: 32,
    shapeMeta: { kind: 'circle', cx: 150, cy: 64, rx: 32, ry: 32 },
    points: buildPointsFromShapeMeta({ kind: 'circle', cx: 150, cy: 64, rx: 32, ry: 32 }),
  };

  const welcomeShapeArrow: Stroke = {
    id: 'stroke_welcome_arrow',
    tool: 'pen',
    color: '#9A463D',
    width: 2.6,
    anchorBlockId: 'b_spacer_1',
    anchorDy: 32,
    shapeMeta: { kind: 'arrow', x1: 204, y1: 64, x2: 332, y2: 64 },
    points: buildPointsFromShapeMeta({ kind: 'arrow', x1: 204, y1: 64, x2: 332, y2: 64 }),
  };

  const welcomeShapeRect: Stroke = {
    id: 'stroke_welcome_rect',
    tool: 'pen',
    color: '#3D5A45',
    width: 2.8,
    anchorBlockId: 'b_spacer_1',
    anchorDy: 32,
    shapeMeta: { kind: 'rectangle', cx: 410, cy: 64, rx: 48, ry: 30 },
    points: buildPointsFromShapeMeta({ kind: 'rectangle', cx: 410, cy: 64, rx: 48, ry: 30 }),
  };

  const blocks: TextBlock[] = [
    {
      id: 'b_intro',
      type: 'paragraph',
      content:
        'Scrivi con la tastiera, annota PDF e disegna a mano libera sullo stesso foglio a quadretti: ogni tratto resta ancorato al paragrafo più vicino anche quando aggiungi righe sopra.',
    },
    { id: 'b_spacer_intro', type: 'paragraph', content: '' },
    {
      id: 'b_h2_checklist',
      type: 'h2',
      content: 'Per iniziare rapidamente',
    },
    {
      id: 'b_todo_1',
      type: 'todo',
      checked: true,
      content: 'Digita # , ## , - , - [] , **grassetto** o ``` per formattare al volo mentre scrivi',
    },
    {
      id: 'b_todo_2',
      type: 'todo',
      checked: false,
      content: 'Tieni premuto su un testo formattato per annullarne lo stile o i simboli',
    },
    {
      id: 'b_todo_3',
      type: 'todo',
      checked: false,
      content: 'Usa Manina per spostarti sul foglio e Testo per scrivere o modificare i PDF',
    },
    {
      id: 'b_todo_4',
      type: 'todo',
      checked: false,
      content: 'Seleziona una parola o riga per cambiare font e colore dalla barra superiore',
    },
    { id: 'b_spacer_mid', type: 'paragraph', content: '' },
    {
      id: 'b_shape_caption',
      type: 'h2',
      content: 'Geometria locale e Hold-to-Snap',
    },
    {
      id: 'b_shape_hint',
      type: 'paragraph',
      content:
        'Disegna una forma libera e mantieni fermo il tratto un istante per perfezionarla automaticamente:',
    },
    { id: 'b_spacer_1', type: 'paragraph', content: '' },
    { id: 'b_spacer_2', type: 'paragraph', content: '' },
    { id: 'b_spacer_3', type: 'paragraph', content: '' },
    { id: 'b_spacer_4', type: 'paragraph', content: '' },
    {
      id: 'b_h2_shortcuts',
      type: 'h2',
      content: 'Scorciatoie da tastiera (personalizzabili in Impostazioni)',
    },
    {
      id: 'b_code_shortcuts',
      type: 'code',
      fontFamily: 'mono',
      content: buildWelcomeShortcutsBlockText(),
    },
  ];
  const strokes = [welcomeShapeCircle, welcomeShapeArrow, welcomeShapeRect];

  return {
    id: options.id || 'note_benvenuto',
    folderId: options.folderId,
    title: 'Benvenuto in Qaderno',
    pinned: options.pinned ?? true,
    paperStyle: 'grid',
    documentType: 'hybrid',
    blocks,
    strokes,
    pages: [
      {
        id: 'page_benvenuto_1',
        blocks,
        strokes,
      },
    ],
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
  };
}

function isUnmodifiedLegacyWelcomeNote(note: NoteDocument): boolean {
  if (note.id !== 'note_benvenuto' || note.documentType !== 'hybrid') return false;
  if (note.title !== 'Benvenuto in Qaderno') return false;
  const pages = normalizeNotePages(note).pages || [];
  if (pages.length !== 1) return false;
  const p = pages[0];
  if (p.strokes.length !== 3 || !p.strokes.every((s) => s.id.startsWith('stroke_welcome_'))) {
    return false;
  }
  const legacyShortcutBlock = p.blocks.find((b) => b.id === 'b_code_shortcuts');
  const legacyIntroBlock = p.blocks.find((b) => b.id === 'b_intro');
  return Boolean(
    legacyShortcutBlock?.content.includes('T Cursore') &&
      legacyIntroBlock?.content.startsWith('Scrivi con la tastiera e disegna a mano libera sullo stesso foglio') &&
      p.blocks.length === 11
  );
}

/**
 * Seeds initial notebook folder & welcome quaderno on first launch,
 * and upgrades unmodified legacy `note_benvenuto` notes to the modern layout.
 */
export async function initializeDefaultWorkspace(): Promise<{
  folders: Folder[];
  notes: NoteDocument[];
}> {
  let folders = await getAllFolders();
  let notes = await getAllNotes();

  if (folders.length === 0 && notes.length === 0) {
    const now = Date.now();
    const defaultFolder: Folder = {
      id: 'folder_generale',
      name: 'Quaderni Generali',
      createdAt: now,
      order: 0,
    };

    const welcomeNote = buildModernWelcomeNote({
      folderId: defaultFolder.id,
      createdAt: now,
      updatedAt: now,
    });

    await saveFolder(defaultFolder);
    await saveNote(welcomeNote);
    folders = [defaultFolder];
    notes = [welcomeNote];
  } else {
    const legacyWelcome = notes.find(isUnmodifiedLegacyWelcomeNote);
    if (legacyWelcome) {
      const upgraded = buildModernWelcomeNote({
        id: legacyWelcome.id,
        folderId: legacyWelcome.folderId,
        pinned: legacyWelcome.pinned,
        createdAt: legacyWelcome.createdAt,
        updatedAt: legacyWelcome.updatedAt,
      });
      await saveNote(upgraded);
      notes = notes.map((n) => (n.id === legacyWelcome.id ? upgraded : n));
    }
  }

  return { folders, notes };
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
