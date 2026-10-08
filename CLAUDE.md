# CLAUDE.md — Lamināta plānotājs

## Par projektu

Kursa darba repozitorijs: no telpas zīmējuma (daudzstūris ar šķēršļiem) tiek iegūts lamināta izkārtojums ar minimālu dēļu skaitu un **griešanas plāns**: visus dēļus var sagriezt **pirms** ieklāšanas, bez cikla "mēri – griez – mēri – griez".

Tas ir LU kursa "Praktiskā kombinatoriālā optimizācija" praktiskais darbs. Optimizācijas kodols (simulētā rūdīšana, SA) un visas heiristikas ir jāimplementē pašiem un jātestē: izpildes laiks un kvalitāte pret optimālo risinājumu vai apakšējo robežu. Produkta daļa (web lietotne, redaktors, mērījumi, izvades klājējam) ir atsevišķā v2 projektā un šeit ir izņemta (ADR-029). Projekts ir noslēgts kā kursa darbs; izmaiņas tikai kursa nodevuma (kods, instances, rezultāti, atskaite) ietvaros.

Kursa nodevums: problēmas implementācija + SA, dažāda izmēra testa instances, testēšana (laiks un kvalitāte pret optimumu/labāko zināmo), 2–3 lpp. PDF atskaite (`report/main.typ`), GitHub repozitorijs.

## Valoda

- Ar lietotāju sazinies latviski.
- Kods, identifikatori, koda komentāri un commit ziņojumi — angliski.
- `docs/` ir latviski. Ja maini uzvedību, atjauno attiecīgo dokumentu tajā pašā commit.

## Stingrie noteikumi

1. **Nekādu gatavu optimizācijas algoritmu implementāciju.** Nedrīkst pievienot SA/GA/tabu meklēšanas pakotnes, LP/MIP/CP risinātājus (OR-Tools, glpk.js, highs, javascript-lp-solver u.c.), gatavas "bin packing", "cutting stock" vai "matching/assignment" bibliotēkas. Pašiem jāraksta: SA, gājieni, pārošana, heiristikas, pilnā pārlase, PRNG.
   Atļauts: `clipper2-ts` (daudzstūru Būla operācijas un offset — tā ir ģeometrija, nevis optimizācija), `zod`, testēšanas rīki. **Ja nav skaidrs, vai pakotne ir atļauta, jautā pirms instalēšanas.**
2. `packages/core` ir tīrs TypeScript: bez DOM, bez Node API, bez React. Loģikā nav `Math.random()` un `Date.now()`: nejaušība nāk tikai no `core/rng`, laiks — no padotā `clock` parametra. Kodolam jāstrādā pārlūkā, Web Worker un Node.
3. Mērvienība ir milimetrs. Ievades izmēri ir veseli mm; iekšēji float64 ar `EPS` no `core/num`. Griešanas izmērus izvadē noapaļo **uz leju** līdz veselam mm, lai gabals nekad nebūtu garāks par vietu.
4. `core/validate` **nedrīkst** importēt no `core/layout`, `core/plan`, `core/evaluate` un `core/optimize`. Validētājs visu pārbauda no jauna, izmantojot tikai `core/geometry` un `core/model` (to uzrauga ESLint `no-restricted-imports`).
5. Novērtētāja (`evaluate`) dēļu skaitam **vienmēr** jāsakrīt ar plāna konstruktora (`plan`) un validētāja skaitu. To pārbauda īpašību testi. Nesakritība ir kļūda, nevis "tuvinājums".
6. Nekad nemaini testa gaidīto vērtību tikai tāpēc, lai tests izietu. Ja tests šķiet kļūdains, paskaidro, kāpēc, un jautā.
7. Lielas pārstrukturēšanas vispirms saskaņo ar lietotāju.
8. Nozīmīgus dizaina lēmumus pieraksti `docs/DECISIONS.md` (īss ADR ieraksts; vecos ierakstus nepārraksti, tas ir vēsturisks žurnāls).
9. Nav servera, kontu un telemetrijas. Viss darbojas lokāli un bez interneta.

## Tehnoloģijas

- Node (aktuālā LTS), pnpm workspaces, TypeScript `strict` + `noUncheckedIndexedAccess`.
- Testi: Vitest, fast-check (īpašību testi).
- Kvalitāte: ESLint (flat config), Prettier.
- Ģeometrija: `clipper2-ts`. Shēmas: `zod`.
- Atskaite: Typst (`report/main.typ`), dati no `results/*.csv`.

Instalē jaunākās stabilās versijas; lockfile ir commit sastāvā.

## Komandas

```bash
pnpm install
pnpm test                     # visi testi (Vitest, dot reporteris)
pnpm -F @lp/core test         # tikai kodols
pnpm typecheck && pnpm lint   # tsc pa pakotnēm + ESLint visam repo
pnpm format                   # Prettier (tikai kods; docs/ un CLAUDE.md ir izslēgti)
```

Bench CLI (ceļi ir no vietas, kur palaists pnpm):

```bash
pnpm bench run instances/rect/R2.json --method sa --seed 1 --iters 200000 --svg   # b-next|b-inst|hc|sa|sa-onsite → results/f4/
pnpm bench validate results/f4/R2-sa-s1.json
pnpm bench lb instances/lshape/L1.json
pnpm bench all --jobs auto                                # viens eksperiments: visas instances × B-NEXT, B-INST, HC, SA, SA-onsite → results/raw/main.jsonl (atsākams), summary.csv, env.json (--quick = sausā palaišana; laiki godīgi tikai ar --jobs 1)
pnpm bench exhaustive instances/tiny --step 5             # pilnā pārlase uz φ režģa pret B-INST, HC, SA
pnpm bench generate planted --preset P1                   # plantētā instance ar zināmu optimumu
pnpm bench difficulty --n 6,10,14,18,22,26,30,34,38,42 --seeds 20 --iters 200000   # grūtības sērija uz plantētajām (results/f6/difficulty.csv)
pnpm bench bestknown instances --seeds 10 --iters 2000000 --write-meta   # meta.bestKnown = labākais no 10 gariem SA
pnpm bench tune                                           # SA parametru režģis (ADR-016)
```

TypeScript ir piesprausts uz 6.x, jo `typescript-eslint` vēl neatbalsta 7 (sk. ADR-010).

## Struktūra

```
laminate-planner/
├── CLAUDE.md, README.md
├── .claude/                  # aģenti (test-runner, reviewer), Stop hook, iestatījumi
├── docs/                     # DOMAIN, ALGORITHM, ROADMAP, DECISIONS, DARBA-GAITA (cilvēkam)
├── packages/
│   ├── core/                 # @lp/core — tīrs TS kodols (bez DOM)
│   │   └── src/
│   │       ├── num/          # EPS, mod, circDist, mm noapaļošana, intervāli
│   │       ├── rng/          # sēklots PRNG (pašu implementācija)
│   │       ├── geometry/     # vektori, daudzstūri, arcs (bulge → lauzta līnija), frames, clip (clipper2-ts adapteris), zone
│   │       ├── model/        # Project tipi, zod shēmas, migrācijas, noklusējumi
│   │       ├── layout/       # joslas, segmenti, x-profils, kaimiņi, φ → gabali, pieļaujamās fāzes, y0
│   │       ├── plan/         # dekoders: pārošana, strēmeles, brīvie gabali, secīgais režīms → Plan
│   │       ├── evaluate/     # mērķa funkcija f = B + λ_V·V + ε·N, ātrais ceļš
│   │       ├── bounds/       # LB0, LB1
│   │       ├── optimize/     # sa, moves, baselines (B-NEXT, B-INST, HC)
│   │       ├── validate/     # neatkarīgs validētājs
│   │       └── render/       # SVG kā teksts (atskaites attēls)
│   └── bench/                # @lp/bench — Node CLI: run, validate, lb, generate, exhaustive, difficulty, bestknown, tune; all/ (protocol, runJob, raw, summary, worker pool)
├── instances/                # testa telpas: tiny/ planted/ rect/ lshape/ slanted/ obstacles/ curved/
├── results/                  # eksperimentu CSV (ģenerēti; results/raw netiek commit)
└── report/                   # Typst atskaite kursam
```

Atkarību virziens kodolā: `num → rng → geometry → model → layout → plan → evaluate → optimize`; `bounds` izmanto `layout`; `render` izmanto `plan`; `validate` izmanto tikai `geometry` un `model`. Cikliskas atkarības nav atļautas.

## Dokumentācija

| Kad | Lasi |
|---|---|
| Fāžu vēsture un projekta noslēgums | `docs/ROADMAP.md` |
| Termini, lamināta noteikumi, gadījumu katalogs, datu modelis | `docs/DOMAIN.md` |
| Modelis, dekoders, mērķa funkcija, gājieni, SA, robežas, eksperimenti | `docs/ALGORITHM.md` |
| Kāpēc izvēlēts tā, nevis citādi | `docs/DECISIONS.md` |

## Darba kārtība

1. Izlasi attiecīgās `docs/` sadaļas.
2. Ja izmaiņa ir liela (vairāk nekā ~200 rindiņas vai jauns modulis), vispirms īsi izklāsti plānu: faili, publiskie tipi, testi.
3. Raksti testus kopā ar kodu. Kodolam — vienībtesti un īpašību testi.
4. Pirms commit `pnpm typecheck && pnpm lint && pnpm test` jābūt zaļiem.
5. Commit ziņojumi pēc Conventional Commits (`feat(core): ...`); mazi, loģiski commit.
6. Beigās dod lietotājam īsu kopsavilkumu: kas izdarīts, kas atklāts, kas jāizlemj.

## Aģenti un tokenu taupīšana

- Testus, typecheck un lint palaid caur aģentu **`test-runner`** (haiku), nevis tieši — garais izvads paliek ārpus sarunas. Tieši drīkst palaist tikai vienu konkrētu testu atkļūdošanai.
- Pirms noslēguma commit lielākām izmaiņām izsauc **`reviewer`** (sonnet). KRITISKOS un SVARĪGOS atradumus izlabo.
- Koda meklēšanai izmanto iebūvēto `Explore` aģentu.
- Aģentu komandas un dinamiskās darbplūsmas nelieto, ja lietotājs to nav lūdzis.
- Stop hook (`.claude/hooks/stop-check.mjs`) neļauj pabeigt darbu, ja `typecheck`, `lint` vai `test` krīt. Neapej to. Ja pēc 3 mēģinājumiem neizdodas, apraksti problēmu lietotājam.
- Lasi tikai vajadzīgās `docs/` sadaļas, nevis visus dokumentus pēc kārtas.

## Modelis vienā lapā

Pilnā versija: `docs/ALGORITHM.md`.

- Telpa mīnus spraugas un šķēršļi = **uzstādāmā zona Z**. To pagriež par −θ, lai rindas ietu pa +x un krātos pa +y.
- Rindas ir joslas `[y0 + jW, y0 + (j+1)W]`. Rindu nobīde `y0` nosaka pirmās/pēdējās rindas un iekšējo stūru strēmeļu platumus. θ, sākuma puse un y0 ir fiksēti (`resolveY0`).
- **Segments** = sakarīga komponente `Z ∩ josla`. Viena josla var dot vairākus segmentus (U telpa, kolonna).
- **Domēns:** katram segmentam šuvju fāze `φ ∈ [0, L)`; šuves ir taisnes `x = φ + mL`. No φ viennozīmīgi izriet segmenta gabali.
- **Dēļa orientācija ir fiksēta** (to nevar pagriezt): kreisais gals `x_b = 0`, labais gals `x_b = L`, apakšmala `y_b = 0` (pret iepriekšējo rindu), augšmala `y_b = W` (pret nākamo rindu).
- Sākuma gabals = dēļa **labā** daļa, beigu gabals = **kreisā** daļa. Vienā dēlī ir ≤ 1 sākuma un ≤ 1 beigu gabals.
- Beigu gabals `e` un sākuma gabals `s` var nākt no viena dēļa, ja `e + s + k ≤ L`. Maksimālo pāru skaitu precīzi atrod ar kārtošanu un divu rādītāju metodi.
- **Dekoders** (`core/plan`): φ → konkrēts griešanas plāns → dēļu skaits `B`. SA optimizē φ, un katru risinājumu novērtē ar dekoderu.
- Mērķis: `f = B + λ_V·V + ε·N` (V — šuvju nobīdes pārkāpumi, N — "tuvums nākamajam pārim").
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
- Loki modelī glabājas precīzi kā malas `bulge` (0 = taisne, ±1 = pusaplis; CCW telpā > 0 = uz āru). Lauztā līnijā tos pārvērš **tikai** `core/geometry/arcs` ar `ARC_TOL = 0,5 mm`.
