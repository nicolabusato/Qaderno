# Qaderno

**Quaderno digitale client-side per appunti ibridi (tastiera + stilo/touch) e annotazione PDF vettoriale.**

Qaderno unisce un editor di testo a blocchi con un livello di disegno vettoriale ad alta precisione e un editor PDF multipagina. L'interfaccia, interamente in italiano, è ispirata alle *Human Interface Guidelines* di iOS e iPadOS e funziona completamente offline nel browser, senza server né API esterne.

---

## Funzionalità principali

### Editor ibrido e ancoraggio dinamico
* **Scrittura rapida Markdown:** formattazione istantanea digitando `# ` (Titolo 1), `## ` (Titolo 2), `- ` (elenco puntato), `- [] ` (checklist interattiva) o ```` ``` ```` (blocco codice).
* **Tipografia flessibile:** scelta della grafia (*Sans-Serif*, *Serif*, *Monospazio*, *Calligrafico*) applicabile all'intero documento, a una singola riga o a una selezione di testo.
* **Tratti ancorati al testo:** ogni disegno o evidenziazione si ancora dinamicamente al paragrafo più vicino (`anchorBlockId` + offset verticale), seguendo automaticamente lo scorrimento del testo quando aggiungi o rimuovi righe sopra.
* **Sfondo personalizzabile:** fogli commutabili tra **Quadretti** (predefinito), **Righe**, **Puntini** e **Carta bianca**.

### Inchiostro vettoriale e geometria locale (*Hold-to-Snap*)
* **Tratto naturale:** rendering su canvas HiDPI con spline Catmull-Rom sensibili a pressione e velocità.
* **Riconoscimento forme 100% locale:** mantenendo fermo il puntatore per `450 ms` a fine tratto, linee, frecce, cerchi, ellissi, rettangoli, quadrati e triangoli vengono perfezionati automaticamente in meno di `5 ms` senza dipendenze esterne, con ridimensionamento in tempo reale prima del rilascio.
* **Strumenti completi:** barra flottante trascinabile stile Apple Note con **Manina** per lo spostamento, **Testo**, **Penna**, **Evidenziatore**, **Gomma** (modalità *A tratto* e *Precisione*), **Lazo** con menu contestuale (*Taglia, Copia, Incolla, Duplica, Migliora grafia, Cambio colore*) e **Inserimento forme**.

### Modifica ed esportazione PDF
* **Rendering ed editing in-place:** visualizzazione multipagina tramite `pdfjs-dist` con possibilità di modificare direttamente il testo esistente rilevando font, peso, stile e colore originali.
* **Calendario interattivo per le date:** selezionando una data nel PDF si apre un calendario stile iOS che aggiorna il giorno mantenendo automaticamente formato, separatore e maiuscole/minuscole originali.
* **Esportazione vettoriale:** salvataggio in PDF puro tramite `pdf-lib` sia per i PDF annotati sia per i quaderni ibridi (inclusi sfondo a quadretti/righe/puntini e tratti vettoriali).

### Archiviazione offline, formato `.qaderno` e PWA
* **Persistenza locale:** salvataggio automatico in `IndexedDB` con organizzazione in **Taccuini** (cartelle), note fissate e ricerca istantanea.
* **Formato portatile `.qaderno`:** esportazione e importazione di singoli quaderni (inclusi tratti vettoriali ed eventuali PDF allegati) in archivi ZIP autonomi, oltre al backup completo in `.json` e all'esportazione in Markdown (`.md`).
* **Installabile come app nativa (PWA):** supporto standalone per iPadOS, iOS, Desktop e Android (inclusa icona monocromatica adattiva *Material You*).

---

## Stack tecnologico

* **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4
* **Animazioni e Icone:** Motion (Framer Motion), Lucide React
* **Motore PDF e Archivi:** `pdfjs-dist`, `pdf-lib`, `@pdf-lib/fontkit`, `opentype.js`, `jszip`

---

## Avvio in locale

1. Clona il repository e spostati nella cartella del progetto:
   ```bash
   git clone <url-del-repository>
   cd qaderno
