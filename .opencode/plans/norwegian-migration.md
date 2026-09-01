# HiveLink → Norwegian: Implementation Plan (v2)

## Context

The English compound word dictionary has ~14% problematic entries due to English morphology. Norwegian compounds are orthographically clearer and we have **Norsk Ordbank** — authoritative lexical data with explicit compound decomposition, fuge info, and CC-BY 4.0 license.

**Core principle:** Norsk Ordbank decomposition is authoritative. Runtime guessing is fallback only.

## Data Sources (MVP)

| Source | Purpose | License |
|--------|---------|---------|
| Norsk Ordbank Bokmål 2005 (`leddanalyse.txt`) | Compound decomposition | CC-BY 4.0 |
| Norsk Ordbank (`fullformsliste.txt`) | Word validation | CC-BY 4.0 |
| FrequencyWords (`no_50k.txt`) | Frequency ranking only | CC BY-SA 4.0 |

NST lexicon deferred to Phase 5.

## Data Schema

```ts
interface CompoundWord {
  word: string
  parts: string[]     // [forledd, etterledd] — always 2 for MVP
  fuge: string        // "" | "s" | "e" | "es" | "a" | "en" | ...
  frequency: number   // log1p(corpusCount), 0 if absent
}
```

## Script Architecture

```
scripts/
  download-norwegian-data.ts    → data/raw/{leddanalyse,fullformsliste,no_50k}.txt
  build-norwegian-compounds.ts  → data/compound-words.json
  build-norwegian-dictionary.ts → data/norwegian-words.json
  find-example-puzzles.ts       → finds real graph paths for fallback/example
```

## Validation Tiers

```
compoundParts  — actual FORLEDD/ETTERLEDD from leddanalyse (highest trust)
commonWords    — FrequencyWords top 50K (for difficulty ranking)
validWords     — fullformsliste (broad validation, includes rare inflections)
```

Scoring preference: `compoundPart + frequent > compoundPart > arbitrary valid inflection`

---

## Phase 1: Data Pipeline

### 1.1 `scripts/download-norwegian-data.ts`

Download to `data/raw/`:
- `leddanalyse.txt` from `https://github.com/tobiasvl/norsk-ordbank/raw/main/nob/leddanalyse.txt`
- `fullformsliste.txt` from same repo
- `no_50k.txt` from `https://github.com/hermitdave/FrequencyWords/raw/master/content/2018/no/no_50k.txt`

Cache locally. Skip download if files exist.

### 1.2 `scripts/build-norwegian-compounds.ts`

Parse `leddanalyse.txt`:
- Filter to 2-part analyses (FORLEDD + ETTERLEDD)
- Skip hyphenated compounds
- Skip proper nouns via grammatical metadata (FORLEDD_GRAM / ETTERLEDD_GRAM), not capitalization
- Extract fuge from column 7
- Score by frequency: `Math.log1p(corpusCount)`, 0 if absent
- Deduplicate (same word → keep highest-frequency analysis)
- Output `data/compound-words.json`

**Fuge statistics report** (printed during import):
```
Fuge distribution:
  "":   ...
  "s":  ...
  "e":  ...
  "es": ...
  ...
```

### 1.3 `scripts/build-norwegian-dictionary.ts`

Build three tiers from Ordbank data:
- `compoundParts`: all unique FORLEDD and ETTERLEDD values from leddanalyse
- `commonWords`: FrequencyWords no_50k.txt word set
- `validWords`: all forms from fullformsliste

Output `data/norwegian-words.json`:
```ts
{
  compoundParts: string[]
  commonWords: string[]
  validWords: string[]
}
```

### 1.4 `scripts/find-example-puzzles.ts`

After compounds are built, search the graph for:
- 3-step path (easy example)
- 4-step path (medium example)
- 5-step path (hard example)
- Using high-frequency nodes only

Output to `data/example-puzzles.json`. These become:
- HowToPlay example chain
- Fallback puzzle

### 1.5 Dataset quality report

Print during import:
```
Rows parsed:                184,392
Two-part analyses:           38,412
Skipped proper nouns:         2,183
Skipped hyphenated:           1,481
Skipped malformed:               12
Unique compounds:            31,827
With frequency match:        14,921
Without frequency match:     16,906

Fuge:
  "":   ...
  "s":  ...
  "e":  ...

Graph:
  Nodes:             ...
  Connected components: ...
  Largest component: ...
```

---

## Phase 2: Linguistic Core

### 2.1 Rewrite `lib/word-splitting.ts`

**Delete** English-specific code entirely:
- `KNOWN_SUFFIXES` (able/ible/less)
- `DOUBLABLE_CONSONANTS` logic
- `MIN_COMMON_TRUST_LENGTH`, suffix scoring rules

**New architecture:**
```ts
splitCompound(word: string, dict: NorwegianDictionary): string[] | null {
  // 1. Exact lookup in compound dictionary → return authoritative parts
  // 2. Try plain boundary: foo|bar where both in compoundParts
  // 3. Try binde-s: foo + s + bar where foo and bar in compoundParts
  // 4. Try binde-e: foo + e + bar where foo and bar in compoundParts
  // 5. Score candidates by frequency
  // 6. Reject
}
```

**New file:** `lib/norwegian-dictionary.ts` — loads and exposes the three validation tiers.

**Unicode:**
```ts
word.normalize("NFC").toLocaleLowerCase("nb-NO")
/^\p{L}+$/u  // for validation
```

### 2.2 Rewrite `lib/compound-utils.ts`

- Remove `COMMON_PARTS` hardcoded English set
- Remove `DISALLOWED_PARTS` English prefixes
- `RUNTIME_SPLIT_CONTEXT.isWord` → check against Norwegian `compoundParts` set
- `RUNTIME_SPLIT_CONTEXT.isAllowedShortPart` → check against `commonWords` set
- Remove `tryAlternativeParsing` English hardcoded dictionary
- Keep graph logic, BFS, environment creation (language-agnostic)

### 2.3 Update `lib/dictionary.ts`

- Remove `firstPartVariants` doubled-consonant logic
- Remove `buildPartIndex` doubled-consonant variant indexing
- Keep all other logic (graph structure, BFS, environment creation)

### 2.4 Update `lib/validation.ts`

- Replace Datamuse API with Norwegian bundled dictionary lookup
- Remove `tryAlternativeParsing` English dictionary
- Use three-tier validation: compoundParts → commonWords → validWords
- Error messages in Norwegian
- Keep fast-path / fallback architecture

### 2.5 Update `lib/quick-validation.ts`

- Unicode regex: `/^\p{L}+$/u`
- Error messages in Norwegian

### 2.6 Update `lib/puzzle-generator.ts`

- Update `DIFFICULTY_LENGTHS` for Norwegian compound lengths
- Remove `commonParts` English set, use Norwegian commonWords
- Keep chain-building, seeded RNG, bridge detection

### 2.7 Update `lib/hints.ts`

- `formatHintMessage` templates → Norwegian

### 2.8 Update `lib/daily-puzzle.ts`

- Fallback puzzle from `data/example-puzzles.json` (generated in Phase 1.4)

---

## Phase 3: UI Translation

Direct string replacement (no i18n framework). Files to translate:

| File | Changes |
|------|---------|
| `app/page.tsx` | Loading text |
| `app/layout.tsx` | `lang="nb"`, title, description, keywords |
| `app/manifest.ts` | name, description |
| `app/api/og/route.tsx` | Status titles, stat labels, difficulty labels |
| `components/Game.tsx` | Loading messages, errors, button labels |
| `components/HowToPlay.tsx` | Full instructional text + example chain from real graph |
| `components/InputBar.tsx` | Validation messages, placeholder |
| `components/VictoryModal.tsx` | Performance ratings, stat labels |
| `components/TopBar.tsx` | Labels, date → `toLocaleDateString('nb-NO', ...)` |
| `components/ShareButton.tsx` | Share text, buttons |
| `components/LeaderboardModal.tsx` | Stat labels, date → `nb-NO` |
| `components/HintButton.tsx` | Label, title |
| `components/LoadingScreen.tsx` | Loading message |
| `components/PlayerNameInput.tsx` | Labels, validation messages |
| `lib/hints.ts` | Template strings |
| `lib/quick-validation.ts` | Error messages |
| `lib/validation.ts` | Error messages |

---

## Phase 4: Metadata

- `app/layout.tsx`: `lang="nb"`, Norwegian title/description
- `app/manifest.ts`: Norwegian name/description
- `app/api/og/route.tsx`: Norwegian OpenGraph text
- `TopBar.tsx`, `LeaderboardModal.tsx`: `nb-NO` locale
- Game name: **Keep "HiveLink"**
- Tagline: "Finn veien gjennom norske sammensatte ord."

---

## Execution Order

1. Phase 1.1-1.5 — Data pipeline + quality report
2. Phase 2.1-2.3 — Core linguistic rewrite
3. Phase 2.4-2.8 — Supporting lib updates
4. Phase 3 — UI translation
5. Phase 4 — Metadata
6. Verify: `npx tsc --noEmit`, `npm run lint`, `npm run build`
