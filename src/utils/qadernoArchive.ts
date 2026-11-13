import JSZip from 'jszip';
import { Folder, NoteDocument } from '../types/qaderno';
import { getPdfBlob, normalizeNotePages } from './storage';

export interface QadernoManifest {
  format: 'qaderno';
  formatVersion: number;
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  folderId: string;
  folderName?: string;
  documentType: 'hybrid' | 'pdf';
  pdfAssetPath?: string;
}

export interface ParsedQadernoArchive {
  manifest: QadernoManifest;
  note: NoteDocument;
  pdfBuffer: ArrayBuffer | null;
}

export function sanitizeFilename(title: string): string {
  const clean = (title || 'Quaderno').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return clean || 'Quaderno';
}

/**
 * Generates a full .qaderno ZIP archive containing manifest.json, content.json, and assets/.
 */
export async function exportQadernoArchive(
  rawNote: NoteDocument,
  folders: Folder[]
): Promise<{ blob: Blob; filename: string }> {
  const note = normalizeNotePages(rawNote);
  const zip = new JSZip();

  let pdfAssetPath: string | undefined;
  if (note.documentType === 'pdf' && note.pdfDataId) {
    const pdfBuf = await getPdfBlob(note.pdfDataId);
    if (pdfBuf) {
      const assetName = sanitizeFilename(note.pdfFileName || 'documento.pdf');
      pdfAssetPath = `assets/${assetName.toLowerCase().endsWith('.pdf') ? assetName : `${assetName}.pdf`}`;
      zip.file(pdfAssetPath, pdfBuf);
    }
  }

  const folderName = folders.find((f) => f.id === note.folderId)?.name;

  const manifest: QadernoManifest = {
    format: 'qaderno',
    formatVersion: 1,
    id: note.id,
    title: note.title || 'Quaderno senza titolo',
    updatedAt: note.updatedAt,
    createdAt: note.createdAt,
    folderId: note.folderId,
    folderName,
    documentType: note.documentType,
    pdfAssetPath,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(
    'content.json',
    JSON.stringify(
      {
        version: 1,
        note,
      },
      null,
      2
    )
  );

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/octet-stream',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const filename = `${sanitizeFilename(note.title)}.qaderno`;
  return { blob, filename };
}

/**
 * Parses a .qaderno file back into a fully editable NoteDocument + optional PDF ArrayBuffer.
 */
export async function parseQadernoArchive(file: File | ArrayBuffer): Promise<ParsedQadernoArchive> {
  const data = file instanceof File ? await file.arrayBuffer() : file;
  const zip = await JSZip.loadAsync(data);

  const manifestEntry = zip.file('manifest.json');
  const contentEntry = zip.file('content.json');

  if (!manifestEntry || !contentEntry) {
    throw new Error('File .qaderno non valido o incompleto.');
  }

  const manifest = JSON.parse(await manifestEntry.async('string')) as QadernoManifest;
  if (manifest.format !== 'qaderno') {
    throw new Error('Formato manifest non riconosciuto.');
  }

  const contentRaw = JSON.parse(await contentEntry.async('string')) as { note?: NoteDocument };
  if (!contentRaw?.note) {
    throw new Error('Contenuto del quaderno mancante.');
  }

  let pdfBuffer: ArrayBuffer | null = null;
  if (manifest.pdfAssetPath) {
    const asset = zip.file(manifest.pdfAssetPath);
    if (asset) {
      pdfBuffer = await asset.async('arraybuffer');
    }
  }
  if (!pdfBuffer) {
    const anyPdf = zip.file(/^assets\/.*\.pdf$/i)[0];
    if (anyPdf) {
      pdfBuffer = await anyPdf.async('arraybuffer');
    }
  }

  const note = normalizeNotePages(contentRaw.note);
  return { manifest, note, pdfBuffer };
}
