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
- **Offset:** katras malas taisne nobīdīta par `g_e`; virsotne ir blakus taisņu krustpunkts (miter). Ja miter garums pārsniedz `1/sin 15°` reizes spraugu vai malas ir paralēlas ar dažādām spraugām, virsotne kļūst par diviem punktiem (malu nobīžu galapunkti); paššķērsojumus tīra `union` ar `FillRule.Positive`. **Miter garumam nav cietas robežas:** izliektā asā stūrī (iekšējais leņķis < 30°) miter smaile ir precīzs iekšējais offset un paliek pēc tīrīšanas (pārbaudīts ar šauru ķīli pret analītisko laukumu). Brīdinājums `sharpCorner` tiek izdots, ja pagrieziena leņķis pārsniedz 150° (`angleDeg` < 30° izliektam vai > 330° ieliektam stūrim) un pretparalēlām malām (`angleDeg` = 0); paralēlām malām ar dažādām spraugām (pakāpiens) brīdinājuma nav. Ieliekto asu stūru un pretparalēlu malu uzvedība nav pārbaudīta ar analītisko laukumu. Miter ieliektos stūros dod kvadrātisku, nevis noapaļotu izgriezumu (konservatīvi: grīda paliek tālāk no sienas). Dublētas kontūras virsotnes (nulles garuma mala) ir kļūda (`RangeError`).
- **Precīza kontrole:** taisnleņķa daudzstūrim ar vienādu spraugu `A′ = A − g·P + 4g²`; izliekta daudzstūra gadījumā `A′ = A − g·P + g²·Σ tan(τᵢ/2)`. To izmanto īpašību testos.
- **Apaļas kolonnas** šķērslim izmanto apvilkto (`circumscribed`) daudzstūri, lai tas satur īsto apli. Kontūras loki ir ierakstīti (`inscribed`), novirze ≤ `ARC_TOL`.
- **Durvju aila (DOMAIN B5) — pieņēmums.** DOMAIN precīzi neapraksta ģeometriju. Zonai pievieno taisnstūri uz āru no malas: platums `width + 2·jambUndercut`, dziļums `depth`, iekšpusē 1 mm aiz spraugas robežas, lai apvienošana būtu tīra. Ja izrādīsies citādi, maina tikai `doorwayShape` failā `geometry/zone.ts`.
- **`CLIPPER_SCALE = 100`** (0,01 mm); mērogošana tikai `geometry/clip.ts`. Rezultāti tiek noapaļoti uz šo režģi. Sekas: nobīdītām slīpām sienām ar iracionālu virzienu (piem., trapece ar kājām √10) laukuma kļūda ir līdz perimetrs × 0,005 mm (trapecei ~5,5 mm², robeža ~72 mm²), nevis ±0,5 mm². Izvēlēts saglabāt režģi (0,01 mm) un pielaidi saistīt ar to, nevis palielināt `CLIPPER_SCALE` (drošais koordinātu diapazons JS skaitļiem ~90 m). Taisnleņķa un racionāliem virzieniem laukums paliek precīzs ±0,5 mm². Praktiski: 5 mm² uz 12 m² ir 5·10⁻⁵ %; dēļu skaitu tas neietekmē.
- **Apaļu šķēršļu apvilktais daudzstūris** pieskaras aplim malu viduspunktos, tāpēc tam pieskaita vienu režģa soli rezerves, lai aplis paliek iekšā arī pēc noapaļošanas.
- **`sourceEdge` pēc Clipper:** `arcs` saglabā `sourceEdge`/`fromArc` katrai diskretizētajai malai. Atjaunošana pēc Clipper operācijām (gabala malas līkumotības noteikšana) netiek darīta F1, jo to pirmo reizi vajag F3 `curveCut`. Tur to veic ģeometriski (galapunkti uz koncentriskā loka rādiusā r ± g ar `ARC_TOL` toleranci).
- **Piezīmes nākamajām fāzēm.** (1) `applyToPolygon` (`frames`) apgriež virsotņu secību spoguļošanas gadījumā, bet nepārveido `bulge`; to drīkst lietot tikai uz jau diskretizētiem daudzstūriem (loki tiek diskretizēti pirms pārveidojumiem). (2) `floorMm(x) = floor(x + EPS)` pieļauj gabalu līdz 1e-6 mm garāku par vietu; šī novirze ir zem ražošanas precizitātes, bet CLAUDE.md prasa "nekad garāks", tāpēc izvades slānī (F3 `cutlist`) jāapsver stingrs `Math.floor`. (3) `createRng(seed)` reducē sēklu ar `>>> 0`, tātad sēklas 2³² un 0 sakrīt; bench jāizmanto sēklas [0, 2³²).
- **Licence:** `clipper2-ts` 2.0.1-18 ir BSL-1.0 (Boost), saderīga ar MIT; pakotnes `LICENSE` fails pārbaudīts.

## ADR-012 — Modelis un izkārtojuma slānis (F2) (2026-09-29)

**Konteksts.** F2 uzbūvē projekta modeli un `layout` slāni (joslas, segmenti, kaimiņi, x-profils, gabali no fāzes φ, pieļaujamās fāzes F_s), uz ko balstīsies dekoders (F3) un SA (F5).

**Lēmumi.**

- **Modelis = zod shēmas.** `model/schema.ts` ir patiesības avots, TS tipi ir `z.output`; noklusējumus aizpilda shēma (vērtības no DOMAIN §5). Ielāde: `migrate` (`schemaVersion`) → zod → `checkProjectIntegrity` (kļūdas mēta `ProjectError` ar visām problēmām). `saveProject` raksta kanonisku JSON (shēmas atslēgu secība); instanču faili glabājas šādā formā, un tests pārbauda, ka `saveProject` tos atražo burtiski. `instances/` ir izslēgts no Prettier, lai kanoniskā forma nemainītos.
- **Joslas.** Robežas ir režģis `y0 + k·W`; `y0` noapaļo uz Clipper režģi (0,01 mm), lai horizontālās malas sakristu ar joslu robežām. Josla j tiek numurēta no pirmās joslas, kurā ir zona (režģa, ne tukšo joslu skaita, nozīmē: iekšēja tukša josla saglabā numerāciju). Segmenta ID = joslas nr. + burts pēc x (`1a`, `1b`, …). Durvju aila var pievienot papildu rindu (L1: zona sniedzas līdz y = −120).
- **Kaimiņi.** `I_st` = pārklājums starp s augšmalas un t apakšmalas horizontālajām malām uz `y = β_{j+1}`. Malas atpazīst pēc virziena (iekšpuse pa kreisi: apakšmala iet uz +x, augšmala uz −x). Pārklājumi < EPS netiek skaitīti. Otrās kārtas pāri (s, u caur t) — H sodam.
- **x-profils** (`XProfile`): šķērsgriezumi kā lineāras funkcijas starp virsotņu x. `isRect` = taisnstūris bez cauruma ar atvērtajām malām „visā garumā vai nemaz”; `complex` = kādā x šķērsgriezumā > 1 intervāls.
- **Gabali no φ.** Šuve pie sienas nav šuve. Ātrais ceļš (`isRect`) un vispārīgais ceļš dod identiskus deskriptorus (tests). **Atkāpe no ALGORITHM §2.5:** vispārīgais ceļš arī `complex` segmentiem rēķina deskriptorus no šķērsgriezumiem (platums = ekstrēmi pār visiem intervāliem), nevis ar Clipper; Clipper paliek `pieceShapes` (precīza forma) un kā testa orākuls. Iemesls: ātrums un viens kods visiem segmentiem, jo F_s skenēšana izsauc to ~L reižu uz segmentu.
- **L_min noteikums (precizē §3.2 un §3.4).** Sākuma/beigu gabalam katrai atvērtai garajai malai atvērtās daļas garums ≥ L_min; ja atvērtu malu nav, `extent ≥ L_min`. Tas sakrīt ar §3.4 taisnstūrim un ir fiziski konservatīvs slēgtiem segmentiem (skapji, nišas).
- **F_s.** Taisnstūrim analītiski (tests pret brutālu pārlasi); pārējiem 1 mm skenēšana ar galapunktu bisekciju no derīgās puses (konservatīva). Ja F_s tukša — visa [0, L) un `relaxed = true`. Skenēšana var neredzēt logus < 1 mm.
- **Durvju ailas** tiek pievienotas zonai visiem `mode` (`continuous` un `profile`); atšķirība nāk ar F13.
- **Režģa troksnis (pēc F2 pārskata).** Segmenti tiek griezti neatkarīgi un noapaļoti uz 0,01 mm režģi, tāpēc slīpām/līkām sienām, kas tikai pieskaras joslas līnijai, var rasties viltus pārklājums vai plāna sloksne. Tāpēc atvērta mala ir tikai pārklājums ≥ `MIN_OPEN_LENGTH` = 2 režģa soļi (0,02 mm; `neighbors`, `pieces`), un segments, kas zemāks par 2 režģa soļiem, tiek atmests (`bands`). Ātrais ceļš ņem to pašu slieksni katram gabalam.
- **L_min ar vairākiem atvērtiem posmiem.** Ja gabala atvērtā mala sastāv no vairākiem atdalītiem posmiem (piem., U formas segments zem divām blakus rindām), L_min tiek salīdzināts ar to kopējo mēru, nevis ar katru posmu. Apzināts vienkāršojums: tas atbilst `openLow`/`openHigh` un ātrajam ceļam; stingrāka "katrs posms" interpretācija var tikt pievienota vēlāk, ja praksē vajadzēs.
- **Veseli mm izmēri.** `boardLength` un `boardWidth` shēmā ir veseli skaitļi (CLAUDE.md #3); koordinātēm daļskaitļi paliek atļauti.
- **Neatkarīgs orākuls.** Testi `layout/fixtures/oracle.ts` rēķina gabalu atvērtos garumus no Clipper gabalu formām un kaimiņu segmentu īstajām malām (bez `describePieces`); ar to pārbauda `openLow/openHigh` un „φ ∈ F_s ⇒ L_min” arī vispārīgajam ceļam (nevis tikai ar to pašu predikātu, ar kuru skenē).
- **Zināmi ierobežojumi.** (a) `sample` neizvēlas izolēto punktu `[0, 0]` (bez šuves, viens `free` gabals), jo tā mērs ir 0; F5 SA sākuma risinājumam un gājieniem to jāņem vērā (`contains`/`project` to sasniedz). (b) Modelis neprasa veselus mm (`z.number()`), jo loku un slīpumu koordinātes var būt daļskaitļi; veselo mm prasību (CLAUDE.md #3) nodrošina redaktors (F8). (c) Slīpu segmentu „gabali klāj bez sprauga” tests izmanto režģa pielaidi (0,005·L·2 uz šuvi), tāpēc nemana < ~10 mm² spraugas; taisnleņķa segmentiem pielaide ir 0,02 mm². (d) Durvju integritāte pārbauda arī vienas malas savienojumu ar sevi un pārklājošās ailas.
- **Neatrisināts / vēlāk:** (1) `extent` pārošana slīpiem/`complex` segmentiem var būt aptuvena (F14); (2) `sourceEdge` atjaunošana pēc Clipper (F3); (3) daļēji atvērtas malas (pārklājums ne visā garumā) noved segmentu uz vispārīgo ceļu, kas ir lēnāks, bet pareizs.

## ADR-013 — Dekoders, novērtētājs, robežas, validētājs, griešanas saraksts (F3) (2026-09-29)

**Konteksts.** F3 uzbūvē visu, kas no fāzēm φ dod dēļu skaitu un plānu, un neatkarīgu pārbaudi. Galvenais risks ir CLAUDE.md 5. noteikums: `evaluate.B === plan.boards.length === validate.boards`.

**Lēmumi.**

- **Viens dekodera kodols.** `evaluate` un `buildPlan` izsauc vienu un to pašu `decodeLabelled` (`plan/run.ts`), tāpēc B sakrīt pēc konstrukcijas. Ātrā typed-array versija (≥ 100 000 nov./s) ir F5 uzdevums ar tiem pašiem ekvivalences testiem; ROADMAP F3 formulējums "bez objektiem" tika precizēts.
- **Dekodera modelis.** Katrs dēlis ir taisnstūris L × W; A un B posmu visi gabali ir "joslas" (strips), un atlikumi ir taisnstūri ar profilu karogiem `left/right/low/high` (kuras malas ir dēļa oriģinālās). C posms un secīgais dekoders izmanto vienu best-fit funkciju (`placeBestFit`). Pārošana slīpiem gabaliem pēc `extent` (konservatīvi, precīzā ir F14).
- **Validētājs ir neatkarīgs.** Tas pārrēķina zonu no `Project` (Room→ZoneInput kartējums atkārtots tīši, tests pārbauda sakritību) un savienojumus, šuves un `I_st` nolasa no gabalu precīzajām formām, izmantojot `Plan.frame`. Dēļa forma tiek pārbaudīta kā tīra pārbīde (bez rotācijas).
- **Šuvju nobīde.** Konflikts, ja abas šuves ir `I_st` paplašinātā par D un `|x − x′| < D` (ALGORITHM §5). Validētājs izmanto pielaidi 0,01 mm (Clipper režģis), tāpēc `V = 0 ⇔` nav `stagger` pārkāpuma var atšķirties tikai šaurā logā ap `D`. Tests to pārbauda ar nejaušām un ar mērķtiecīgi sašķeltām φ.
- **Clipper režģa pielaide** 0,01 mm gabalu formu un dēļa taisnstūra salīdzinājumā (novirze līdz ~0,005 mm arī taisnstūrī, jo šuves ir patvaļīgi float).
- **LB1** tiek rēķināts pa kandidātlīmeņiem (virsotņu augstumi, 0, W) ar slēgtām kopām; griesti atlaiž režģa troksni (0,01 mm × segmentu skaits), lai robeža nekad nepārsniegtu patieso vērtību. Taisnstūriem sakrīt ar slēgto formulu astoņiem y0.
- **Dēļa forma bez rotācijas.** Validētājs pārbauda arī `Plan.frame`: tai jābūt rotācijai/spoguļošanai, un, ja projekts fiksē virzienu un pusi, tieši tai, ko tie nosaka. Rindas un šuves validētājs atvasina no ģeometrijas (vertikāla kopīga mala = viena rinda, horizontāla = blakus rinda), nevis no plānotāja `segmentId`/`band`.
- **Marķējumi** pēc DOMAIN §10 (`S`, `B`, `NN`, segmenta burts tikai ar vairākiem segmentiem). Sākotnējā realizācija (`E`, `M<n>`) nesakrita ar DOMAIN un tika izlabota.
- **Griešanas saraksts.** Dēļa novietojumi ir guillotine izkārtojums: rekursīvi vispirms garengriezumi, tad šķērsgriezumi; visi izmēri `Math.floor`. Katra gabalu grupa tiek mērīta no sava apgabala sākuma ("sablīvēta"), citādi šaurs atlikums starp gabaliem dod negatīvu griezumu (regresijas tests).
- **ESLint labojums (F0 kļūda).** Validētāja noteikuma `group` raksts `'..'` (gitignore semantika) sakrita ar jebkuru `../…` importu, tāpēc `validate/` nevarēja importēt `geometry` un `model`. Aizstāts ar precīziem `paths` un `regex`; pārbaudīts ar tīšiem pārkāpumiem.

- **Griešanas saraksta stingrais noteikums (CLAUDE.md 3.).** Gabals nekad nav garāks par vietu. Gabals, kas tur dēļa augšējo/labo profilēto galu, tiek mērīts no šīs malas (tā nekad netiek nogriezta); ja materiāls tā priekšā ir garāks par gabalu, priekšpuse tiek nogriezta (vismaz viena zāģa griezuma platumā). Ja e + s + k = L precīzi un garumi ir daļskaitļi (slīpas sienas vai daļskaitļu φ), šis izmaksā līdz `k` mm īsāku gabalu (piem., 538,1 vietā 536); ar veseliem mm garumiem (taisnstūra telpa, veseli φ) nezaudē neko. **Ieteikums F5:** SA/M2/M4 φ jāierobežo uz veseliem mm taisnleņķa segmentiem. Sākotnējā realizācija mērīja visu no apakšējās/kreisās malas, un reviewer (F3) atrada, ka tā nogriež profilu vai iznāk līdz 1 mm par garu; pirmie testi to nenoķēra, jo salīdzināja ar pašu palielināto `space`.
- **LB1 pieskārienlīmenis.** Kopas tiek saraustas par 1e-6 mm, lai pie `kerf = 0` un `a + b = W` abas malu strēmeles nesaskaitītos vienā līmenī (LB būtu virs optimuma; tests to noķer: 50 pret 47). Derīga pie jebkura kerf; ar kerf > 0 var vēl nedaudz saasināt (`a + b + k ≤ W`).
**Atklājumi un zināmie ierobežojumi.**

- **B.3 velkts uz priekšu no F14 uz F3 (lēmums pēc F3 mērījuma).** Bez B.3 iepriekšējā griešana bieži deva vairāk dēļu nekā secīgais dekoders (R1 112/200, S2 161/200 φ; ALGORITHM §4.2), jo strēmeles nevarēja izmantot A posma atlikumus. Tas būtu salauzis F5 kritēriju "SA ≤ bāzes metodes" (B-INST ir secīgs) un kursa atskaites tēzi par iepriekšējas griešanas vērtību. Realizēts `tryPlaceInStock` pirms B.1; ar to vidējais B ir mazāks `precut` režīmā visās 8 instancēs (pārkāpumi R1 18/200, S2 17/200). `B_onsite ≥ B_precut` vispārīgi joprojām nav garantēts (pierādīts un testēts tikai tīrai pilna platuma klasei).
- **y0 netiek filtrēts** (F5 ārējā cilpa): plāns ar nelabvēlīgu y0 var pārkāpt `w_min`; validētājs to ziņo. Testos izmanto `goodY0`.
- **Apaļas kolonnas** caurums gabalā šobrīd bez pazīmes (`cutout`); `curveCut` ir tikai kontūras lokiem (`sourceEdge`). Pirmās/pēdējās joslas gabaliem, kur loks pieskaras horizontālei, `curveCut` mala var būt `low`/`high`.
- `w_min` validētājs pārbauda tikai asīm paralēlas strēmeles (slīpas sienas strēmeles ir scribe).
- Reviewer (F3, opus) atrada 2 KRITISKUS un 3 SVARĪGUS jautājumus (griešanas saraksts ×2, LB1 pie kerf = 0, validētāja atkarība no plānotāja `segmentId`/`band`/`frame`, `esbuild` vietturis `pnpm-workspace.yaml`); visi izlaboti. `esbuild` `allowBuilds: false` (tsx un Vitest strādā bez tā uzstādīšanas skripta).
- Nejaušās telpas integrācijas testā ir tikai taisnleņķa "histogrammas" ar noklusējuma kerf un tikai `precut` režīmu; slīpas sienas, loki un šķēršļi ir tikai fiksētajās instancēs. Plašāks ģenerators — F5/F6.
- Validētājs un V atšķiras logā [D − 0,01; D) mm (režģa pielaide); `V = 0 ⇔` ir precīzs ārpus šī loga.
- Sarežģītu segmentu gabalam var būt vairākas komponentes (`PlannedPiece.parts`); dekoderā tas ir viens taisnstūris.

## ADR-014 — Bāzes metodes, CLI un rezultātu formāts (F4) (2026-09-29)

**Konteksts.** F4 dod metodes, ar kurām F5 SA tiks salīdzināts (B-NEXT, B-INST, RS, HC), un `bench` CLI.

**Lēmumi.**

- **B-INST/B-NEXT konstruē tikai φ.** Atlikumu kaudžu simulācija (`optimize/baselines/sequential.ts`) izvēlas φ_s klāšanas secībā; dēļu skaitu vienmēr mēra īstais secīgais dekoders (`evaluate`, `mode: onsite`). Tā B sakrīt ar plāna konstruktoru un validētāju pēc konstrukcijas (5. noteikums), un simulācijas neprecizitāte nevar dot nepareizu skaitli. Atkāpe no §9 pseidokoda: segments bez apakšējā kaimiņa (kolonnas apvidus, U telpas otrā kāja) arī var izmantot `stackS` atgriezumu, ne tikai vesela dēļa sākumu.
- **`SearchResult.mode`.** Katrs rezultāts nes dekodera režīmu, kuram B attiecas (B-* vienmēr `onsite`; RS/HC — `settings.mode`, pēc noklusējuma `precut`); plānu būvē ar to pašu režīmu. **Tabulā B-NEXT/B-INST (onsite) un RS/HC (precut) nav tieši salīdzināmi** — tāpēc `baselines` rāda arī `B-INST/pc` (tie paši φ ar precut dekoderu); HC (sāk no B-INST φ) ir ≤ `B-INST/pc`, nevis ≤ B-INST(onsite). Tas sakrīt ar F5 kritēriju: SA(precut) salīdzina ar B-INST kā iepriekšējās griešanas ieguvumu (G3).
- **CLI izejas kodi:** 0 — kārtībā; 1 — plānam ir pārkāpumi (`validate`, `baselines`); 2 — lietošanas, I/O, parsēšanas vai budžeta kļūda. `baselines` skaita arī `validator.boards ≠ B` kā kļūdu (5. noteikums) un vienas instances kļūme nepārtrauc tabulu. `Budget` met kļūdu, ja `timeMs` bez `clock`.
- **HC izmanto tikai M1 Reset un M2 Shift** (`optimize/moves.ts`); F5 pievieno M3–M5. Ja HC gājienu kopa F5 mainīsies, HC rezultāti jāpārrēķina. HC sāk no B-INST φ un restartē no nejaušiem φ pēc 2000 neuzlabojošiem novērtējumiem.
- **RS/HC labākais derīgais** pēc (derīgums, B, f); ja derīga nav, atgriež labāko pēc f (CLI tabulā ar `*`).
- **`goodY0`** pārcelts no testu palīgfailiem uz `layout/y0.ts` (nevis `optimize/`, jo tas ir `layout` slāņa funkcija: atkarību virziens); lieto CLI, testi un vēlāk F5 `outer`. Filtrs nemainīts.
- **Budžets:** `iters` (deterministisks) vai `timeMs` ar padotu `clock` (kodols nelieto sistēmas laiku); `Budget` lasa pulksteni ik pēc 256 novērtējumiem.
- **Rezultāta JSON ir pašpietiekams** (`project` + `plan` + `stats`), lai `validate` darbotos bez instances faila. Bez jaunām atkarībām (`node:util parseArgs`).
- **`pnpm bench` un ceļi.** `pnpm -F` izpilda komandu pakotnes mapē, tāpēc `index.ts` pārslēdzas uz `INIT_CWD`, un relatīvie ceļi ir no vietas, kur palaists pnpm.

**Mērījums** (`pnpm bench baselines instances`, sēkla 1, 2000 novērtējumi RS/HC; y0 = `goodY0`; `*` = V > 0):

| instance | segm. | LB | B-NEXT | B-INST | RS | HC |
|---|---|---|---|---|---|---|
| C1 | 16 | 64 | 68 | 68 | 67* | 66 |
| C2 | 20 | 66 | 68 | 68 | 70* | 67 |
| L1 | 25 | 85 | 94 | 89 | 88* | 87 |
| U1 | 34 | 78 | 89 | 89 | 82* | 81 |
| R1 | 21 | 49 | 49 | 49 | 52* | 49 |
| R2 | 27 | 81 | 91 | 86 | 84* | 84 |
| S1 | 16 | 50 | 53 | 52 | 52* | 52 |
| S2 | 11 | 34 | 40 | 37 | 37* | 38 |

B-INST ≤ B-NEXT visām 8 instancēm (C1, C2, U1, R1 vienādi). RS gandrīz nekad neatrod derīgu (V = 0) φ ar 2000 novērtējumiem, tāpēc tā B nav salīdzināms ar derīgajiem (B-*, HC); tas ir pats par sevi atklājums par nobīdes nosacījuma stingrību, un F5 salīdzināšanā RS jāuzrāda kopā ar derīgo sēklu īpatsvaru.

**Zināmie ierobežojumi.**

- Baseline φ ir float; ADR-013 ieteikums par veseliem mm (M2/M4) paliek F5 uzdevums.
- B-INST atlikumu izvēle ir vienkāršota (kaudzes ar garumiem, bez profilu/platuma karogiem); tā ir bāzes līnija, nevis "labākā klājēja metode".

## ADR-015 — Plantētais ģenerators un instances P1–P4 (F5, velkts uz priekšu no F6) (2026-09-30)

**Konteksts.** F5 kritērijs prasa, lai SA atrod P1–P4 optimumu ≥ 90 % sēklu, bet ģenerators bija F6 uzdevums. Lietotājs apstiprināja kāpņu ģeneratora vilkšanu uz priekšu; bloku variants, pilnā pārlase un P5–P6 paliek F6.

**Atklājums: §12.2 pseidokods nav lietojams burtiski.** Nejauša permutācija un neatkarīgas rindas nedod derīgu instanci (mēģināts; gandrīz visi mēģinājumi krīt). Iemesli, kas izriet no modeļa:

1. **Pirmā un pēdējā rinda** pieskaras sienai ar vienu garo malu, tāpēc to gabali ir strēmeles (`K_high`/`K_low`) un pārojas tikai savā starpā. π tās atstāj uz vietas (rinda pārojas pati ar sevi: `e + s + k = L`).
2. **L_min un gabala klase tiek mērīti gar *atvērto* garo malu.** Ja rinda pārkaras pāri kaimiņam, beigu gabals zaudē (daļu no) atvērtās malas, maina klasi (`both` → `low`/`high`) vai krīt zem L_min, un pārošana sabrūk. Tāpēc blakus rindu garumu starpība nedrīkst pārsniegt `e − L_min` (garākās rindas beigu gabala pārklājums ar īsāko ≥ L_min).
3. **Nobīde D** starp blakus rindu šuvēm. Ja pārī ir blakus rindas, |s_a − s_b| ≥ D un tāpēc garumi atšķiras par simtiem mm; pēc 2. punkta tas nav savienojams.

**Lēmums.** Vidējās rindas veido blokus pa četrām (`r..r+3`), π apmaina rindas, kas ir *divu attālumā*: `(r r+2)(r+1 r+3)`. Tad `d = s_r − s_{r+2}` var būt ≈ 0, visu rindu garums ≈ `C + M·L ± 90` (kā robežrindām, kam `R = C + M·L`), un pāra rindām nobīde nav vajadzīga (tās nav kaimiņi). Sēklas bloks pa blokam tiek velkts pret iepriekšējo rindu, un gatavā telpa tiek pārbaudīta ar īsto novērtētāju (`B = Σm + n`, `V = 0`, `LB1 = knownOptimum`, validētājs tīrs). n − 2 jādalās ar 4. Ģenerators ir `bench` (`packages/bench/src/generate/planted.ts`), kodols to neimportē; CLI `pnpm bench generate planted --preset P1..P4 | --n --m --seed`, instances `instances/planted/`. Tests atjauno katru priekšiestatījumu un salīdzina ar failu (`saveProject`), lai instances neaizsprūst nemanot.

**Instances** (M = 3, `knownOptimum` = LB1 = pierādīts optimums; baseline mērījums, 1000 nov., `pnpm bench baselines instances/planted`):

| instance | rindas | m² | optimums | B-NEXT | B-INST | B-INST/pc | RS | HC |
|---|---|---|---|---|---|---|---|---|
| P1 | 14 | ≈ 14 | 56 | 59 | 58 | 58 | 57* | 57 |
| P2 | 22 | ≈ 22 | 88 | 93 | 90 | 90 | 89* | 89 |
| P3 | 30 | ≈ 30 | 120 | 126 | 123 | 122 | 122* | 121 |
| P4 | 42 | ≈ 41 | 168 | 181 | 171 | 170 | 170* | 170 |

Bāzes metodes optimumu neatrod nevienā instancē (starpība 1–3 dēļi); tātad instances tiešām nosaka meklēšanas kvalitāti. Ģenerators atgriež arī konstrukcijas φ (`generatePlantedInstance`), un tests pārbauda, ka tie dod `B = knownOptimum` ar tīru validētāju.

**Zināmie ierobežojumi.** Instances ir gandrīz taisnstūra (rindu garumi atšķiras līdz ~180 mm), nevis "īsti kāpņu"; reālistiskāki daudzstūri (bloku variants ar dažādiem R) paliek F6. Tikai `precut` dekoderis.

## ADR-016 — SA parametri, M4 slēgšana un F5 kritēriju rezultāts (F5) (2026-09-30)

**Konteksts.** F5 kritēriji: (a) SA ≤ visas bāzes metodes visām instancēm, (b) P1–P4 optimums ≥ 90 % sēklu pie 200 000 novērtējumiem.

**Izdarītie lēmumi.**

- M4 papildināts ar slēgtu pāru ciklu meklēšanu un noklusējuma gājienu svariem M4 = 0,60 (sk. `ALGORITHM.md` §6, `SPEC_MOVE_WEIGHTS` paliek salīdzināšanai). Režģis: `pnpm bench tune` (`TUNING_CONFIGS`).
- Temperatūras kalibrācija: T₀ = −median(Δ⁺)/ln p₀, **neņemot vērā gājienus, kas palielina V**. Sods λ_V·V nav dēļu skaita solis un uzpūš T₀ (L1, p₀ = 0,8: T₀ ≈ 27; R2 ≈ 26; P4 ≈ 28 — t.i., +1 dēli tika pieņemts gandrīz vienmēr). Ja tādu gājienu ir < 10, kalibrē pēc visiem. Pēc labojuma (p₀ = 0,8, 1 sēkla): L1 T₀ ≈ 2,7, R2 ≈ 4,2, P4 ≈ 2,9.
- **P1–P4 netiek mainītas.** Instanču atvieglošana pēc rezultāta uzzināšanas apietu CLAUDE.md 6. noteikuma jēgu. Grūtības skala tiks mērīta F6 kā atsevišķa sērija (tās pašas instances ar augošu rindu skaitu).

**Rezultāts ar galīgo kodu (T₀ labojums iekšā).** Komandas: `pnpm bench compare instances --seeds 20 --iters 200000` un `pnpm bench planted --seeds 20 --iters 200000`; izvads `results/f5/`. Vidējais B pa 20 sēklām (RS nevienā instancē, izņemot S2, netiek līdz derīgam atrisinājumam katrā sēklā):

| instance | LB | B-INST | HC | SA |
|---|---|---|---|---|
| C1 | 64 | 68 | 66,00 | 66,00 |
| C2 | 66 | 68 | 67,00 | 67,00 |
| L1 | 85 | 89 | **86,60** | 86,95 |
| U1 | 78 | 89 | 81,00 | 81,00 |
| P1 | 56 | 58 | 57,00 | **56,00** |
| P2 | 88 | 90 | 89,00 | 88,95 |
| P3 | 120 | 123 | 121,00 | 121,00 |
| P4 | 168 | 171 | **169,00** | 169,95 |
| R1 | 49 | 49 | 49,00 | 49,00 |
| R2 | 81 | 86 | 83,00 | 83,00 |
| S1 | 50 | 52 | 51,00 | 51,00 |
| S2 | 34 | 37 | 37,00 | 37,00 |

Plantētās (SA, 20 sēklas, 200 000 nov.): P1 **20/20**, P2 **1/20** (5 %), P3 **0/20**, P4 **0/20**.

Pirms T₀ labojuma (vecā kalibrācija) tas pats `compare` deva tādus pašus zaudējumus L1 un P4 un papildus R2 (HC 83,00 / SA 83,20); P2 bija 88,65 pret 88,95 — atšķirības ir trokšņa līmenī (20 sēklas, nav zīmju testa).

**Kritēriju statuss.** (a) **nav izpildīts**: SA zaudē HC 2 instancēs no 12 — L1 (+0,35 dēļa) un P4 (+0,95); visās pārējās ir ≤ (neizšķirts vai labāks). (b) **nav izpildīts**: 100 % / 5 % / 0 % / 0 % pret prasītajiem 90 %. Hipotēze: optimums prasa vienlaikus saskaņot visus dēļu pārus, un M4 slēgšana labo tikai vietējus ciklus; grūtība aug ļoti strauji ar rindu skaitu (P1 14 → P4 42). (c) ≥ 100 000 nov./s ir izpildīts ar rezervi: pēc `fast.ts` optimizācijas `tall-60` 134–147k/s (kolonna "fast SA" — novērtētājs vienatnē uz SA gājienu atkārtojuma; pilna SA iterācija ≈ 46–50k/s, tajā dominē gājienu ģenerēšana) (`pnpm bench perf`, `results/f5/perf.txt`; pirms tam 84–103k atkarībā no mašīnas stāvokļa un no tā, cik novērtētāju eksemplāru bija izveidots procesā — V8 pārstāj piesaistīt slēgumus, tāpēc karstajās cilpās masīvi tiek nolasīti lokālajos mainīgajos); (d) determinisms ir izpildīts (SA trajektorija nemainījās).

**Parametru režģis** (`pnpm bench tune --seeds 10 --iters 100000`, galīgais kods; vidējais B un [optimuma atrašanas reizes] plantētajām; `results/f5/tune.txt`):

| konfigurācija | P1 | P2 | P3 | R2 | L1 | S1 |
|---|---|---|---|---|---|---|
| spec (§6/§7) | 57,00 [0/10] | 89,00 [0/10] | 121,00 [0/10] | 83,10 | 87,00 | 51,00 |
| spec + slēgšana | 56,40 [6/10] | 89,00 [0/10] | 121,00 [0/10] | 83,00 | 87,00 | 51,00 |
| M4 60 %, bez slēgšanas | 57,00 [0/10] | 89,00 [0/10] | 121,00 [0/10] | 83,10 | 86,90 | 51,00 |
| **tuned (noklusējums, p₀ = 0,8)** | **56,00 [10/10]** | 88,90 [1/10] | 121,00 [0/10] | 83,00 | 87,00 | 51,00 |
| p₀ = 0,5 | 56,00 [10/10] | 89,00 [0/10] | 121,00 [0/10] | 83,00 | 87,00 | 51,00 |
| p₀ = 0,2 | 56,40 [6/10] | 89,00 [0/10] | 120,90 [1/10] | 83,00 | 86,90 | 51,00 |
| p₀ = 0,1 | 56,80 [2/10] | 89,00 [0/10] | 121,00 [0/10] | 83,00 | 87,00 | 51,00 |
| p₀ = 0,05 | 57,00 [0/10] | 89,00 [0/10] | 121,00 [0/10] | 83,00 | 87,00 | 51,00 |

Secinājumi: (1) izšķirošā ir M4 **slēgšana kopā ar M4 svaru 0,60** — atsevišķi katra P1 neatrod; (2) zemāks p₀ **nepalīdz**, P1 pat pasliktinās (0,05 → 0/10), tāpēc noklusējums paliek p₀ = 0,8; (3) uz R2, L1, S1 visas konfigurācijas atšķiras ≤ 0,2 dēļa (troksnis); (4) P3 un P4 netiek atrisinātas nevienā konfigurācijā.

**Nepārbaudīts.** Konsultanta ad hoc mērījumi (gājienu svaru un nobīdes amplitūdas maiņa, 5–20 restarti, L1 pie 100 000 paliek 87) nav reproducējami kā `bench` komanda; tie nav pamats lēmumiem un atskaitē nav jāpiemin kā rezultāts.

**Zināmie ierobežojumi ātrajam novērtētājam (gala pārskats).** (1) Paaudžu skaitītāji (`evalGen`, `pairedGen` u.c.) ir `Int32Array`; pēc 2³¹ ierakstiem (~1,5 h nepārtrauktas SA pie 135k/s ar vienu novērtētāja eksemplāru) tie pārpildītos un B klusi kļūtu par lielu. Pašlaik nesasniedzams (novērtētājs tiek radīts katram palaidienam); ja tiks lietots ilgāk, pie 2³⁰ jānotīra masīvi. (2) Nesapārotie gabali paļaujas uz invariantu "segmentā ≤ 1 sākuma un ≤ 1 beigu gabals"; ja `layout/pieces.ts` to mainīs, `fast.ts` jāpārskata. (3) `modL` nav tieša testa, tikai netiešs (salīdzināšana ar atsauci); fast-check tests `Object.is(modL(x), mod(x, L))` ir F6 uzdevums. (4) `fast.test.ts` uz instancēm neietver P3, P4.

**Turpinājums.** F6: mērogošanas sērija P-instancēm; 20+ sēklas un zīmju tests SA pret HC atskaitē; LAHC paliek neobligāts.

## ADR-017 — F5 pieņemta ar daļēji izpildītiem kritērijiem (2026-09-30)

**Konteksts.** F5 kritēriji (a) "SA ≤ visas bāzes metodes visām instancēm" un (b) "P1–P4 optimums ≥ 90 % sēklu" nav izpildīti (skaitļi ADR-016: SA zaudē HC uz L1 par 0,35 un P4 par 0,95 dēļa; P1–P4 optimums 20/20, 1/20, 0/20, 0/20).

**Lēmums.** Lietotājs pieņem F5 kā noslēgtu un sāk F6. Kritēriji (a) un (b) netiek atzīmēti kā izpildīti, un ne P1–P4 instances, ne kritēriju formulējumi netiek mainīti (sk. CLAUDE.md 6. noteikumu un ADR-016).

**Pamatojums.**

- Pret B-INST (klājēja metode) 12 instancēs, 20 sēklas: Σ 980 → 956,85 dēļi (≈ −2,4 %); pārsniegums virs LB1 41 → 17,85 (−56 %); U1 89 → 81, R2 86 → 83.
- P1: plantētais optimums atrasts 20/20 — optimums pierādīts.
- SA ≈ HC (Σ 956,85 pret 956,6): SA nav sistemātiski sliktāks, bet neuzvar. Tas ir pētījuma rezultāts, ko atskaitē var godīgi parādīt.
- Kursa prasības (paša SA implementācija, testi: izpildes laiks un kvalitāte pret optimumu/apakšējo robežu) ir izpildītas; (a) un (b) bija stingrāki paššķirti mērķi.

**Sekas.**

- Atskaitē SA ≈ HC un P2–P4 rezultāti tiek ziņoti godīgi; F6 jāpievieno 20+ sēklas un zīmju tests SA pret HC.
- Neobligāti pirms galīgajiem skrējieniem: SA + HC pēcapstrāde vai restarti, lai aizvērtu L1/P4 zaudējumu.
- Atvērtie punkti no ADR-016: `modL` fast-check tests; `fast.test.ts` neietver P3, P4.

## ADR-018 — Pilnā pārlase (`bench exhaustive`) (F6) (2026-09-30)

**Lēmums.** `packages/bench/src/exhaustive.ts` pārlasa φ režģi pēc `better` kārtības ar ātro novērtētāju; kodols nemainās, izņemot `resolveY0` (`optimize/run.ts`), ko lieto arī `runMethod`, lai pārlase un metodes strādātu ar vienādiem segmentiem.

**Pamatojums un ierobežojumi.**

- Pārlase ir precīza tikai ar soli 1 (veseli mm, ADR-013). Ar lielāku soli tā ir augšējā robeža, ko HC/SA var pārspēt; `ties` rāda, cik režģa punktu dod to pašu B.
- Salīdzina tikai `precut` metodes. B-INST ir `onsite` atsauce un var būt labāks (piemērs: 3100×404 mm, 2 segmenti: LB 5, pārlase ar soli 1 → 6, HC/SA → 6, B-INST → 5).
- Simetrijas samazināšana (M3 klases) netiek lietota: B tā saglabā, bet V/H var mainīties un labākais atradums pazustu.
- `--write-meta` raksta `knownOptimum` tikai ar pierādījumu B = LB1, citādi `bestKnown` (minimums ar esošo).

**Instances T1–T4** (`instances/tiny/`, bāze R1 noteikumi): T1 3100×404, T2 2600×300 (taisnstūri), T3 L-forma, T4 trapece 3100/2700×404. Izmēri izvēlēti tā, lai segmentu būtu 2–3; T1 izmēru zināju no zondēšanas, kur SA jau bija redzēts, tāpēc "izvēlēti pirms SA" nav tīri. Rezultāts (`--seeds 10 --iters 200000`; T1, T2, T4 soli 1, T3 soli 5):

| instance | segmenti | LB | pārlase | ties | B-INST (on-site) | HC | SA |
|---|---|---|---|---|---|---|---|
| T1 | 2 | 5 | 6 | 227052 | 5 | 6,00 | 6,00 |
| T2 | 2 | 5 | 6 | 157212 | 5 | 6,00 | 6,00 |
| T3 | 3 | 5 | 7 (režģis) | 318024 | 7 | 7,00 | 7,00 |
| T4 | 2 | 5 | 6 (nepārtraukts φ, režģis) | 353685 | 5 | 6,00 | 6,00 |

Secinājumi: HC un SA sakrīt ar pārlasi visās četrās (gap 0). T1, T2 ir precīzi (veseli mm); T3 un T4 ir augšējās robežas. LB1 = 5 nav sasniedzams precut režīmā, bet on-site B-INST T1, T2, T4 sasniedz 5, t.i., precut ir par 1 dēli sliktāks — ko atskaitē jāizskaidro (precut pieļauj ≤ 1 sākuma un ≤ 1 beigu gabalu uz dēli, on-site atlikumus izmanto brīvāk) vai jāizpēta. `meta.bestKnown` ierakstīts visām četrām, `knownOptimum` nevienai (B ≠ LB1).

## ADR-019 — Pilna platuma gabali vienpusējām garajām malām (dekoderis) (F6) (2026-09-30)

**Konteksts.** `bench exhaustive` uz T1, T2, T4 (ADR-018) rādīja precut optimumu 6, kamēr on-site B-INST dod 5 = LB. Izmeklēšana (T1, φ = [10, 782]): pirmās rindas beigu gabals (500 mm, `long = high`) un pēdējās rindas sākuma gabals (772 mm, `long = low`) ir abi pilna platuma (192 mm = W), bet dekoderis klasificēja pēc `long`: A posms pārāja tikai `both`, B posms tikai vienas klases ietvaros. Tāpēc šie gabali nekad nenonāca vienā dēlī, lai gan 500 + 772 + 3 ≤ 1285.

**Lēmums.** Gabals ar platumu ≥ `W − EPS` pieder pilna platuma klasei (A posms) neatkarīgi no `long`: tam ir abas dēļa garās malas. Noteikums ir `plan/decode.ts` un `evaluate/fast.ts` (abiem jāsakrīt, CLAUDE.md 5. noteikums); aprakstīts ALGORITHM §4. Testi: dekodera vienībtesti (pārošana pāri klasēm; ekvivalence ar `both`; šaurāki gabali paliek B posmā), T1–T4 pievienoti fast pret references īpašību testiem.

**Ietekme (`pnpm bench compare instances --seeds 20 --iters 200000`, `bench planted`; `results/f6/`).**

- T1, T2, T4: precut optimums 6 → **5 = LB1, pierādīts** (`meta.knownOptimum = 5`); T3 paliek 7 (režģis, `bestKnown`).
- Pārējās 12 instances praktiski nemainās pret ADR-016 tabulu: C1 66/66, C2 67/67, L1 HC 86,60 / SA 86,95, U1 81/81, P1 SA 56, P2 89,00/89,00, P3 121/121, P4 HC 169,00 / SA 169,90 (bija 169,95), R1 49, R2 83, S1 51, S2 HC 36,95 / SA 37,00 (bija 37,00/37,00). Labojums skar tikai telpas ar nenogrieztu pirmo un pēdējo rindu.
- F5 kritēriji (ADR-017) paliek nemainīgi nepildīti: (a) SA zaudē HC uz L1 (+0,35), P4 (+0,90) un S2 (+0,05), tātad 3 no 16 (12 F5 instances + T1–T4); (b) plantētās 20/20, 0/20, 0/20, 0/20 (P2 bija 1/20 — trokšņa līmenis).
- Plantēto optimumu B* = LB1 nemaina (LB1 nav atkarīgs no dekodera), un P1–P4 konstrukcijas plāni joprojām sasniedz B*.
- ADR-016/017 skaitļi paliek vēsturiski derīgi; F6 galīgie skrējieni (`bench all`) ir jāveic jau ar šo dekoderi.

**Piezīme.** `B_onsite ≥ B_precut` joprojām nav garantēts vispārīgi (ALGORITHM §4.2).

## ADR-020 — Instanču komplekts §13.1: izmēri pēc rakstiskiem kritērijiem (F6) (2026-09-30)

**Konteksts.** F6 prasa pilnu komplektu. Lai izvairītos no instanču "pielāgošanas" SA rezultātiem (ADR-016 princips), izmēri izvēlēti un segmentu skaiti aprēķināti ar roku (`layout/instances.test.ts`) **pirms** jebkāda SA skrējiena uz jaunajām instancēm. Pievienotas 11 instances; `multi` (M1 pēc F13) un `real` netiek veidotas.

**Kritēriji un izmēri.** Visām: jābūt `y0`, pie kura katra horizontālā siena atstāj strēmeles ≥ `minRipWidth` abās pusēs (`goodY0`); produkts 1285×192, `kerf = 3`, sprauga 10, `angleDeg = 0`, `stackSide = left`, `rowOffset = 0`, `mode = precut`.

| Instance | Izmērs | Kritērijs |
|---|---|---|
| P5, P6 | n = 50, 62 (m = 3; ≈ 49, 61 m²) | n − 2 dalās ar 4; `knownOptimum = LB1` = 200, 248 |
| R3 | 5200×3600 | zonas garums 5180: `(R + k) mod L = 43 ≤ 50`, t.i., rindas gals gandrīz vienmēr dod īsu gabalu ar ļoti maz pārošanas rezerves |
| R4 | 10 000×6030 | ≈ 60 m²; 6030, nevis 6000, jo 6000 dotu 38 mm strēmeles rindu (< `minRipWidth`) |
| L2 | 7000×5250, izgriezums 3000×2000 | liels L; 5250, lai pēdējā rinda nebūtu 6 mm; viens segments uz rindu |
| L3 | 6500×1500 + 2100×2700 | šaurs pleca garums < 2L: daudz īsu rindu |
| S3 | 4500×3000 + erkers 2500 plats pie pamatnes, 1700 augšā, 600 dziļš | nelīdzenas sānu malas (nav 45°), izliekta rinda |
| S4 | astoņstūris 4400×3400, stūri 700×700 (45°) | rindu gali nobīdās par 192 uz rindu |
| O1 | 5000×4000; kolonna 300×300 (poligons) + 2 caurules Ø16 | kolonnas caurums (320 mm) pilnībā sadala vienu rindu, blakus rindās paliek ≥ 100 mm tilts; caurules dažādās rindās, ne tuvāk par 50 mm rindas malai |
| O2 | 4500×3700; L veida virtuves bloks 3200×600 + 600×2300 | bloks piekļauts sienām, apakšējās rindas 1280 mm garas (< L); horizontālo sienu atlikumi mod 192 (10, 34, 6, 42) ietilpst logā, tātad `y0` ar strēmelēm ≥ `minRipWidth` eksistē (pirmā versija 4500×3800 / 2400 to neizpildīja: atlikumi 10, 34, 106, 142, un testi to atklāja pirms jebkāda SA skrējiena) |
| C3 | 4400×3400; četri R600 stūri (bulge tan 22,5°) + V izgriezums augšā | V gals ≈ 100 mm virs rindas robežas, sadala 3 rindas |

**Kas zināms.** Plantētajām B* = LB1. Pārējām jaunajām nav zināms ne optimums, ne `bestKnown` (tos aprēķina `bench bestknown`, 2. solis); tiny `knownOptimum` netiek ierakstīts bez pierādījuma B = LB1.

**Testi.** Instances pievienotas `layout/fixtures/instances.ts` (grupa `obstacles`) un `fixtures/planted.ts`, tāpēc bounds, cutlist, evaluate, fast un validatora testi uz tām darbojas automātiski; `plan/features.test.ts` pārbauda O1 caurules (2 urbumi, plāns derīgs).

## ADR-021 — `modL` ātrajā novērtētājā: īpašību tests (F6) (2026-09-30)

**Konteksts.** ADR-016 zināmais ierobežojums (3): `modL` bija tikai netieši testēts. Tas aizstāj `mod(x, L)` ar aritmētiku bez `%` un apgalvo bitu precīzu sakritību.

**Lēmums.** Slēgums izcelts kā eksportēta `makeModL(L)` (`evaluate/fast.ts`; kods un uzvedība nemainās), un `fast.test.ts` pārbauda `Object.is(modL(x), mod(x, L))` ar fast-check: fāzes un starpības, veseli skaitļi, L daudzkārtņi ± 1e-9, vērtības līdz ±2⁴⁵ (aiz `FMOD_LIMIT`), ±0, L ∈ {1, 7, 1000, 1285, 2²⁹ + 3, 1285,5} (pēdējais nav vesels, tāpēc iet pa `mod` atkāpšanās ceļu). Pretpiemēru nebija (20 000 gadījumu).

**Aizvērts F6 beigās:** ierobežojums (4): P3 un P4 pievienoti `fast.test.ts` references salīdzinājumam (30 un 42 segmenti, ~1,5 s katrs; pretpiemēru nebija).

## ADR-022 — `bench all`: sadalījums, atsākšana, pavedieni, Vega-Lite (F6) (2026-09-30)

**Konteksts.** §13.4 prasa, lai viena komanda no tīra klona atkārto tabulas. Pilnais E1 (27 instances × 4 stohastiskās metodes × 20 sēklas × 200 000 novērtējumu) ir ~2,7 h ar vienu pavedienu.

**Lēmumi.**
- **Sadalījums** (`packages/bench/src/all/`): `protocol.ts` (tīra matrica: skrējieni, atslēgas, varianti), `runJob.ts` (viens skrējiens → plakana `RawRow`), `raw.ts` (JSONL, atsākšana, bojātas pēdējās rindas labošana), `summary.ts` (CSV tabulas), `plots.ts` (SVG), `execute.ts`/`worker.ts`/`worker.mjs` (izpilde), `runAll.ts`, `cli.ts`. Protokola testi skaita skrējienus ar roku.
- **Atsākšana.** Atslēga = eksperiments|instance|metode|variants|sēkla|budžets. Budžets ir atslēgā, tāpēc cits iterāciju skaits nekad netiek uzskatīts par pabeigtu darbu; tabulās iet tikai pašreizējās matricas rindas.
- **Pavedieni.** `--jobs N|auto` izmanto `worker_threads` (viens rakstītājs galvenajā pavedienā). `worker.mjs` reģistrē `tsx`, citādi darbinieks neatrod importus bez paplašinājuma. Rezultāti pēc sēklas ir identiski secīgajai izpildei (pārbaudīts uz `--quick`); laiki ir troksnaini, tāpēc laika kolonnai jāizmanto `--jobs 1`.
- **E3 (G2)** maina `hPattern.distance` atmiņā (`applyVariant`), nevis raksta instanču kopijas failos: faili paliek vienīgais patiesības avots, un variants ir redzams atslēgā.
- **`evalsToBest`** (iterācija, nevis sekundes): pēdējā uzlabojuma iterācija no SA trases; nosaukums apzināti nesola "laiku līdz labākajam".
- **Atkarības.** `vega` un `vega-lite` kā `devDependencies` tikai `@lp/bench` (SVG renderēšana Node, bez canvas). Tās ir diagrammu, nevis optimizācijas bibliotēkas (CLAUDE.md #1 neierobežo; Vega-Lite ir tehnoloģiju sarakstā); lietotāja apstiprinājums saņemts.
- **Ārpus `all`:** `outer`, `exhaustive`, `planted`, `difficulty`, `bestknown` paliek atsevišķas komandas (lietotāja lēmums): `bestknown` ir vienreizējs stundām garš skrējiens, un tā rezultāts ir `meta` failos, ko `all` tikai nolasa.

**Labojumi pēc `reviewer` (F6, daļējs pārskats).**
- Atsākšanas atslēgā tagad ir arī instances satura jaucējkods (`InstanceHash`: projekts bez `meta`, jo `bestknown` pārraksta `meta` un nedrīkst anulēt skrējienus). Labota instance ir jauns darbs.
- Katra rinda glabā `commit` (ieraksta `runAll`); ja esošas rindas nāk no cita commit, `runAll` brīdina. Koda versija atslēgā netiek likta (tas anulētu visu pie katra commit), tāpēc galīgajam skrējienam `results/raw` jāsāk no tukša.
- `knownOptimum`/`bestKnown` tabulā nāk no pašreizējiem instanču failiem, nevis no rindām.
- `env.json` ieraksta `threads`; laika kolonna ir godīga tikai ar `--jobs 1` (atskaitē jānorāda).
- `evalsToBest` aizstāts ar `evalsToFinalB`: pirmā iterācija, kurā sasniegts galīgais B (iepriekš: pēdējais uzlabojums, arī f uzlabojumi ar to pašu B).
- Pool: `exit` apstrāde (darbinieks, kas beidzas bez ziņojuma, vairs neaptur rindu uz visiem laikiem). `writeMeta` raksta atomiski (fails + `rename`).
- `difficulty`/`difficultyCells`: vidējais B un gap tagad tikai pa derīgajiem skrējieniem (kā `summary.csv`), CSV papildināts ar `feasible`. **Piezīme:** `results/f6/difficulty.csv` pirmā versija (sākta pirms šī labojuma) bija aprēķināta ar veco formulu; F6 beigās sērija pārrēķināta ar labotu kodu (3 paralēli procesi pa n apakškopām, CSV apvienots): `found/runs` sakrīt visās 40 šūnās, vidējie un gap tagad ir pa derīgajiem skrējieniem. RS: derīgi 20/20 pie n = 6 un 10, 10/20 pie 14, 0/20 pie n ≥ 18.
- `knownOptimum` kritērijs ir B = LB = max(LB0, LB1) (abas ir derīgas apakšējās robežas), nevis tikai LB1.

## ADR-023 — Dekodera `fits` pielaide gabaliem pie sienas (F6) (2026-10-01)

**Konteksts.** Pirmais pilnais `bench all` (E1) apstājās pēc 379 skrējieniem ar `decode: piece P1-06-B does not fit on a board` (`sa-onsite`, P1, sēkla 1). Izmeklēšana: SA kalibrācijas laikā nonāca pie φ₆ = 1275,999999 (1276 − 1e-6); rindas garums ir 5131 = 4·1285 − 9, tāpēc ceturtā šuve iekrīt 5130,999999, t.i., 1e-6 = EPS pirms sienas. Šuve, kas ir ≤ EPS no sienas, nav šuve (`seamsOf`: `x < b − EPS`), tāpēc pēdējais gabals kļūst garāks par L par līdz EPS (1285,0000010000003). Dekodera `fits` pieļāva tikai `extent ≤ L + EPS`, un 3·10⁻¹³ float trokšņa pietika, lai gabals "neietilptu" pat jaunā dēlī. `precut` reference ceļš šajā φ izņēmumu nemeta (kāpēc tieši, netika izmeklēts: nav pierādīts, ka tas ir drošs); ātrajam novērtētājam ir tā pati `fits` pielaide un tāpēc tas pats risks, tāpēc labota arī tā.

**Lēmums.** Jauna konstante `FIT_EPS = 2·EPS` (`num/index.ts`); `fits` dekoderī (`plan/decode.ts`) un `findStock` ātrajā novērtētājā (`evaluate/fast.ts`) izmanto to gan garumam, gan platumam. Pielaides hierarhija: šuves atmešana pie sienas (EPS) drīkst pagarināt gabalu par EPS, tāpēc "ietilpst" tolerance ir stingri lielāka. Abi ceļi mainīti identiski (CLAUDE.md #5). Alternatīva (gabala garuma apcirpšana līdz L `describePieces`) atmesta: tā skartu trīs vietas (`describePieces`, `describePiecesFast`, `fast.ts`) un mainītu plāna ģeometriju.

**Tests.** `plan/seamTolerance.test.ts` izmanto tieši to φ (P1, segments 6a) abos režīmos: bez labojuma on-site tests krīt ar to pašu izņēmumu, ar labojumu iet; pārbauda, ka novērtētājs, plāns un validators dod vienādu B un nav cieto pārkāpumu.

**Sekas.** Skrējieni, kas neizmeta izņēmumu, nemainās (pielaide ietekmē tikai gabalus, kas ir 1e-6…2e-6 garāki par krājumu). `results/raw` no pirmā mēģinājuma izmests, galīgais skrējiens sākts no jauna. Vispārīgs secinājums: šādi float robežgadījumi parādās tikai tad, ja SA uzdur φ tieši uz F_s malu, tāpēc garie skrējieni (`bench all`, `bestknown`) ir noderīgs tests.

## ADR-024 — F6 galīgie rezultāti (2026-10-01)

> **Vēsturisks ieraksts.** Skaitļi zemāk ir no 2026-10-01 skrējiena ar veco SA; tos aizstāj atjauninājums 2026-10-03 (ADR-025…027, `docs/ROADMAP.md`, `report/main.typ`): grūtības sērija, SA pret HC, plantētās P1–P6, G2/G3 un laiki ir pārrēķināti.

**Konteksts.** `pnpm bench all` (ADR-022) izpildīts pilnā apjomā uz commit `c318900` (ar ADR-023 labojumu): 27 instances, 20 sēklas, 200 000 novērtējumu, 2854 skrējieni, 15 pavedieni, 2 h 41 min (`results/env.json`, `results/summary.csv`, `results/tables/`, `results/plots/G1–G3.svg`). Laika apakškopa ar vienu pavedienu: `results/timing/` (R1–R4, 3 sēklas, 12 min).

**Rezultāti.**
- SA visos 540 skrējienos beidzas derīgs. RS 408 no 540 skrējieniem ir nederīgi (V > 0).
- SA uzlabo B-INST (on-site) vidēji par 1,9 % (līdz 9,0 %, U1) un B-NEXT par 4,3 % (līdz 9,3 %, R3) uz 23 netriviālām instancēm (vidējie B pa 20 sēklām; pret labākajiem rezultātiem 2,1 % un 4,5 %).
- SA labākais rezultāts pret LB = max(LB0, LB1): vidēji +1,4 dēļi (3,1 %); 7 no 27 sakrīt ar LB (T1, T2, T4, P1, R1, L3, O2). Lielākās atšķirības: R4 +7 (2,8 %), T3 (LB 5, pārlase 7).
- **SA pret HC: nav būtiskas atšķirības.** Vidējais B pa 20 sēklām sakrīt 16 no 23 telpām, SA labāks 3 (P1, L2, L3), HC labāks 4 (P4, P5, L1, S2); zīmju tests p = 1,0. **F5 kritēriji (a) un (b) paliek neizpildīti** (ADR-017, ADR-019); atskaitē tas ziņots godīgi.
- Plantētās P2–P6: SA vienmēr atrod B* + 1 (labākais 89, 121, 169, 201, 249 pret 88, 120, 168, 200, 248); tikai P1 atrod B* (20/20).
- Grūtības sērija (n = 6…42): SA atrod B* 20/20 pie n = 6, 8/20 pie 10, 14/20 pie 14, 5/20 pie 18, 1/20 pie 26, nekad pie 22 un n ≥ 30; B-INST un RS nekad; HC tikai n = 6. Sērija nav monotona, jo katram n ir cita instance.
- Atkārtots `bestknown` (10 × 2 M ar jauno SA) 15 telpās (C1–C3, L1, L2, O1, R2–R4, S1–S4, T3, U1); pārējās 12 (T1, T2, T4, R1, L3, O2, P1–P6) nav pārskrietas, jo tām ir `knownOptimum`. Visas 15 vērtības sakrīt ar `meta.bestKnown`; S2 pret veco skrējienu uzlabots 37 → 36. SA ar 200 000 novērtējumiem sakrīt ar `bestKnown` visās šajās telpās, izņemot S2 (summary: 37 pret 36).
- SA-onsite vidēji nekad nav labāks par SA (precut) (starpība 0…1,3 dēļi); B-INST nav labāks ne par vienu. Tas ir novērojums pie vienāda budžeta, ne pierādījums, ka precut ir vienmēr labāks (B_onsite ≥ B_precut nav garantēts, ALGORITHM §4.2).
- G2: H-raksta attālums D = 200…500 mm maina vidējo B tikai L1 (86,7 bez H pret 87,0–87,5, t.i., līdz +0,8 dēļiem) un R2 (≤ 0,05); S1 un O1 tas nemainās. Atlikušais H pārkāpums aug līdz ar D (R2: 4,7 → 22,3).
- Laiks (1 pavediens, 200 000 novērtējumu): B-NEXT/B-INST 5–40 ms, HC 0,9–1,4 s, SA 2,1–2,9 s, RS 4,6–10 s, SA-onsite 37–110 s (18–38× lēnāks par SA: nav ātrā novērtētāja).

**Piezīme par reproducējamību.** `results/env.json` un `results/timing/env.json` ir `dirty: true`: darba kokā bija nekomitētas izmaiņas (grafiku kods, testi, dokumenti), kas rezultātus neietekmē; visas 2214 + 640 rindas ir uz commit `c318900`. `runAll` pārraksta `env.json` katrā atsākšanā.

**Ierobežojumi un atvērtie jautājumi.** Laika kolonna `summary.csv` ir no 15 pavedienu skrējiena (aptuvena); `bestKnown` nav pierādīts optimums; LB nav šaura; SA joprojām nav pārāks par HC, un tā iemesli (gājieni, temperatūra, budžets) nav izmeklēti: tas ir nākamais darbs, ja kurss to prasa (F5 punkti: restarti, HC pēcapstrāde). Pilna matrica nav atkārtota ar `--jobs 1` (9 h).

## ADR-025 — Ātrais on-site novērtētājs (F6 turpinājums) (2026-10-01)

**Konteksts.** `bench all` parādīja, ka SA-onsite ir 18–38× lēnāks par SA (R2: 59–70 s pret 2,8 s uz 200 000 novērtējumu), jo `onsite` režīmam bija tikai objektu atsauces novērtētājs (`evaluate`: virknes, `Map`, `piecesForPhases` katrā izsaukumā). CPU profils (8000 iterāciju, R2) neuzrādīja vienu karsto punktu (`evaluate`, `placeBestFit`, `piecesForPhases`, `describePieces`, `addStock`, `unpaired` kopā ~25 %), tātad vajadzēja tipizēto masīvu pārrakstu, nevis mikro-optimizāciju.

**Lēmums.** `createFastEvaluator(ctx, { mode: 'onsite' })` (`evaluate/fast.ts`): gabalu ģenerēšana, soda locekļi V, H, R un L_min deficīts ir kopīgi ar `precut`; jauns `decodeSeq()` iet pa segmentiem izkārtojuma secībā (iekšā: sākuma gabals, vidējie, beigu gabals; slotos tie ir [vidējie…, beigu, sākuma]) un katru gabalu ar `findStock`/`cutFrom` (tās pašas funkcijas, ko C posms) griež no labākā atlikuma vai jauna dēļa; veseli dēļi (`C_WHOLE`) tiek tikai skaitīti, jo tiem vajag svaigu dēli un tie neatstāj atlikumu. Atsauces `decodeSequential` atgriež tukšus `unpaired` sarakstus, tāpēc ātrajā ceļā N = 0 un `unpaired()` ir tukšs (M4 on-site režīmā nedarbojas arī atsaucē; tas var būt viens no iemesliem, kāpēc SA-onsite ir vājāks par SA). `addSimple` papildus raksta `pShort`/`pLong` (sekvenciālajam dekoderim vajag katra gabala vajadzības). `createEvaluator` izmanto ātro ceļu abiem režīmiem.

**Pārbaude.** Esošie "fast = reference" īpašību testi (`fast.test.ts`: B, V, H, R, N, f, deficīts un nesapārotie gabali pēc gājienu virknēm; 16 instances ieskaitot slīpas un ar lokiem, P1–P4 un 60 nejaušas taisnleņķa telpas ar brīvajiem gabaliem) tagad skrien abiem režīmiem; visi iet. Papildus: tā pati sēkla R2 dod identisku SA trasi (B = 84, 9 no 9 trases punktiem sakrīt).

**Ātrums** (R2, 200 000 novērtējumu, viens pavediens, tīrs CPU): SA-onsite 69,6 s → 4,5 s (~15×); SA 2,5 s. SA-onsite tagad ~1,8× lēnāks par SA (palicis kopīgais dekodēšanas darbs, kurā atlikumu meklēšana ir O(atlikumu skaits)).

## ADR-026 — Plantētie optimumi un mērķa funkcija: H sods maskēja SA (2026-10-01)

**Konteksts.** F5/F6 rezultāti (ADR-017, ADR-024) rādīja, ka SA neatrod plantētos optimumus (P2–P6: vienmēr B* + 1) un nav labāks par HC. Meklējot SA uzlabojumus, pārbaudīju P2 un P3: plantētā plāna mērķa funkcija f = B + λ_V·V + λ_H·H + ε·N ir **augstāka** par SA atrasto risinājumu (P2: plantētais B = 88, H = 39,4, f = 99,8; SA labākais B = 89, H = 0, f = 89,1; λ_H = 0,3). Plantētais optimums B* = LB1 ir tīras dēļu minimizēšanas optimums (ADR-015), bet noklusējuma noteikumos H raksts ir ieslēgts, un SA **pareizi** apmaina vienu dēli pret nulles H sodu. Tātad F5 kritērijs (b) un SA/HC salīdzinājums plantētajās instancēs mērīja ne to, ko bija paredzēts.

**Lēmums.**
- Plantētās instances (`generatePlanted`, `instances/planted/P1–P6.json`) tiek ģenerētas ar `rules.hPattern.enabled = false`: tās ir tīri B minimizēšanas uzdevumi, kuru optimums ir pierādīts. Faili pārģenerēti (mainījies tikai šis lauks).
- Jauns eksperiments **E4 "bonly"** (`bench all`): HC, SA un SA-onsite ar izslēgtu H uz visām 27 instancēm, 20 sēklas, 200 000 novērtējumu; `results/summary_bonly.csv`. Galvenā tabula (E1) paliek ar produkta mērķi (H ieslēgts), jo tas ir lietotnes noklusējums.

**Pirmie E4 rezultāti.** SA atrod plantēto optimumu P1 (20/20), P2 (20/20) un P3 (vidējais 120,25), HC nekad (vienmēr B* + 1); P4–P6 abiem B* + 1. Pārējās instancēs HC un SA sakrīt 17 no 23, bet SA ir sliktāks par HC uz L1 (86,70 pret 86,00) un L3 (64,45 pret 64,00). **F5 kritēriji tiek pārvērtēti** ar E4 (SA uzlabojumi, ADR-027).

## ADR-027 — SA noklusējuma parametri un biežā atjaunošana (2026-10-01)

**Konteksts.** ADR-026 parādīja, ka ar tīru B mērķi SA atrod P1–P3 optimumus, bet P4–P6 un L veida telpās (L1, L3) zaudē vienkāršam HC. Sākuma temperatūra no ADR-016 (`p0 = 0,8`, kalibrēta ar ieslēgtu H) ar B mērķi dod T₀ ≈ 4,5 (+1 dēlis tiek pieņemts ar ~80 % varbūtību), tāpēc liela daļa no 200 000 novērtējumiem tiek iztērēta pārāk karstā režīmā.

**Eksperiments.** Parametru režģis uz 9 instancēm (L1, L2, L3, P3, P4, P5, R2, S2, U1), H izslēgts, 10 sēklas, 200 000 novērtējumu, 4 kārtas (34 varianti; pagaidu skripts `bench/tune2.ts`, nav palicis repozitorijā). Rādītājs: vidējo B summa un skrējieni, kas sasniedz labāko zināmo/plantēto optimumu (no 90).

| Variants | summa | trāpījumi |
|---|---|---|
| ADR-016 noklusējums (p0 0,8, pEnd 1e-3) | 971,8 | 52/90 |
| p0 0,3, pEnd 1e-6 | 970,2 | 68/90 |
| + atjaunošana ik pēc 25 % bez uzlabojuma | 969,4 | 76/90 |
| + atjaunošana ik pēc 5 % | 968,9 | 81/90 |
| + atjaunošana ik pēc 1 % | 968,4 | 85/90 |
| **p0 0,3, pEnd 1e-8, atjaunošana ik pēc 0,5 %** | **968,2** | **88/90** |

Trends: zemāks p0 un pEnd palīdz, un jo biežāk SA restartē no labākā risinājuma ar zemāku T₀ (`reheatFactor` 0,5), jo labāk; pie 0,25–1 % rezultāti ir plato (atšķirības trokšņa līmenī pie 10 sēklām). P4 optimums 168: 0/10 → 10/10; P5 200: 0/10 → 8/10. Vienā S2 sēklā atrasts B = 36 (iepriekšējais `bestKnown` 37 bija ar H ieslēgtu).

**Lēmums.** Noklusējumi: `p0 = 0,3`, `pEnd = 1e-8`, `reheat = true`, `reheatFraction = 0,005`, `reheatFactor = 0,5` (konfigurējami). Atjaunošanas trigeris laika režīmā (lietotne): progress bez jauna labākā (`tau − tauBest`) nevis iterāciju skaits, jo laika režīmā nav kopējā iterāciju skaita (iepriekš `reheat` darbojās tikai iterāciju režīmā). Pārbauda `sa.test.ts`.

**Brīdinājums.** Parametri izvēlēti uz 9 instancēm un 10 sēklām (pārmērīgas pielāgošanas risks); validācija: pilns `bench all` uz visām 27 instancēm, 20 sēklas, abiem mērķiem (rezultāti: ROADMAP atjauninājums 2026-10-03; n = 38 analīze: ADR-028).

## ADR-028 — Kāpēc n = 38 (grūtības sērija) ir grūts, un kāpēc noklusējumus nemainām (2026-10-03)

**Konteksts.** Grūtības sērijā (ADR-024, pārskrēta ar ADR-027 SA) SA atrod plantēto optimumu 20/20 gandrīz visos izmēros, bet n = 38 tikai 2/20 (vienmēr B* vai B* + 1; B* = LB = 152, B-INST = 155).

**Eksperimenti** (n = 38, 20 sēklas, tā pati instance, H nav): 
- Budžets: 200 k → 2/20; 1 M → 8/20; 2 M → 17/20. Panākumi aug monotoni, tātad tā ir meklēšanas pūļu, nevis konstrukcijas (dekodera vai gājienu) problēma.
- `p0` 0,1 un 0,5 → 0/20; `pEnd` 1e-4 → 0/20; `reheatFactor` 0,25 un 1,0 → 2/20 (bez uzlabojuma).
- Atjaunošanas biežums (`reheatFraction`): 0,002 → 1/20; 0,005 (noklusējums) → 2/20; 0,02 → 2/20; 0,05 → 6/20; 0,1 un 0,2 → 8/20; bez atjaunošanas → 6/20.
- Citi izmēri (n = 26, 34, 42): 20/20 neatkarīgi no `reheatFraction`; n = 30: 18/20 (0,005), 16/20 (0,05), 17/20 (0,1).

**Pārbaude uz ADR-027 noskaņošanas kopas** (L1, L2, L3, P3, P4, P5, R2, S2, U1; H izslēgts, 10 sēklas, 200 k): vidējo B summa 968,20 pie 0,005 (sakrīt ar ADR-027), 968,80 pie 0,05 un 969,50 pie 0,2. Retāka atjaunošana ir sliktāka uz L1, P4 un P5.

**Lēmums.** Noklusējumus (`reheatFraction = 0,005`) **nemainām**: n = 38 dod labumu no retākas atjaunošanas, bet noskaņošanas kopa (9 instances) — no biežākas; tas ir kompromiss, nevis kļūda, un mainīt parametrus pēc vienas instances būtu pielāgošana tai. n = 38 ir godīgi grūtāka instance (cita nejauša ģeneratora sēkla), kurai SA vajag ≈ 10× lielāku budžetu.

**Iespējamais turpinājums.** Adaptīva atjaunošana (biežums atkarīgs no tā, cik ilgi labākais nav uzlabojies) vai laika režīmā vairāki neatkarīgi starti (jau paredzēti lietotnē, `docs/ALGORITHM.md` §7).

## ADR-029 — Repozitorija minimizēšana: tikai kursa darbs (2026-10-08)

**Konteksts.** Projekts tika plānots kā lamināta plānotāja PWA un reizē kā kursa darbs. Lietotājs nolēma, ka šis repozitorijs paliek tikai kursa darbs; lietotne tiek veidota atsevišķi (v2). Kursa nodevumam vajag problēmas implementāciju ar SA, dažāda izmēra instances, testēšanu (laiks, kvalitāte pret optimumu/labāko zināmo), 2–3 lpp. atskaiti un GitHub repozitoriju. Atskaite (`report/main.typ`) izmanto tikai dēļu skaitu B.

**Izņemts.**
- `apps/web` (React PWA), `docs/UI.md`, `dev` un `build` skripti.
- H sods (`rules.hPattern`, `settings.aesthetics`, λ_H), kā arī neizmantotais regularitātes sods R (λ_R = 0), otrās kārtas kaimiņu pāri `secondOrder`. Mērķa funkcija ir `f = B + λ_V·V + ε·N`.
- Ārējā cilpa (`optimize/outer`, `y0Violations`, `validY0s`, komanda `outer`); θ, sākuma puse un y0 eksperimentos ir fiksēti (`resolveY0`).
- RS bāzes metode (atskaitē netiek rādīta).
- `core/cutlist` (griešanas secība un atdura saraksts), grafiki G1–G3 (Vega-Lite, atkarības `vega`, `vega-lite`) un to tabulas.
- Komandas `baselines`, `compare`, `planted`, `perf`, `outer`, `render-samples`; eksperiments E3 (aesthetics).
- Neizmantotie modeļa lauki: `rules.pattern`, `rules.maxRunLength/maxRunWidth`, `product.pricePerPack`, `room.wallShapes`, `settings.trimMargin/timeLimitMs`. Atslēgas izņemtas arī no `instances/**/*.json` (arī `hPattern`, `aesthetics`).
- Starprezultāti: `results/f5/` (izņemot `tune.txt`), `results/f6/` apakšmapes un teksta žurnāli (izņemot `difficulty.csv`, `bestknown.txt`, `exhaustive/`), `results/plots`, `results/tables`, `results/summary_bonly.csv`, `test_output.txt`.

**Eksperimentu apvienošana.** Ar izslēgtu H eksperimenti `main` (E1) un `bonly` (E4) ir viens un tas pats. `pnpm bench all` tagad veic vienu eksperimentu: visas 27 instances × B-NEXT, B-INST (deterministiski, viens skrējiens), HC, SA, SA-onsite (20 sēklas, 200 000 novērtējumu), un raksta vienu `results/summary.csv` (+ `env.json`, `results/raw/main.jsonl`). Skrējiena atslēga vairs neietver eksperimenta nosaukumu un H variantu.

**Pārbaude.** `bench all --jobs 8` pārskriets uz commit `7f3792d` (1674 skrējieni, 995 s, tīrs darba koks). Salīdzināts ar iepriekšējiem `summary.csv` (B-NEXT, B-INST) un `summary_bonly.csv` (pārējais): 621 šūna 27 instancēs (lb, knownOptimum, bestKnown, zoneM2, segments un best/mean/std/feasible kolonnas visām metodēm) sakrīt **identiski**, atšķiras tikai laika kolonnas. Atskaites PDF teksts atšķiras tikai laika kolonnā un avota rindā. Iemesls: ar `hPattern.enabled = false` H locekļa termu saraksts bija tukšs, tāpēc trajektorijas un f vērtības (peldošā komata ziņā) nemainās; B-NEXT/B-INST dekoderi H neizmanto.

**Sekas un piezīmes.**
- `sa.test.ts` T₀ mērogošanas tests tagad izmanto p₀ = 0,9 un 0,8 (nevis 0,8 un 0,2): bez H soļa R2 mediānais augšupejošais solis ir ε·N lieluma, un pie p₀ = 0,2 T₀ nokrīt uz T_end grīdu, tāpēc attiecība `ln p₀` vairs nav tīra. Pārbaudāmā īpašība (T₀ ∝ −1/ln p₀) un gaidītā formula nav mainīta.
- `results/f5/tune.txt` un `results/f6/bestknown.txt`, `difficulty.csv`, `exhaustive/` un `results/timing/` netika pārskrieti; tie ir saglabāti kā ģenerēti (daļa no tiem iegūta, kad instancēs H vēl bija ieslēgts vai definēts; plantētajām instancēm H jau agrāk bija izslēgts, ADR-026). `difficulty.csv` satur arī `rs` rindas, ko atskaite nerāda.
- Vecie ADR (ADR-001…028) ir vēsturisks žurnāls un nav pārrakstīti; tie var atsaukties uz izņemtajām daļām.
- `docs/ROADMAP.md`: F0–F6 saglabātas kā vēsture, F7–F16 dzēstas.
