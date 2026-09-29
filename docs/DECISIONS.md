# DECISIONS.md — Lēmumu žurnāls (ADR)

Formāts: konteksts → lēmums → alternatīvas → sekas. Jaunus ierakstus pievieno beigās. Vecos nemaina; ja lēmums mainās, pievieno jaunu ierakstu ar atsauci.

---

## ADR-001 — Platforma: TypeScript web-first PWA (2026-09-29)

**Konteksts.** Produkts domāts klājējiem: plānošana datorā, izpilde uz objekta ar telefonu vai planšeti, bieži bez stabila interneta. Kursa kodolam jābūt pašu implementētam un ātram (SA ar 10⁵–10⁶ novērtējumiem).

**Lēmums.** Viena TypeScript kodu bāze:

- `@lp/core` — tīrs TS kodols;
- `@lp/web` — React PWA (instalējama, offline);
- `@lp/bench` — Node CLI eksperimentiem.

Aprēķini notiek klientā Web Worker. Serveris nav vajadzīgs.

**Alternatīvas.**

- Python + Qt/PySide: labs zīmēšanai, bet nav telefonā; smagi instalētāji; SA lēnāks.
- Python kodols + web priekšpuse: vajag serveri vai Pyodide (lēns, smags); divas valodas.
- Flutter: laba vairāku platformu UI, bet vājāka CAD tipa zīmēšanas ekosistēma; Dart kodols.
- .NET (MAUI/Avalonia/Blazor): iespējams, bet web un mobilās versijas ir sarežģītākas.

**Sekas.** Viena valoda visur; tūlītēja izplatīšana ar saiti; V8 pietiekami ātrs SA. Ja vajadzēs instalētāju vai lietotņu veikalu — Tauri/Capacitor bez koda pārrakstīšanas.

## ADR-002 — Ģeometrija: clipper2-ts (2026-09-29)

**Konteksts.** Vajag robustas daudzstūru Būla operācijas (zona, joslas, šķēršļi) un offset. Tā ir ģeometrija, nevis optimizācija, tātad kursa noteikumus neskar.

**Lēmums.** `clipper2-ts` (Angus Johnson Clipper2 TypeScript ports). Izmanto tikai caur adapteri `core/geometry/clip.ts`.

**Alternatīvas.** Pašu implementācija (liels kļūdu risks deģenerētos gadījumos); `polyclip-ts` (nav offset); `clipper2-wasm` (WASM ielāde workerī sarežģītāka).

**Sekas.** Atskaitē norāda, ka ģeometrijai izmantota bibliotēka, bet optimizācija ir pašu. Pirms publicēšanas pārbauda licenci (Clipper2 izmanto Boost Software License). Ja rodas šaubas, adapteri var aizstāt ar pašu joslu griešanu (josla ir izliekta, tāpēc pietiek ar Sutherland–Hodgman + komponenšu dalīšanu).

## ADR-003 — Domēns: šuvju fāzes + dekoders (2026-09-29)

**Konteksts.** Tieša gabalu piešķiršana dēļiem dod milzīgu domēnu ar daudziem nederīgiem stāvokļiem.

**Lēmums.** Risinājums ir fāžu vektors φ (viena vērtība katram segmentam). Gabalus un griešanas plānu deterministiski iegūst dekoders. SA optimizē φ.

**Alternatīvas.** Atgriezumu permutācija (grūti ievērot ģeometriju); tieša piešķiršana (liels, pārsvarā nederīgs domēns); ILP (aizliegts kā gatavs risinātājs, un slikti mērogojas ar nepārtrauktām fāzēm).

**Sekas.** Mazs domēns (n ≈ 15–150), vienmēr derīgi gabali (L_min pēc konstrukcijas), ātra novērtēšana, dabiski gājieni. Kvalitāte ir atkarīga no dekodera, tāpēc dekodera A posms ir pierādāmi optimāls, un B/C posmi tiek uzlaboti F14.

## ADR-004 — Noklusējuma režīms: iepriekšēja griešana ar globālu pārošanu (2026-09-29)

**Konteksts.** Produkta mērķis ir sagriezt visu pirms klāšanas. Tad atgriezumu var izmantot jebkurā rindā neatkarīgi no klāšanas secības.

**Lēmums.** `mode: precut` ir noklusējums. `mode: onsite` (atgriezums tikai vēlākām rindām) ir pieejams kā alternatīva un ir bāzes metodes pamatā.

**Sekas.** Eksperimentos var izmērīt, cik ietaupa tieši iepriekšēja griešana (SA-onsite pret SA-precut). Tas ir produkta galvenais arguments.

## ADR-005 — Vienības un noapaļošana (2026-09-29)

**Lēmums.** Iekšēji mm (float64, `EPS = 1e-6`). Ievade — veseli mm. Izvades griezumi — noapaļoti uz leju līdz 1 mm (gabals nekad nav garāks par vietu; < 1 mm absorbē sprauga). Clipper mērogs — 0,01 mm.

## ADR-006 — Ātrs novērtētājs + neatkarīgs validētājs (2026-09-29)

**Lēmums.** `evaluate` ir optimizēts ātrumam. `validate` pārbauda gatavo plānu no jauna tikai ar ģeometriju. Īpašību testi garantē, ka dēļu skaits `evaluate`, `plan` un `validate` sakrīt.

**Sekas.** SA var "uzticēties" ātrajam novērtētājam; kļūdas tiek atklātas testos, nevis pie klājēja.

## ADR-007 — Monorepo ar pnpm workspaces (2026-09-29)

**Lēmums.** `packages/core`, `packages/bench`, `apps/web`. Kodola tīrību uzrauga TypeScript `lib` iestatījumi un ESLint noteikumi.

## ADR-008 — Caurules kā pazīmes, nevis ģeometrija (2026-09-29)

**Konteksts.** Caurules caurumi padarītu segmentus "sarežģītus" un palēninātu novērtēšanu, bet dēļu patēriņu un profilus tie neietekmē.

**Lēmums.** Caurules neatņem no Z segmentu aprēķinā. Plāna konstruktors tās piesaista gabaliem kā urbumus; validētājs pārbauda to novietojumu.

## ADR-009 — Loki kā `bulge` malās, diskretizācija tikai kodola ieejā (2026-09-29)

**Konteksts.** Lietotājs sienās ievieto izgriezumus, pusapļus, loka segmentus un noapaļotus stūrus. Formām jāpaliek rediģējamām (mainīt diametru, dziļumu), un izmēriem jābūt precīziem.

**Lēmums.**

- Katrai malai ir neobligāts `bulge` (DXF konvencija). Pusaplis ir viena mala ar `bulge = ±1`, nevis desmitiem punktu.
- Kodols lokus pārvērš lauztā līnijā tikai `core/geometry/arcs` ar `ARC_TOL = 0,5 mm` un saglabā atsauci uz sākotnējo malu, lai atpazītu līkumotus griezumus.
- Ievietotās formas saglabā kā `Room.wallShapes` metadatus (parametri + virsotņu ID), lai tās varētu rediģēt pēc parametriem.

**Alternatīvas.** Lokus uzreiz glabāt kā lauztu līniju (vienkāršāk, bet nevar rediģēt rādiusu, un izmēri "izplūst"); pilns parametrisks CAD ar ierobežojumu risinātāju (pārāk sarežģīti šim produktam).

**Sekas.** Redaktors strādā ar lokiem (rokturi, izmēri, piesaiste centram un pieskarei). Kodols paliek daudzstūru pasaulē. Gabaliem pie lokiem ir `curveCut` pazīme: figūrzāģis, ordinātas un 1:1 šablons. Pēc noklusējuma tos iesaka griezt uz vietas, jo liektas sienas reti ir precīzas.

## ADR-010 — Repozitorija rīki: MIT, TypeScript 6, `main` (2026-09-29)

**Konteksts.** F0 fāzē jāizvēlas licence un rīku versijas.

**Lēmums.**

- Licence **MIT**. `clipper2-ts` (Boost Software License) ar to ir saderīga; pirms instalēšanas F1 fāzē licenci pārbauda vēlreiz (sk. ADR-002).
- **TypeScript 6.x**, nevis 7: `typescript-eslint` 8.70 vēl neatbalsta TS 7 un ESLint krīt. Uz TS 7 pāriet, kad `typescript-eslint` to atbalsta.
- Noklusējuma zars ir `main`. `.gitattributes` fiksē `eol=lf`, lai Prettier nekrīt Windows vidē.
- Stop hook izsauc `pnpm run <skripts>`: pnpm 12 nepieņem `pnpm -s` kā klusuma karogu.

## ADR-011 — Ģeometrijas pamati (F1) (2026-09-29)

**Konteksts.** F1 izveido `num → rng → geometry`. `geometry` nedrīkst importēt `model` (tas nāk F2), bet zonas aprēķinam vajag ievadi.

**Lēmumi.**

- **PRNG:** pašu xoshiro128** ar splitmix32 sēklošanu; `fork(seed, i)` dod neatkarīgas plūsmas. Pārbaudīts pret atsauces pirmo izvadi stāvoklim {1,2,3,4} (11520).
- **`ZoneInput`:** zonas ievade ir ģeometrijas līmeņa tips (`outline`, `edges[].gap/bulge`, šķēršļi, durvju ailas), nevis `Room`. F2 to aizpildīs no modeļa. Kontūrai jābūt CCW (citādi izņēmums), šķēršļus normalizē uz CCW.
- **Offset:** katras malas taisne nobīdīta par `g_e`; virsotne ir blakus taisņu krustpunkts (miter). Ja miter garums pārsniedz `1/sin 15°` reizes spraugu (iekšējais leņķis < 30°) vai malas ir paralēlas ar dažādām spraugām, virsotne kļūst par diviem punktiem (bevel) un tiek izdots brīdinājums `sharpCorner`. Paššķērsojumus tīra `union` ar `FillRule.Positive`. Miter reflekso stūru vietā dod kvadrātisku, nevis noapaļotu izgriezumu (konservatīvi: grīda paliek tālāk no sienas).
- **Precīza kontrole:** taisnleņķa daudzstūrim ar vienādu spraugu `A′ = A − g·P + 4g²`; izliekta daudzstūra gadījumā `A′ = A − g·P + g²·Σ tan(τᵢ/2)`. To izmanto īpašību testos.
- **Apaļas kolonnas** šķērslim izmanto apvilkto (`circumscribed`) daudzstūri, lai tas satur īsto apli. Kontūras loki ir ierakstīti (`inscribed`), novirze ≤ `ARC_TOL`.
- **Durvju aila (DOMAIN B5) — pieņēmums.** DOMAIN precīzi neapraksta ģeometriju. Zonai pievieno taisnstūri uz āru no malas: platums `width + 2·jambUndercut`, dziļums `depth`, iekšpusē 1 mm aiz spraugas robežas, lai apvienošana būtu tīra. Ja izrādīsies citādi, maina tikai `doorwayShape` failā `geometry/zone.ts`.
- **`CLIPPER_SCALE = 100`** (0,01 mm); mērogošana tikai `geometry/clip.ts`. Rezultāti tiek noapaļoti uz šo režģi. Sekas: nobīdītām slīpām sienām ar iracionālu virzienu (piem., trapece ar kājām √10) laukuma kļūda ir līdz perimetrs × 0,005 mm (trapecei ~5,5 mm², robeža ~72 mm²), nevis ±0,5 mm². Izvēlēts saglabāt režģi (0,01 mm) un pielaidi saistīt ar to, nevis palielināt `CLIPPER_SCALE` (drošais koordinātu diapazons JS skaitļiem ~90 m). Taisnleņķa un racionāliem virzieniem laukums paliek precīzs ±0,5 mm². Praktiski: 5 mm² uz 12 m² ir 5·10⁻⁵ %; dēļu skaitu tas neietekmē.
- **Apaļu šķēršļu apvilktais daudzstūris** pieskaras aplim malu viduspunktos, tāpēc tam pieskaita vienu režģa soli rezerves, lai aplis paliek iekšā arī pēc noapaļošanas.
- **`sourceEdge` pēc Clipper:** `arcs` saglabā `sourceEdge`/`fromArc` katrai diskretizētajai malai. Atjaunošana pēc Clipper operācijām (gabala malas līkumotības noteikšana) netiek darīta F1, jo to pirmo reizi vajag F3 `curveCut`. Tur to veic ģeometriski (galapunkti uz koncentriskā loka rādiusā r ± g ar `ARC_TOL` toleranci).
- **Licence:** `clipper2-ts` 2.0.1-18 ir BSL-1.0 (Boost), saderīga ar MIT; pakotnes `LICENSE` fails pārbaudīts.
