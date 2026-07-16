# Lattice

Workspace locale-first per documenti, board, fogli, codice e presentazioni, con
collaborazione realtime. **Vite + React 19 + TypeScript**, deploy su Vercel.
Non è Next.js: non esiste un router: la "navigazione" è lo stato `viewMode`
(`doc` | `split` | `board` | `sheet` | `presentation` | `code`) in
`src/store/useStore.ts`.

Mappa architetturale dettagliata: [docs/architecture/GRAPHIFY_PROJECT_MAP.md](docs/architecture/GRAPHIFY_PROJECT_MAP.md).

## Comandi

```bash
npm run dev         # Vite dev server
npm run build       # tsc --noEmit && vite build
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run graph:build # rigenera il knowledge graph Graphify (dev-only)
```

Non esiste ESLint in questo progetto: `typecheck` è il gate di qualità statica.

## Graphify code intelligence

Lattice usa **Graphify** come knowledge graph locale del repository, per
restringere il perimetro di lettura prima di lavorare su più sottosistemi.

L'estrazione è **interamente locale** (tree-sitter AST): nessuna API key,
nessun codice inviato a servizi esterni. Il grafo vive in `graphify-out/`, che
è git-ignored e va rigenerato localmente.

Su questa macchina la cartella `Scripts/` di Python non è nel PATH: **usare
sempre `python -m graphify ...`**, non il comando `graphify` nudo (che dà
`command not found`).

### Prima di modifiche trasversali

Per task che coinvolgono più cartelle o sottosistemi, interroga prima il grafo:

```bash
python -m graphify query "Come è strutturato il sistema di collaborazione realtime?"
python -m graphify query "Dove vengono inizializzati Liveblocks e Yjs?"
python -m graphify explain "CollaborationProvider.ts"   # vicini + archi entranti/uscenti
python -m graphify path "BoardCanvas.tsx" "YjsManager.ts"  # come sono collegati due nodi
python -m graphify affected "CollaborationProvider.ts"     # impact analysis inversa
```

`explain` e `affected` sono i più precisi; `query` fa una BFS ed è più rumoroso
(usa `--budget N` per limitarlo).

### Prima di leggere molti file

Se stai per eseguire più di tre ricerche globali, aprire molti file per
ricostruire un flusso, o inseguire import a mano, usa prima Graphify per
individuare i file rilevanti.

### Prima di scrivere codice

Il grafo **non** sostituisce la verifica diretta e non è più autorevole del
codice. Ordine corretto:

1. individua i file rilevanti con Graphify;
2. apri i sorgenti effettivi;
3. verifica tipi, API e implementazione attuale;
4. solo dopo, modifica.

### Relazioni

- `EXTRACTED` — presenti esplicitamente nel codice (99% degli archi qui).
- `INFERRED` — ipotesi utili, da verificare nel codice prima di intervenire.
  In questo repo sono solo gli archi `indirect_call`.

### Aggiornare il grafo

```bash
npm run graph:build   # = python -m graphify update .
```

Un solo comando: incrementale grazie alla cache SHA256 (rigenera solo i file
cambiati), funziona anche da zero su un clone pulito, e riscrive `graph.json`,
`GRAPH_REPORT.md` e `graph.html`.

Non rigenerare dopo ogni modifica minima. Rigenera dopo cambi architetturali,
spostamenti di file, nuovi provider, feature trasversali o refactoring
importanti. `GRAPH_REPORT.md` riporta il commit di build: confrontalo con
`git rev-parse HEAD` per capire se il grafo è stale.

Non usare `python -m graphify extract .` senza `--code-only`: senza API key
LLM esce con errore. `update` è il path corretto e non richiede chiavi.

### Limiti noti

- I file markdown (`docs/`, `README.md`) sono indicizzati **solo
  strutturalmente**, un nodo per heading. L'estrazione *semantica* della prosa
  richiederebbe una API key LLM e invierebbe i contenuti a un servizio esterno:
  deliberatamente non abilitata.
- Le community non hanno nomi semantici (il naming richiede un backend LLM):
  sono etichettate col nodo hub.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `python -m graphify query "<question>"` when graphify-out/graph.json exists. Use `python -m graphify path "<A>" "<B>"` for relationships and `python -m graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `python -m graphify update .` to keep the graph current (AST-only, no API cost).

<!-- Sezione di proprietà della skill Graphify (marker: "## graphify").
     `python -m graphify claude install` la rigenera, sovrascrivendo i comandi
     con la forma `graphify` nuda: se succede, riportarli a `python -m graphify`
     (vedi "Graphify code intelligence" sopra). Le altre sezioni non vengono toccate. -->
