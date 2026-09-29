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

- [ ] `plan`: A posms (`maxPairs`), B posms (B.1, B.2), C posms (best fit), atlikumu krājums ar profilu karogiem, `Plan` ar `placements`
- [ ] `geometry/zone`: `sourceEdge` atjaunošana pēc Clipper operācijām (atlikta no F1, ADR-011): zonas malām jānorāda, kura sākotnējā loka mala tās ir, ģeometriski (galapunkti uz koncentriskā loka r ± g ar `ARC_TOL`); kritērijs — pusapaļa erkera zonā visas loka malas atpazītas, taisnās nav
- [ ] `plan`: gabalu pazīmes — slīpi griezumi, robi, strēmeles pēc sienas, līkumoti griezumi (`curveCut` ar ordinātām); caurules → `drill`
- [ ] `plan/onsite`: secīgais dekoders (`ALGORITHM.md` §4.5)
- [ ] `evaluate`: f(φ) — B (bez objektiem), V (ātrais + precīzais ceļš), H, R, N; derīgums
- [ ] `bounds`: LB0, LB1 (ar lūzumpunktiem)
- [ ] `validate`: visas §11 pārbaudes, pārkāpumu kodi
- [ ] `cutlist`: griešanas secība katram dēlim (garengriezumi, tad šķērsgriezumi), atdura grupēšana, klāšanas secība pa rindām, marķējumi; izvades izmēri ar stingru `Math.floor` (`num.floorMm` pieļauj +1e-6 mm, sk. ADR-011), lai gabals nekad nav garāks par vietu
- [ ] `render/svg`: telpa + plāns + marķējumi kā SVG teksts

**Kritēriji:**

- vienībtests: `maxPairs` sakrīt ar pilno pārlasi (visas pārošanas) nejaušām mazām kopām (n ≤ 8);
- īpašību tests (nejaušas telpas × nejaušas φ ∈ F): `evaluate.B === plan.boards.length === validate.boards`; validētājs neziņo pārkāpumus, izņemot nobīdi, ja V > 0; `LB ≤ B`;
- V = 0 ⇔ validētājs neziņo par nobīdi;
- ar roku pārbaudīts SVG trim instancēm (taisnstūris, L, trapece).

## F4. Bāzes metodes, CLI, vizualizācija (~2–3 d)

- [ ] `optimize/baselines`: B-NEXT, B-INST, RS, HC
- [ ] `bench` CLI: `run <instance> --method … --seed … --iters … --time … --out … --svg`
- [ ] `bench` CLI: `validate <plan.json>`, `lb <instance>`
- [ ] Rezultātu formāts: JSON (plāns + statistika) un SVG

**Kritēriji:** visas metodes uz visām esošajām instancēm dod validētāja pārbaudītus plānus; B-INST ≤ B-NEXT visām instancēm (ja nē — izskaidrot); SVG izskatās pareizi (pārbauda cilvēks).

## F5. SA un ārējā cilpa (~4–5 d)

- [ ] `optimize/moves`: M1–M5, gājienu statistika
- [ ] `optimize/sa`: kalibrācija, grafiks (iterāciju un laika režīms), labākais derīgais, apstāšanās pie LB, neobligātā pārkarsēšana
- [ ] `optimize/outer`: θ kandidāti, sākuma puse, y0 skenēšana ar filtru, top-K, budžeta sadale, salīdzinājuma tabula
- [ ] Parametru pielāgošana nelielā eksperimentā (p0, gājienu varbūtības); rezultātu pieraksta `DECISIONS.md`
- [ ] (Neobl.) LAHC ar tiem pašiem gājieniem

**Kritēriji:**

- SA ≤ visas bāzes metodes visām instancēm (vidēji pa sēklām);
- plantētajām instancēm P1–P4 SA atrod optimumu ≥ 90 % sēklu ar 200 000 iterāciju budžetu;
- novērtētājs ≥ 100 000 novērtējumu/s pie 60 segmentiem (`pnpm bench perf`);
- viena sēkla → identisks rezultāts (determinisms iterāciju režīmā).

## F6. Eksperimenti un kursa atskaite (~4–5 d) — **kursa nodevums**

- [ ] `bench generate`: plantētais ģenerators (kāpņu + bloku variants), pierādījuma pārbaude (`B* = LB1`)
- [ ] `bench exhaustive`: pilnā pārlase tiny instancēm
- [ ] Pilns instanču komplekts (`ALGORITHM.md` §13.1), `meta.knownOptimum` / `meta.bestKnown`
- [ ] `bench all`: visi eksperimenti → `results/raw/*.jsonl`, `results/summary.csv`
- [ ] Grafiki G1–G3 (+ G4/G5, ja ir) → `results/plots/*.svg` (Vega-Lite)
- [ ] `report/` Typst atskaite (2–3 lpp., struktūra zemāk) → PDF
- [ ] Publisks GitHub repozitorijs; git tag `v0.1-kurss`

**Kritēriji:** `pnpm bench all` no tīra klona atkārto visas tabulas; PDF satur visas četras prasītās sadaļas un saiti uz repozitoriju.

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
- [ ] B.3: strēmeļu gabali no A posma atlikumiem
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
