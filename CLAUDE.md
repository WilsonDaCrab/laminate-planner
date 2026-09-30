# CLAUDE.md — Lamināta plānotājs

## Par projektu

Tīmekļa lietotne (PWA), kurā lietotājs uzzīmē telpu un saņem optimālu lamināta izkārtojumu, precīzu materiāla daudzumu un **griešanas plānu**. Mērķis: klājējs sagriež visus dēļus **pirms** ieklāšanas un pēc tam tikai saliek, bez cikla "mēri – griez – mēri – griez".

Projekts ir arī LU kursa "Praktiskā kombinatoriālā optimizācija" praktiskais darbs. Optimizācijas kodols (simulētā rūdīšana, SA) un visas heiristikas jāimplementē pašiem un jātestē: izpildes laiks un kvalitāte pret optimālo risinājumu vai apakšējo robežu.

Prioritāšu secība: **pareizs un ātrs kodols → ērts redaktors → izvades klājējam**.

## Valoda

- Ar lietotāju sazinies latviski.
- Kods, identifikatori, koda komentāri un commit ziņojumi — angliski.
- UI teksti tikai caur i18n (`apps/web/src/i18n`; `lv` pēc noklusējuma, `en`).
- `docs/` ir latviski. Ja maini uzvedību, atjauno attiecīgo dokumentu tajā pašā commit.

## Stingrie noteikumi

1. **Nekādu gatavu optimizācijas algoritmu implementāciju.** Nedrīkst pievienot SA/GA/tabu meklēšanas pakotnes, LP/MIP/CP risinātājus (OR-Tools, glpk.js, highs, javascript-lp-solver u.c.), gatavas "bin packing", "cutting stock" vai "matching/assignment" bibliotēkas. Pašiem jāraksta: SA, gājieni, pārošana, heiristikas, pilnā pārlase, mērījumu mazāko kvadrātu risinātājs, PRNG.
   Atļauts: `clipper2-ts` (daudzstūru Būla operācijas un offset — tā ir ģeometrija, nevis optimizācija), UI bibliotēkas, `zod`, testēšanas rīki. **Ja nav skaidrs, vai pakotne ir atļauta, jautā pirms instalēšanas.**
2. `packages/core` ir tīrs TypeScript: bez DOM, bez Node API, bez React. Loģikā nav `Math.random()` un `Date.now()`: nejaušība nāk tikai no `core/rng`, laiks — no padotā `clock` parametra. Kodolam jāstrādā pārlūkā, Web Worker un Node.
3. Mērvienība ir milimetrs. Ievades izmēri ir veseli mm; iekšēji float64 ar `EPS` no `core/num`. Griešanas izmērus izvadē noapaļo **uz leju** līdz veselam mm, lai gabals nekad nebūtu garāks par vietu.
4. `core/validate` **nedrīkst** importēt no `core/layout`, `core/plan`, `core/evaluate` un `core/optimize`. Validētājs visu pārbauda no jauna, izmantojot tikai `core/geometry` un `core/model` (to uzrauga ESLint `no-restricted-imports`).
5. Novērtētāja (`evaluate`) dēļu skaitam **vienmēr** jāsakrīt ar plāna konstruktora (`plan`) un validētāja skaitu. To pārbauda īpašību testi. Nesakritība ir kļūda, nevis "tuvinājums".
6. Nekad nemaini testa gaidīto vērtību tikai tāpēc, lai tests izietu. Ja tests šķiet kļūdains, paskaidro, kāpēc, un jautā.
7. Strādā pa fāzēm no `docs/ROADMAP.md`. Nesāc nākamo fāzi, kamēr nav izpildīti iepriekšējās fāzes pieņemšanas kritēriji, ja vien lietotājs nesaka citādi. Lielas pārstrukturēšanas vispirms saskaņo.
8. Nozīmīgus dizaina lēmumus pieraksti `docs/DECISIONS.md` (īss ADR ieraksts).
9. Nav servera, kontu un telemetrijas. Lietotne darbojas pilnībā klienta pusē un bez interneta.

## Tehnoloģijas

- Node (aktuālā LTS), pnpm workspaces, TypeScript `strict` + `noUncheckedIndexedAccess`.
- Testi: Vitest, fast-check (īpašību testi), Playwright (redaktora e2e).
- Kvalitāte: ESLint (flat config), Prettier.
- Web: Vite, React, Zustand + Immer (undo/redo ar patch), Tailwind CSS + shadcn/ui, vite-plugin-pwa, Comlink (Web Worker), IndexedDB (idb-keyval).
- Ģeometrija: `clipper2-ts`.
- Atskaite: Typst; grafiki no CSV (Vega-Lite → SVG).

Instalē jaunākās stabilās versijas; lockfile ir commit sastāvā.

## Komandas

```bash
pnpm install
pnpm dev                      # web lietotne (apps/web)
pnpm test                     # visi testi (Vitest, dot reporteris)
pnpm -F @lp/core test         # tikai kodols
pnpm typecheck && pnpm lint   # tsc pa pakotnēm + ESLint visam repo
pnpm format                   # Prettier (tikai kods; docs/ un CLAUDE.md ir izslēgti)
pnpm build
```

Bench CLI (F4; ceļi ir no vietas, kur palaists pnpm):

```bash
pnpm bench run instances/rect/R2.json --method hc --seed 1 --iters 20000 --svg   # b-next|b-inst|rs|hc → results/f4/
pnpm bench validate results/f4/R2-hc-s1.json
pnpm bench lb instances/lshape/L1.json
pnpm bench baselines instances          # tabula: visas metodes × visas instances
pnpm bench run instances/rect/R2.json --method sa --seed 1 --iters 200000 --svg   # sa | sa-onsite
pnpm bench outer instances/rect/R2.json --iters 30000    # θ, sākuma siena un y0, SA labākajiem
pnpm bench compare instances --seeds 5 --iters 200000    # RS, HC, SA pret B-NEXT/B-INST (F5 kritērijs)
pnpm bench planted --seeds 20 --iters 200000              # cik sēklu atrod plantēto optimumu
pnpm bench tune                                           # SA parametru režģis (ADR-016)
pnpm bench perf                                           # novērtējumi/s (F5 kritērijs: ≥ 100 000 pie 60 segmentiem)
pnpm bench generate planted --preset P1                   # plantētā instance ar zināmu optimumu
pnpm bench exhaustive instances/tiny --step 5             # pilnā pārlase uz φ režģa pret B-INST, HC, SA (F6)
pnpm bench difficulty --n 6,10,14,18,22,26,30,34,38,42 --seeds 20 --iters 200000   # grūtības sērija uz plantētajām (results/f6/difficulty.csv)
pnpm bench bestknown instances --seeds 10 --iters 2000000 --write-meta   # meta.bestKnown = labākais no 10 gariem SA (§13.1)
pnpm bench all --jobs auto                                # E1 galvenā tabula + E3 estētika → results/raw/*.jsonl (atsākams), summary.csv, tables/ (--quick = sausā palaišana)
```

TypeScript ir piesprausts uz 6.x, jo `typescript-eslint` vēl neatbalsta 7 (sk. ADR-010).

## Struktūra

```
laminate-planner/
├── CLAUDE.md, README.md
├── .claude/                  # aģenti (test-runner, reviewer), Stop hook, iestatījumi
├── docs/                     # DOMAIN, ALGORITHM, UI, ROADMAP, DECISIONS, DARBA-GAITA (cilvēkam)
├── packages/
│   ├── core/                 # @lp/core — tīrs TS kodols (bez DOM)
│   │   └── src/
│   │       ├── num/          # EPS, mod, circDist, mm noapaļošana
│   │       ├── rng/          # sēklots PRNG (pašu implementācija)
│   │       ├── geometry/     # vektori, daudzstūri, arcs (bulge → lauzta līnija), frames, clip (clipper2-ts adapteris), zone
│   │       ├── model/        # Project tipi, zod shēmas, migrācijas, noklusējumi
│   │       ├── layout/       # joslas, segmenti, x-profils, kaimiņi, φ → gabali, pieļaujamās fāzes
│   │       ├── plan/         # dekoders: pārošana, strēmeles, brīvie gabali → Plan
│   │       ├── evaluate/     # mērķa funkcija, sodi, ātrais ceļš
│   │       ├── bounds/       # LB0, LB1
│   │       ├── optimize/     # sa, moves, outer (θ, y0), baselines
│   │       ├── validate/     # neatkarīgs validētājs
│   │       ├── cutlist/      # griešanas instrukcijas, secība, marķējumi
│   │       ├── survey/       # mērījumu saskaņošana, loki, ordinātas
│   │       └── render/       # SVG kā teksts (bench un drukai)
│   └── bench/                # @lp/bench — Node CLI: run, generate, exhaustive, experiments
├── apps/web/                 # @lp/web — React PWA
│   └── src/  (editor/, panels/, results/, print/, onsite/, state/, workers/, i18n/)
├── instances/                # testa telpas: tiny/ planted/ rect/ lshape/ slanted/ obstacles/ multi/
├── results/                  # eksperimentu CSV un grafiki (ģenerēti)
└── report/                   # Typst atskaite kursam
```

Atkarību virziens kodolā: `num → rng → geometry → model → layout → plan → evaluate → optimize`; `bounds` izmanto `layout`; `cutlist` un `render` izmanto `plan`; `survey` izmanto tikai `geometry`; `validate` izmanto tikai `geometry` un `model`. Cikliskas atkarības nav atļautas.

## Dokumentācija

| Kad | Lasi |
|---|---|
| Pirms katras fāzes | `docs/ROADMAP.md` |
| Termini, lamināta noteikumi, gadījumu katalogs, datu modelis | `docs/DOMAIN.md` |
| Modelis, dekoders, mērķa funkcija, gājieni, SA, robežas, eksperimenti | `docs/ALGORITHM.md` |
| Redaktors, rezultātu skati, izvades, web arhitektūra | `docs/UI.md` |
| Kāpēc izvēlēts tā, nevis citādi | `docs/DECISIONS.md` |

## Darba kārtība katrai fāzei

1. Izlasi fāzes uzdevumus un pieņemšanas kritērijus `docs/ROADMAP.md` un attiecīgās `docs/` sadaļas.
2. Ja izmaiņa ir liela (vairāk nekā ~200 rindiņas vai jauns modulis), vispirms īsi izklāsti plānu: faili, publiskie tipi, testi.
3. Raksti testus kopā ar kodu. Kodolam — vienībtesti un īpašību testi.
4. Pirms commit `pnpm typecheck && pnpm lint && pnpm test` jābūt zaļiem.
5. Atzīmē paveikto `docs/ROADMAP.md`. Commit ziņojumi pēc Conventional Commits (`feat(core): ...`); mazi, loģiski commit.
6. Fāzes beigās dod lietotājam īsu kopsavilkumu: kas izdarīts, kas atklāts, kas jāizlemj.

## Aģenti un tokenu taupīšana

- Testus, typecheck un lint palaid caur aģentu **`test-runner`** (haiku), nevis tieši — garais izvads paliek ārpus sarunas. Tieši drīkst palaist tikai vienu konkrētu testu atkļūdošanai.
- Pirms fāzes noslēguma commit izsauc **`reviewer`** (sonnet) un norādi fāzi. Fāzēm F3 (dekoders) un F5 (SA) izsauc to ar `model: opus`. KRITISKOS un SVARĪGOS atradumus izlabo, pirms atzīmē fāzi kā pabeigtu.
- Koda meklēšanai izmanto iebūvēto `Explore` aģentu.
- Aģentu komandas un dinamiskās darbplūsmas nelieto, ja lietotājs to nav lūdzis.
- Stop hook (`.claude/hooks/stop-check.mjs`) neļauj pabeigt darbu, ja `typecheck`, `lint` vai `test` krīt. Neapej to. Ja pēc 3 mēģinājumiem neizdodas, apraksti problēmu lietotājam.
- Lasi tikai vajadzīgās `docs/` sadaļas, nevis visus dokumentus pēc kārtas.

## Modelis vienā lapā

Pilnā versija: `docs/ALGORITHM.md`.

- Telpa mīnus spraugas un šķēršļi = **uzstādāmā zona Z**. To pagriež par −θ, lai rindas ietu pa +x un krātos pa +y.
- Rindas ir joslas `[y0 + jW, y0 + (j+1)W]`. Rindu nobīde `y0` nosaka pirmās/pēdējās rindas un iekšējo stūru strēmeļu platumus.
- **Segments** = sakarīga komponente `Z ∩ josla`. Viena josla var dot vairākus segmentus (U telpa, kolonna).
- **Domēns:** katram segmentam šuvju fāze `φ ∈ [0, L)`; šuves ir taisnes `x = φ + mL`. No φ viennozīmīgi izriet segmenta gabali.
- **Dēļa orientācija ir fiksēta** (to nevar pagriezt): kreisais gals `x_b = 0`, labais gals `x_b = L`, apakšmala `y_b = 0` (pret iepriekšējo rindu), augšmala `y_b = W` (pret nākamo rindu).
- Sākuma gabals = dēļa **labā** daļa, beigu gabals = **kreisā** daļa. Vienā dēlī ir ≤ 1 sākuma un ≤ 1 beigu gabals.
- Beigu gabals `e` un sākuma gabals `s` var nākt no viena dēļa, ja `e + s + k ≤ L`. Maksimālo pāru skaitu precīzi atrod ar kārtošanu un divu rādītāju metodi.
- **Dekoders** (`core/plan`): φ → konkrēts griešanas plāns → dēļu skaits `B`. SA optimizē φ, un katru risinājumu novērtē ar dekoderu.
- Mērķis: `f = B + λ_V·V + λ_H·H + ε·N` (V — šuvju nobīdes pārkāpumi, H — estētika, N — "tuvums nākamajam pārim").
- Apakšējā robeža `LB1 = ⌈max_{y_b} Σ_s c_s(y_b) / L⌉` nav atkarīga no φ. Ja `B = LB1`, optimums ir pierādīts un meklēšanu var apturēt.

## Slazdi

- Cirkulārais attālums: `d(α, β) = min(|α − β| mod L, L − |α − β| mod L)`. Izmanto `circDist` no `core/num`.
- Šuve, kas sakrīt ar sienu, nav šuve: ja `(φ − a) mod L = 0`, sākuma gabals ir vesels dēlis bez griezuma. Tas pats beigās.
- Zāģa griezums (kerf) patērē dēļa materiālu, nevis rindas garumu.
- Minimālais garums `L_min` attiecas uz sākuma un beigu gabaliem, un to mēra gar katru **atvērto** garo malu (tur, kur gabals savienojas ar blakus rindu). Pārošanai izmanto gabala **pilno** x apjomu (`extent`).
- Nejauc koordinātu sistēmas: telpa ↔ rindas (pagriezta) ↔ dēlis. Pārveidojumi tikai caur `core/geometry/frames`.
- Pirmās rindas gabaliem vajag tikai augšmalas profilu, pēdējās rindas gabaliem — tikai apakšmalas. Tāpēc abu rindu strēmeles var nākt no viena dēļa, ja `a + b + k ≤ W`.
- Clipper strādā ar veseliem skaitļiem. Mērogošana (`CLIPPER_SCALE`, 0,01 mm) notiek tikai adapterī `core/geometry/clip.ts`.
- Caurules nav segmentu ģeometrija. Tās ir gabalu urbumu pazīmes (sk. `docs/ALGORITHM.md` §2.1). Apaļa kolonna (`circle`) gan ir īsts caurums.
- Loki modelī glabājas precīzi kā malas `bulge` (0 = taisne, ±1 = pusaplis; CCW telpā > 0 = uz āru). Lauztā līnijā tos pārvērš **tikai** `core/geometry/arcs` ar `ARC_TOL = 0,5 mm`. Redaktorā un saglabātajā projektā loki nekad netiek aizstāti ar punktiem.
- `Room.wallShapes` ir tikai redaktora metadati (rediģējamas formu grupas). Kodols tos ignorē; ģeometrijas avots ir `outline` + `edges[].bulge`.

# Compact instructions

Saspiežot sarunu, saglabā: pašreizējo fāzi un tās neizpildītos kritērijus, pieņemtos lēmumus, mainīto failu sarakstu, neizlabotās kļūdas (ar testa nosaukumu, fast-check sēklu un pretpiemēru). Izmet: pilnus testu izvadus, jau izlabotu kļūdu detaļas un failu saturu, ko var nolasīt no jauna.
