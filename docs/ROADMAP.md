# ROADMAP.md — Darba plāns

Fāzes izpilda secīgi. Katrai fāzei ir uzdevumi un **pieņemšanas kritēriji**. Fāze ir pabeigta, kad visi kritēriji ir izpildīti, `pnpm typecheck && pnpm lint && pnpm test` ir zaļi un paveiktais ir atzīmēts šajā failā.

**F0–F6 ir kursa nodevums** (kodols, testēšana, atskaite). F7–F12 ir produkts. F13–F16 ir paplašinājumi.

Laika aplēses ir orientējošas (darba dienas, strādājot ar Claude Code).

---

## F0. Repozitorijs un rīki (~1 d)

- [x] pnpm workspace: `packages/core` (@lp/core), `packages/bench` (@lp/bench), `apps/web` (@lp/web — pagaidām tukšs Vite + React šablons)
- [x] `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`; kodolam `lib: ["ES2023"]`, `types: []` (bez DOM)
- [x] ESLint flat config + Prettier. Kodolam: aizliegt `window`, `document`, `Math.random`, `Date.now`; `validate` nedrīkst importēt `layout`/`plan`/`evaluate`/`optimize`
- [x] Vitest + fast-check; viens parauga tests kodolā
- [x] Saknes skripti `typecheck`, `lint`, `test` (tos izmanto Stop hook); `test` ar kluso reporteri (`vitest run --reporter=dot`), lai izvadē būtu tikai kļūdas
- [x] Pārbaudīt `.claude/` konfigurāciju: Stop hook bloķē pabeigšanu ar tīši salauztu testu un pēc labojuma ļauj pabeigt; `test-runner` atgriež tikai kļūdas
- [x] GitHub Actions: typecheck, lint, test uz katru push/PR
- [x] README.md (īss apraksts, palaišana), LICENSE (izvēlēties; pārbaudīt `clipper2-ts` licences saderību) (`clipper2-ts` licences saderība atlikta uz F1, kad pakotni instalē; sk. ADR-010)
- [x] Precizēt komandu sadaļu `CLAUDE.md`

**Kritēriji:** `pnpm install && pnpm test` strādā tīrā klonā; CI zaļš; ESLint noķer `Math.random()` kodolā (pārbaudīts ar tīšu pārkāpumu); Stop hook un abi aģenti strādā.

## F1. Pamati: skaitļi, PRNG, ģeometrija (~3–4 d)

- [x] `num`: `EPS`, `mod`, `circDist`, `floorMm`, droša salīdzināšana
- [x] `rng`: pašu PRNG (piem., xoshiro128** vai sfc32), `next()`, `int(a, b)`, `pick`, `shuffle`, `fork(seed, i)`; determinisma testi
- [x] `geometry`: Vec2 operācijas; daudzstūra laukums, orientācija, vienkāršības pārbaude, punkts daudzstūrī, nogriežņu krustpunkti
- [x] `geometry/arcs`: bulge ↔ loks (centrs, rādiuss, leņķis, horda, bultas augstums), diskretizācija ar `ARC_TOL` un `sourceEdge` atsaucēm, apļi
- [x] `geometry/frames`: telpa ↔ rindas (rotācija −θ, spoguļošana) ↔ dēlis; round-trip testi
- [x] `geometry/clip`: `clipper2-ts` adapteris (mērogošana, intersect, difference, union, inflate, PolyTree → daudzstūri ar caurumiem)
- [x] `geometry/zone`: mainīga platuma miter offset + tīrīšana; šķēršļu atņemšana; durvju ailas paplašinājums (`sourceEdge` atjaunošana pēc Clipper atlikta uz F3, sk. ADR-011)
- [x] Atsauces telpas testiem: taisnstūris, L, U, trapece, paralelograms, erkers, telpa ar kolonnu, telpa ar pusapaļu erkeru un apaļu kolonnu

**Kritēriji:** Z laukums visām atsauces telpām (bez lokiem) sakrīt ar manuāli aprēķināto (±0,5 mm²; sienām ar iracionālu virzienu — perimetrs × 0,005 mm, jo Clipper noapaļo virsotnes uz 0,01 mm režģi, sk. ADR-011); telpām ar lokiem — ar analītisko laukumu relatīvās kļūdas robežās, ko nosaka ARC_TOL; diskretizētā loka punktu attālums no īstā loka ≤ ARC_TOL; round-trip kļūda < 1e-6 mm; īpašību tests: nejaušiem taisnleņķa daudzstūriem `area(Z) ≤ area(P)`, un Z ir vienkāršs daudzstūris vai daudzstūru kopa.

## F2. Modelis, segmenti, fāzes → gabali (~4–5 d)

- [x] `model`: tipi (`DOMAIN.md` §8), zod shēmas, noklusējumi, JSON ielāde/saglabāšana, `schemaVersion` + migrāciju karkass
- [x] `layout/bands`: joslas pēc (θ, stackSide, y0), segmenti (komponentes), `a_s`, `b_s`, ID piešķiršana
- [x] `layout/neighbors`: `I_st`, `O_s^low`, `O_s^high`, kaimiņu grafs (arī otrās kārtas — H sodam)
- [x] `layout/xprofile`: `isRect`, lūzumpunkti, šķērsgriezumi, `complex` karogs
- [x] `layout/pieces`: φ → gabali (ātrais ceļš + vispārīgais), deskriptori (`ALGORITHM.md` §3.2)
- [x] `layout/feasible`: F_s (analītiski taisnstūriem, 1 mm skenēšana pārējiem), `sample`, `project`, `contains`
- [x] Pirmās instances `instances/rect/`, `instances/lshape/`, `instances/slanted/`, `instances/curved/`

**Kritēriji:**

- taisnstūrim 4000×3000, W = 192 dažādiem y0 — segmentu skaits un strēmeļu platumi sakrīt ar aprēķinātajiem;
- īpašību tests: segmenta gabalu `extent` summa = `b_s − a_s`; katram φ ∈ F_s visi sākuma/beigu gabali atbilst L_min;
- ātrais un vispārīgais ceļš taisnstūra segmentiem dod identiskus deskriptorus;
- gabalu formas (Clipper) apvienojums = segments.

## F3. Dekoders, novērtētājs, robežas, validētājs, griešanas saraksts (~5–7 d)

- [x] `plan`: A posms (`maxPairs`), B posms (B.1, B.2), C posms (best fit), atlikumu krājums ar profilu karogiem, `Plan` ar `placements`
- [x] `geometry/zone`: `sourceEdge` atjaunošana pēc Clipper operācijām (atlikta no F1, ADR-011): zonas malām jānorāda, kura sākotnējā loka mala tās ir, ģeometriski (galapunkti uz koncentriskā loka r ± g ar `ARC_TOL`); kritērijs — pusapaļa erkera zonā visas loka malas atpazītas, taisnās nav
- [x] `plan`: gabalu pazīmes — slīpi griezumi, robi, strēmeles pēc sienas, līkumoti griezumi (`curveCut` ar ordinātām); caurules → `drill`
- [x] `plan/onsite`: secīgais dekoders (`ALGORITHM.md` §4.5)
- [x] `evaluate`: f(φ) — B (kopīgs dekodera kodols ar `buildPlan`; ātrā typed-array versija F5, sk. ADR-013), V (ātrais + precīzais ceļš), H, R, N; derīgums
- [x] `bounds`: LB0, LB1 (ar lūzumpunktiem)
- [x] `validate`: visas §11 pārbaudes, pārkāpumu kodi
- [x] `cutlist`: griešanas secība katram dēlim (garengriezumi, tad šķērsgriezumi), atdura grupēšana, klāšanas secība pa rindām, marķējumi; izvades izmēri ar stingru `Math.floor` (`num.floorMm` pieļauj +1e-6 mm, sk. ADR-011), lai gabals nekad nav garāks par vietu
- [x] `render/svg`: telpa + plāns + marķējumi kā SVG teksts
- [x] B.3: strēmeļu gabali no A posma atlikumiem (velkts uz priekšu no F14, ADR-013: citādi SA(precut) nevarētu izpildīt F5 kritēriju "SA ≤ bāzes metodes")

**Kritēriji:**

- vienībtests: `maxPairs` sakrīt ar pilno pārlasi (visas pārošanas) nejaušām mazām kopām (n ≤ 8);
- īpašību tests (nejaušas telpas × nejaušas φ ∈ F): `evaluate.B === plan.boards.length === validate.boards`; validētājs neziņo pārkāpumus, izņemot nobīdi, ja V > 0; `LB ≤ B`;
- V = 0 ⇔ validētājs neziņo par nobīdi;
- ar roku pārbaudīts SVG trim instancēm (taisnstūris, L, trapece). Pārbaudīts (lietotājs, 2026-09-29): `pnpm -F @lp/bench render-samples` → `results/f3/*.svg`.

## F4. Bāzes metodes, CLI, vizualizācija (~2–3 d)

- [x] `optimize/baselines`: B-NEXT, B-INST, RS, HC
- [x] `bench` CLI: `run <instance> --method … --seed … --iters … --time … --out … --svg`
- [x] `bench` CLI: `validate <result.json>`, `lb <instance>` (+ `baselines` tabula)
- [x] Rezultātu formāts: JSON (plāns + statistika) un SVG

**Kritēriji:** visas metodes uz visām esošajām instancēm dod validētāja pārbaudītus plānus; B-INST ≤ B-NEXT visām instancēm (ja nē — izskaidrot); SVG izskatās pareizi (pārbauda cilvēks). Pārbaudīts (lietotājs, 2026-09-29): `results/f4/*.svg`.

## F5. SA un ārējā cilpa (~4–5 d)

- [x] `optimize/moves`: M1–M5, gājienu statistika. **Ņemt vērā (ADR-013):** taisnleņķa segmentiem φ jāturas pie veseliem mm (citādi griešanas saraksts zaudē līdz `k` mm uz gabalu); `optimize/outer` y0 filtrs ir obligāts, jo plānotājs y0 nefiltrē
- [x] `optimize/sa`: kalibrācija, grafiks (iterāciju un laika režīms), labākais derīgais, apstāšanās pie LB, neobligātā pārkarsēšana
- [x] `optimize/outer`: θ kandidāti, sākuma puse, y0 skenēšana ar filtru, top-K, budžeta sadale, salīdzinājuma tabula
- [x] Parametru pielāgošana nelielā eksperimentā (p0, gājienu varbūtības); rezultātu pieraksta `DECISIONS.md` (ADR-016; `pnpm bench tune`)
- [ ] (Neobl.) LAHC ar tiem pašiem gājieniem — atlikts (nav vajadzīgs kursa kritērijiem)

**Kritēriji:**

- [ ] SA ≤ visas bāzes metodes visām instancēm (vidēji pa sēklām) — **nav izpildīts**: L1 un P4 zaudē HC par 0,35 un 0,95 dēļa, pārējās 10 instances ≤ (ADR-016); Pieņemts ar lietotāja lēmumu 2026-09-30, sk. ADR-017.
- [ ] plantētajām instancēm P1–P4 SA atrod optimumu ≥ 90 % sēklu ar 200 000 iterāciju budžetu — **nav izpildīts** (P1 20/20, P2 1/20, P3 0/20, P4 0/20; ADR-016); Pieņemts ar lietotāja lēmumu 2026-09-30, sk. ADR-017.
- [x] novērtētājs ≥ 100 000 novērtējumu/s pie 60 segmentiem (`pnpm bench perf`);
- [x] viena sēkla → identisks rezultāts (determinisms iterāciju režīmā).

**F5 noslēgta ar daļēji izpildītiem kritērijiem (ADR-017); pāreja uz F6.**

## F6. Eksperimenti un kursa atskaite (~4–5 d) — **kursa nodevums**

- [ ] `bench generate`: plantētais ģenerators (kāpņu + bloku variants), pierādījuma pārbaude (`B* = LB1`) — kāpņu variants izpildīts (ADR-015; `instances/planted/P1–P6`, ADR-020); **bloku variants atlikts** (nav vajadzīgs kursa kritērijiem)
- [x] `bench exhaustive`: pilnā pārlase tiny instancēm (ADR-018; `instances/tiny/T1–T4`)
- [x] Pilns instanču komplekts (`ALGORITHM.md` §13.1), `meta.knownOptimum` / `meta.bestKnown` — 27 instances (ADR-020); `bestKnown` no 10 × 2 M SA 21 instancei (`results/f6/bestknown.txt`); `knownOptimum` P1–P6 (plantētās) un pierādīts B = LB: T1, T2, T4, R1, L3, O2; `multi` (M1 pēc F13) un `real` netiek veidotas
- [x] `bench all`: visi eksperimenti → `results/raw/*.jsonl`, `results/summary.csv` — palaists pilnā apjomā (2854 skrējieni, 2 h 41 min, commit `c318900`; ADR-022, ADR-023, ADR-024); ārējā cilpa, pārlase un plantētie paliek atsevišķas komandas (`outer`, `exhaustive`, `planted`, `difficulty`)
- [x] Grafiki G1–G3 → `results/plots/*.svg` (Vega-Lite); G4/G5 (neobligāti) nav
- [x] `report/` Typst atskaite (2–3 lpp., struktūra zemāk) → PDF — `report/main.typ` un `report/main.pdf` (3 lpp.): tabula, G1–G3, secinājumi, ierobežojumi, saite uz repozitoriju
- [x] GitHub repozitorijs (`WilsonDaCrab/laminate-planner`), git tag `v0.1-kurss` — kods un tags nosūtīti; repozitorijs paliek **PRIVĀTS**, lietotājs to padarīs publisku, kad vajadzēs (saite atskaitē strādās pēc tam)

**Kritēriji:** `pnpm bench all` no tīra klona atkārto visas tabulas; PDF satur visas četras prasītās sadaļas un saiti uz repozitoriju.

**Statuss (2026-10-01): F6 noslēgta.** Izpildīts viss; repozitorijs nav publisks (lietotāja lēmums). Kritērijs "no tīra klona" pārbaudīts 2026-10-03: `git clone` + `pnpm install --frozen-lockfile` + `pnpm bench all --jobs 12` (4474 skrējieni, 66 min) deva identiskus `summary.csv`, `summary_bonly.csv` un G1–G3 tabulas (atšķiras tikai laika kolonnas); sk. `results/f6/clone-check.txt`. **F5 kritēriji (a) un (b) paliek neizpildīti** (SA nav būtiski labāks par HC; plantētos optimumus P2–P6 neatrod; ADR-017, ADR-024) un atskaitē ziņoti godīgi.

**Atjauninājums (2026-10-03):** pēc ADR-025…027 (ātrais on-site novērtētājs, plantētās bez H-rakstura, SA parametri un atjaunošana) pilnā matrica pārskrieta (4474 skrējieni, 8 pavedieni, 1 h 24 min), tabulas, grafiki un atskaite atjaunoti. F5 kritērijs (b) ir izpildīts 5 no 6 plantētajām (P5: 80 %); kritērijs (a) nav stingri izpildīts (L1: HC 86,6 pret SA 86,8). Ar jauno SA pārskrieta arī grūtības sērija (n = 6…42, 20 sēklas; `results/f6/difficulty.csv`, SA atrod plantēto optimumu 8 no 10 izmēriem 20/20, n = 30: 18/20, n = 38: 2/20) un `bestknown` (10 × 2 M ar jauno SA 15 telpās; 12 ar `knownOptimum` nav pārskrietas; visas 15 vērtības sakrīt ar `meta.bestKnown`, S2 pret veco skrējienu 37 → 36). Atskaite pārbūvēta (3 lpp.). F6 paliek noslēgta.

### Kursa atskaites struktūra

1. **Uzdevuma formulējums** (~½ lpp.): lamināta izkārtojums ar profilu orientāciju, noteikumiem un mērķi minimizēt dēļus. Īsi par iepriekšēju griešanu un globālo pārošanu. Viens attēls (plāns ar krāsotiem pāriem).
2. **Algoritms** (~1 lpp.):
   - a) domēns — φ vektors, F_s, ārējā cilpa;
   - b) novērtēšana — dekoders (A/B/C posmi, `maxPairs` pareizība), mērķa funkcija, LB1;
   - c) gājiens — M1–M5, uzsvars uz M4;
   - d) algoritms — SA pseudokods, parametri.
3. **Testēšana** (~1 lpp.): instanču komplekts, protokols, galvenā tabula, G1 un G3, secinājumi (gap pret LB, plantēto optimumu atrašanas daļa, laiks, iepriekšējas griešanas vērtība).
4. **Saite** uz repozitoriju. Viena rindkopa par lietotni (ekrānuzņēmums), ja tā jau ir.

---

## F7. Web lietotnes karkass (PWA) (~2–3 d)

- [ ] Vite + React + TS; Tailwind + shadcn/ui; izkārtojums (`UI.md` §3)
- [ ] Zustand stores (`project`, `ui`, `result`), Immer patch vēsture
- [ ] IndexedDB automātiska saglabāšana, projektu saraksts, JSON imports/eksports
- [ ] i18n (lv, en) ar atslēgu saderības testu
- [ ] vite-plugin-pwa: manifests, ikonas, offline kešs; izvietošana GitHub Pages (Actions)

**Kritēriji:** lietotni var instalēt (Chrome/Edge un Android); pēc pirmās ielādes tā atveras un strādā bez interneta; parauga projekts tiek ielādēts, saglabāts un atjaunots pēc lapas pārlādes.

## F8. Telpu redaktors (~8–10 d)

- [ ] Audekls: kamera, pan/zoom (pele, skārienekrāns), režģis, lineāli, mēroga josla
- [ ] Sagataves (taisnstūris, L, U, T) ar parametru dialogu
- [ ] Līnijas rīks ar dinamisko ievadi (garums, relatīvs leņķis) un piesaisti (`UI.md` §4.3–4.4)
- [ ] Izvēle, virsotņu un malu vilkšana, malas garuma rediģēšana ar "pabīdīšanas" semantiku
- [ ] Punkts sienā un brīvs izgriezums, velkot punktu (V forma), ar skaitlisku dziļuma un pozīcijas ievadi
- [ ] Posma push/pull (`Shift` + vilkšana) → taisnstūra niša vai izvirzījums
- [ ] Formu ielikumi: taisnstūris, trapece, trīsstūris, pusaplis, loka segments, brīva līnija (`UI.md` §4.6) ar priekšskatījumu
- [ ] Rediģējamas formu grupas (`Room.wallShapes`): parametru maiņa, pārvietošana pa sienu, dzēšana, "izjaukšana"
- [ ] Malas izliekšana (loks), stūru noapaļošana un nošķelšana
- [ ] Loku attēlošana, rokturi, izmēri (horda, bultas augstums, rādiuss) un piesaiste (centrs, viduspunkts, pieskare)
- [ ] Virsotnes dzēšana
- [ ] Sienu tabula (sinhronizēta ar zīmējumu, ar loka kolonnu), saslēgšanās kļūda
- [ ] Malu īpašības; šķēršļi (arī apaļi un ar lokiem); caurules; durvis
- [ ] Validācija ar paziņojumiem; undo/redo
- [ ] Playwright e2e (`UI.md` §11.6, 1.–5. scenārijs)

**Kritēriji:** 10 atsauces telpas (saraksts `instances/editor-refs.md`, tostarp ar pusapaļu erkeru, V izgriezumu un noapaļotu stūri) var ievadīt precīzi līdz mm bez precīzas peles lietošanas; katru ≤ 3 min; formu grupas pēc parametru maiņas saglabā pareizu ģeometriju; e2e zaļi.

## F9. Mērījumi (~3–4 d)

- [ ] `core/survey`: mērījumu tipi, Gauss–Newton/LM, atlikumi, brīvības pakāpju analīze ("vajag vēl N mērījumus")
- [ ] Mērījumu režīms UI ar atlikumu krāsām
- [ ] Loku mērījumi: horda + bultas augstums, trīs punkti; "pusapļa" pārbaude (dziļums pret platumu/2)
- [ ] Ordinātas no atskaites līnijas

**Kritēriji:** sintētiska telpa, kas nav taisnleņķa, no precīziem mērījumiem tiek rekonstruēta ar kļūdu < 0,5 mm; ar ±2 mm troksni un vienu kļūdainu mērījumu (+20 mm) tieši tas ir izcelts sarkanā krāsā.

## F10. Optimizācija lietotnē (~3 d)

- [ ] Worker pool ar Comlink, progress, atcelšana
- [ ] Aprēķina iestatījumu panelis (`UI.md` §7)
- [ ] B-INST uzreiz, SA fonā; LB un "Pierādīts minimums"
- [ ] Virzienu/konfigurāciju salīdzinājums ar sīkattēliem
- [ ] Rezultāta novecošana un automātisks pārrēķins

**Kritēriji:** 30 m² L telpa — pirmais rezultāts < 200 ms, SA rezultāts ≤ 5 s vidēja datorā; UI neaizķeras (ievade reaģē aprēķina laikā).

## F11. Rezultāti un izvades (~5–6 d)

- [ ] Plāna skats ar krāsotiem pāriem, marķējumiem, inspektoru, brīdinājumiem
- [ ] Griešanas kartes (SVG), atdura saraksts, "sagriezts" atzīmes
- [ ] Līkumoto griezumu sadaļa: ordinātu tabulas un 1:1 šabloni A4 lapās ar savietošanas zīmēm un kontrolizmēru
- [ ] Klāšanas secība pa rindām
- [ ] Materiāli: dēļi, pakas, rezerve, atgriezumi, izmantojamie atlikumi, cena
- [ ] Pielaides, pirmās rindas nospraušana, kontrolmērījumi
- [ ] Drukāšana (A4 print CSS), uzlīmju lapas, CSV, saite `#p=…`

**Kritēriji:** izdrukātais komplekts ir lietojams bez lietotnes — to pārbauda ar reālu klājēju (sk. "Lauka tests").

## F12. Klāšanas režīms telefonā (~2 d)

- [ ] Rindu stepper, "Gatavs", progress, Wake Lock, offline
- [ ] Mobilā izkārtojuma pārbaude (360 px platums)

**Kritēriji:** visu telpu var "noklāt" lietotnē ar vienu roku; progress saglabājas pēc lietotnes aizvēršanas.

### Lauka tests (pēc F11/F12)

Sadarbībā ar klājēju: viena reāla telpa → mērījumi → plāns → iepriekšēja griešana → klāšana. Pieraksta, kas nesakrita (mm), cik laika aizņēma griešana un klāšana, un ko klājējs gribētu citādi. Secinājumus pieraksta `DECISIONS.md`, telpu pievieno `instances/real/`.

---

## F13. Vairāku telpu projekti (~4–5 d)

- [ ] Vairākas telpas projektā; durvju savienojumi `continuous` / `profile`
- [ ] Grupas ar kopīgu (θ, y0); zonu apvienošana caur durvju ailām
- [ ] Kopīga atgriezumu krātuve (viens dekoders); atsevišķas krātuves dažādiem produktiem
- [ ] Maks. izmēru brīdinājumi un dilatācijas šuvju ieteikumi
- [ ] Instances `instances/multi/`

## F14. Precīzā griešana (~5–7 d)

- [ ] Slīpo gabalu precīzā pārošana pēc abām malām (pašu Hopcroft–Karp/Kuhn)
- [x] B.3: strēmeļu gabali no A posma atlikumiem (izpildīts F3, sk. ADR-013)
- [ ] Urbumu instrukcijas; neobligāta priekšroka šuvei caur caurules centru
- [ ] Fiksētā raksta režīms (1/2, 1/3) ar pilno pārlasi
- [ ] Hibrīdrežīms ar `trimMargin`
- [ ] Trauslu gabalu noteikšana un sods

## F15. Papildu materiāli (~3–4 d)

- [ ] Grīdlīstes: garumi no perimetra (bez durvīm), stūru griezumi, 1D griešana ar pašu dekoderu + SA/LAHC
- [ ] Pārejas profili, pamatne (ruļļi, pārlaide), izmaksu kopsavilkums

## F16. Izplatīšana (neobligāti)

- [ ] Tauri instalētājs (Windows/macOS)
- [ ] Capacitor (Android/iOS), ja būs vajadzība pēc lietotņu veikala

---

## Riski

| Risks | Mazināšana |
|---|---|
| Dekodera sarežģītība (strēmeles, robi) aizkavē kodolu | Posmi: vispirms taisnstūra ātrais ceļš un konservatīvi pieņēmumi; precizitāte F14 |
| Ģeometrijas deģenerēti gadījumi | Clipper, `EPS`, īpašību testi ar nejaušām telpām |
| Redaktora apjoms izplešas | Sagataves un skaitliska ievade pirms "skaistas" zīmēšanas |
| Modelis neatbilst realitātei | Lauka tests pēc F11; pielaides un hibrīdrežīms |
| Atskaite par plašu | 2–3 lpp. tikai par kodolu; lietotne — viena rindkopa |
