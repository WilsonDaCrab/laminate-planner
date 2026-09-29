# DOMAIN.md — Problēmas domēns

Šis dokuments apraksta lamināta klāšanu tā, kā tā notiek dzīvē, un to, kā katru situāciju attēlo modelī. Algoritmi ir aprakstīti `ALGORITHM.md`, saskarne — `UI.md`.

## 1. Mērķis un lietotāji

| Lietotājs | Vajadzība |
|---|---|
| Profesionāls klājējs / brigāde | Sagriezt visu vienā piegājienā pirms klāšanas; precīzs pasūtāmais daudzums; skaidra klāšanas secība |
| Darbu vadītājs, tāmētājs | Vairākas telpas, pakas, izmaksas, atgriezumu procents |
| Mājsaimnieks (DIY) | Vienkārša telpa, instrukcija bez žargona |
| (Vēlāk) veikala konsultants | Ātrs paku skaits no dažiem izmēriem |

Produkta veiksmes kritēriji:

1. **Materiāls:** tipiskām telpām ≤ LB + 1 dēlis; paku skaits pareizs.
2. **Izpildāmība:** katram dēlim ir skaidri griezumi, katram gabalam — marķējums, katrai rindai — secība. Klājējam nav jādomā.
3. **Noteikumi:** plāns ievēro ražotāja prasības (šuvju nobīde, minimālais garums un platums, spraugas).
4. **Ātrums:** tipisku telpu var ievadīt ≤ 3 minūtēs ar precizitāti līdz milimetram.

## 2. Termini

| Latviski | Kodā | Nozīme |
|---|---|---|
| dēlis | `board` | vesels rūpnīcas panelis L × W |
| gabals | `piece` | dēļa daļa, kas tiek ieklāta konkrētā vietā |
| atgriezums | `offcut` | dēļa atlikums pēc gabala nogriešanas; var būt izmantojams |
| atkritumi | `waste` | materiāls, kas netiek ieklāts |
| rinda / josla | `row` / `band` | dēļu virkne platumā W |
| segments | `segment` | sakarīga joslas daļa starp sienām vai šķēršļiem |
| šuve | `seam` | divu dēļu īso galu savienojums rindā |
| šuvju nobīde | `stagger` | attālums starp blakus rindu šuvēm |
| šuvju fāze | `phase` φ | šuvju pozīcija modulo L |
| sākuma / beigu gabals | `start` / `end` | segmenta pirmais / pēdējais gabals |
| pilns gabals | `full` | nesagriezts dēlis rindas vidū |
| brīvs gabals | `free` | gabals, kam nevajag īso galu profilus (abi gali pie sienām) |
| garengriezums | `rip` | griezums pa dēļa garumu (samazina platumu) |
| šķērsgriezums | `cross` | griezums pāri dēlim (samazina garumu) |
| strēmele | `strip` | garengriezuma rezultāts |
| zāģa griezuma platums | `kerf` k | materiāls, ko "apēd" griezums |
| izplešanās sprauga | `gap` g | sprauga gar sienām un šķēršļiem |
| dilatācijas šuve | `expansion joint` | pārtraukums grīdā (ar profilu) lielās platībās vai durvīs |
| pārejas profils | `transition` | profils durvīs vai starp dažādiem segumiem |
| grīdlīste | `skirting` | sedz spraugu gar sienu |
| robs | `notch` | izgriezums gabalā (iekšējais stūris, durvju kārba, kolonna) |
| urbums | `drill` | caurums caurulei |
| uzstādāmā zona | `zone` Z | telpa mīnus spraugas un šķēršļi |
| klāšanas virziens | `angle` θ | virziens, kurā liek dēļus rindā |
| rindu nobīde | `rowOffset` y0 | rindu tīkla novietojums pret sienām |
| atskaites līnija | `reference line` | fiziska līnija (lāzers, aukla), pret kuru nosprauž plānu |
| apakšējā robeža | `lower bound` LB | pierādāms dēļu skaita minimums |

## 3. Dēļa anatomija un orientācija

```
             augšmala (y_b = W) — profils pret NĀKAMO rindu (parasti rieva)
           ┌──────────────────────────────────────────────────────┐
 kreisais  │                                                      │  labais
 gals      │                    dēlis  L × W                      │  gals
 (x_b = 0) │                                                      │  (x_b = L)
           └──────────────────────────────────────────────────────┘
             apakšmala (y_b = 0) — profils pret IEPRIEKŠĒJO rindu (parasti spunde)
```

- Rindu klāj no kreisās uz labo (+x). Jaunā dēļa kreisais gals savienojas ar iepriekšējā dēļa labo galu.
- Rindas krājas +y virzienā. Jaunās rindas apakšmala savienojas ar iepriekšējās rindas augšmalu.
- Dēli **nevar pagriezt par 180°** (profili neder) un **nevar apgriezt** (dekors).

Tātad gabala tipu nosaka tas, kuras malas pieslēdzas citiem gabaliem:

| Gabals | Vajadzīgie profili | No kuras dēļa daļas |
|---|---|---|
| sākuma (siena kreisajā pusē) | labais gals | labā daļa `[L − s, L]` |
| beigu (siena labajā pusē) | kreisais gals | kreisā daļa `[0, e]` |
| pilns | abi gali | viss garums |
| brīvs (siena abos galos) | neviens gals | jebkura daļa |
| pirmās rindas (siena apakšā) | augšmala | augšējā strēmele `[W − a, W]` |
| pēdējās rindas (siena augšā) | apakšmala | apakšējā strēmele `[0, b]` |
| vienas rindas nišā (siena abās garajās pusēs) | neviena garā mala | jebkura strēmele |

Uz šīs tabulas balstās visa atgriezumu izmantošana:

- **Šķērsgriezums:** viens pārgriezts dēlis dod vienu beigu gabalu (kreisā daļa) un vienu sākuma gabalu (labā daļa). Tie var iet uz **jebkurām** divām rindām, arī uz vienu un to pašu.
- **Garengriezums:** viens garengriezts dēlis dod vienu pēdējās rindas strēmeli (apakšējā) un vienu pirmās rindas strēmeli (augšējā), ja `a + b + k ≤ W`.

## 4. Klāšanas process (kā to dara klājējs)

1. Dēļi aklimatizējas telpā; ieklāj pamatni.
2. Izvēlas virzienu. Parasti dēļus liek paralēli gaismai no loga, garās šaurās telpās — pa garumu.
3. Aprēķina pirmās un pēdējās rindas platumu, lai pēdējā nebūtu par šauru. Bieži abas rindas līdzsvaro.
4. Pirmo rindu liek pie sienas ar ķīlīšiem (sprauga). Spundi pret sienu parasti nogriež.
5. Rindas beigās nomēra un nogriež gabalu. Atgriezums sāk nākamo rindu, ja tas ir pietiekami garš un šuvju nobīde ir pietiekama.
6. Durvju kārbām iezāģē apakšu, lai laminātu var pabīdīt zem tām; caurulēm izurbj caurumus.
7. Pēdējo rindu sagriež garenvirzienā.
8. Uzstāda grīdlīstes un profilus.

Klasiskais process ir **secīgs**: katru gabalu mēra un griež tad, kad to vajag, un atgriezums parasti iet tikai uz nākamo rindu. Šis produkts to aizstāj ar **plānu**. Visi griezumi ir zināmi iepriekš, tāpēc:

- visu var sagriezt vienā piegājienā (darbnīcā vai uz vietas ar giljotīnu vai zāģi ar atduri);
- atgriezumu var izmantot **jebkurā** rindā, ne tikai nākamajā. Tas ietaupa materiālu, ko secīgā klāšanā sasniegt nevar.

## 5. Noteikumi un parametri

Tipiskās vērtības ir tikai orientējošas. Vienmēr jāņem konkrētā produkta instalācijas instrukcija. Lietotnē tie ir rediģējami produktu profili.

| Parametrs | Simbols | Tipiski | Noklusējums | Veids |
|---|---|---|---|---|
| Dēļa garums (redzamais) | L | 1200–1400, arī 2000+ | 1285 | ievade |
| Dēļa platums (redzamais) | W | 140–250 | 192 | ievade |
| Dēļi pakā | — | 6–10 | 8 | ievade |
| Zāģa griezums | k | 0 (giljotīna) – 3 | 3 | ievade |
| Min. gabala garums | L_min | 200–400 | 300 | stingrs |
| Min. šuvju nobīde | D | 200–400 | 300 | stingrs galarezultātā |
| Min. strēmeles platums | w_min | ≥ 50 vai ≥ W/3 | 50 | stingrs, ja iespējams |
| Izplešanās sprauga | g | 8–15 | 10 | ievade (katrai malai atsevišķi) |
| Min. sprauga (kustībai) | g_min | — | 7 | pielaidēm |
| Maks. sprauga (nosedz grīdlīste) | g_max | grīdlīstes biezums − ~2 | 14 | pielaidēm |
| "H" raksta attālums | D_H | — | 100 | mīksts (estētika) |
| Maks. garums/platums bez dilatācijas | — | pēc produkta | — | brīdinājums |
| Raksts | — | brīvs / fiksēts 1/2, 1/3 | brīvs | ievade |
| Rezerve | — | 0–5 % | 2 % | ievade |

- **Stingrs** nozīmē, ka plānam tas jāizpilda. **Mīksts** nozīmē sodu mērķa funkcijā.
- Parametru validācija: `L_min ≤ L/2`, `D < L/2`, `w_min < W/2`, `g_min ≤ g ≤ g_max`.

## 6. Gadījumu katalogs

Kolonna "Fāze" norāda `ROADMAP.md` fāzi, kurā gadījumu atbalsta. ✗ nozīmē ārpus tvēruma.

### A. Telpas forma

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| A1 | Taisnstūris | daudzstūris ar 4 virsotnēm | F1 |
| A2 | Taisnleņķa daudzstūri: L, U, T, Z, nišas, izvirzījumi | vispārīgs daudzstūris; josla var dot vairākus segmentus; iekšējos stūros robi | F1–F3 |
| A3 | Sienas nav 90° (trapece, paralelograms, "šķība" telpa) | vispārīgs daudzstūris; gala gabali ir trapeces | F1–F3 (konservatīvi), F14 (precīzi) |
| A4 | Erkers (135° leņķi) | tas pats, kas A3 | F1–F3 |
| A5 | Izliekta siena (loks, pusaplis) | mala ar `bulge` (precīzs loks); kodols to diskretizē ar ≤ 0,5 mm novirzi | F1 (ģeometrija), F8 (rīki) |
| A6 | "Taisna" siena, kas patiesībā ir izliekta vai viļņaina | ordinātas no atskaites līnijas → lauzta līnija | F9 |
| A7 | Vairākas daļas, ko savieno šaura eja | segmenti un kaimiņu grafs to apstrādā automātiski | F2 |
| A8 | Šaura niša (šaurāka par vienu rindu) | brīvi gabali un strēmeles bez garo malu profiliem | F3 |
| A9 | Siena gandrīz paralēla rindām (telpa "nav taisna") | pirmā/pēdējā rinda ar mainīgu platumu (strēmele pēc sienas) | F3 |
| A10 | Izgriezumi un ielikumi sienā: V, taisnstūris, trapece, pusaplis, loka segments, brīva līnija | redaktora formu rīki → tas pats daudzstūris ar taisnēm un lokiem; parametri saglabāti kā rediģējama grupa | F8 |
| A11 | Noapaļoti vai nošķelti stūri | noapaļojums = loka mala, nošķēlums = taisna mala | F8 |

### B. Šķēršļi un atveres

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| B1 | Kolonna, skurstenis, izvirzījums | caurums (daudzstūris) + sprauga | F1–F3 |
| B2 | Fiksētas mēbeles (virtuves skapji, iebūvēts skapis) — zem tām neklāj | caurums vai telpas robeža; malas tips `fixed` | F1 |
| B3 | Radiatoru caurules | urbuma pazīme uz gabala (Ø + 2·sprauga), nevis segmentu ģeometrija | F3 (pazīme), F14 (instrukcija) |
| B4 | Revīzijas lūka | caurums ar savu malas tipu | F1 |
| B5 | Durvju kārba (laminats iet zem kārbas) | zona paplašināta durvju ailā un zem kārbas | F1 (ģeometrija), F8 (rīks) |
| B6 | Durvju aila uz citu telpu | `continuous` (vienots rindu tīkls) vai `profile` (atsevišķa zona) | F13 |
| B7 | Kāpņu augšmala | malas tips `stairs` ar savu spraugu | F1 |
| B8 | Grīdas apkure | ģeometriju neietekmē | ✗ |
| B9 | Apaļa vai pusapaļa kolonna | aplis vai daudzstūris ar lokiem + sprauga (atšķirībā no caurules — īsts caurums ģeometrijā) | F1–F3 |

### C. Malas un spraugas

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| C1 | Sprauga gar visām sienām | noklusējuma g | F1 |
| C2 | Atšķirīga sprauga katrai malai | `edges[i].gap` | F1 |
| C3 | Sprauga ap šķēršļiem un caurulēm | `obstacle.gap` | F1 |
| C4 | Maks. izmēri bez dilatācijas šuves | brīdinājums un ieteikums, kur likt profilu | F13 |
| C5 | Pielaides mērījumu kļūdām | no g_min…g_max iegūst pieļaujamo kļūdu katrai sienai | F11 |

### D. Dēlis un produkts

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| D1 | L, W, pakas | produkta profils | F2 |
| D2 | Profilu orientācija (nevar pagriezt) | gabalu klases: īsie gali × garās malas (§3) | F2–F3 |
| D3 | Īso galu savienojuma tips (angle/drop/tap) | griešanu neietekmē | ✗ |
| D4 | Kerf: 0 giljotīnai, 2–3 mm zāģim | k | F3 |
| D5 | Bojāti dēļi, kļūdas | rezerve % | F11 |
| D6 | Ierobežots dekoru skaits (raksts atkārtojas) | vēlāk, iespējams: ieteikums pilno dēļu secībai | ✗ |
| D7 | Garas plankas (2000+ mm) | tas pats modelis | F2 |

### E. Raksts un noteikumi

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| E1 | Min. šuvju nobīde | stingrs galarezultātā, sods meklēšanas laikā | F3/F5 |
| E2 | Min. gabala garums | pieļaujamo φ kopa (nekad netiek pārkāpts) | F2 |
| E3 | Min. strēmeles platums, rindu līdzsvarošana | y0 izvēle | F5 |
| E4 | "H" raksts (rindu i un i+2 šuves sakrīt) | mīksts sods | F3 |
| E5 | Regulāras "kāpnes" | mīksts sods (neobligāts) | F5 |
| E6 | Fiksēts raksts (1/2, 1/3 nobīde, piem., flīžu imitācija) | `φ_j = φ_0 + j·p·L`; domēns (φ_0, y0), pilnā pārlase | F14 |
| E7 | Virziens: gaisma, garākā siena, koridors, diagonāle 45° | θ; automātisks salīdzinājums | F5, F10 |
| E8 | Skujiņa / eglīte | cits produkts un modelis | ✗ |
| E9 | Sākuma siena un klāšanas virziens rindā | `angleDeg` + `stackSide` | F5 |

### F. Vairākas telpas

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| F1 | Kopīga atgriezumu krātuve | viens dekoders visiem segmentiem | F13 |
| F2 | Nepārtraukta grīda caur durvīm | viena grupa: kopīgs θ un y0, zonas apvienotas | F13 |
| F3 | Telpas atdalītas ar profiliem | atsevišķas grupas ar saviem θ un y0 | F13 |
| F4 | Dažādi produkti | atsevišķas krātuves pa produktiem | F13 |

### G. Griešana un izpilde

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| G1 | Iepriekšēja griešana (globāla pārošana) | `mode: precut` | F3 |
| G2 | Secīga klāšana (atgriezumu kaudze) | `mode: onsite` — pāris tikai uz vēlāku rindu | F4 |
| G3 | Hibrīds — dažus galus griež uz vietas | `trimMargin` un atzīmētas rindas | F14 |
| G4 | Griešanas karte pa dēļiem, grupēta pēc garuma (atdurs) | `cutlist` | F3, F11 |
| G5 | Marķējumi un uzlīmes | etiķešu lapas | F11 |
| G6 | Pirmās un pēdējās rindas strēmeles no viena dēļa | dekodera B posms | F3 |
| G7 | Slīpi griezumi | abu garo malu garumi | F3 |
| G8 | Robi iekšējos stūros un durvīs | roba izmēri no gabala malām | F3 |
| G9 | Urbumi caurulēm | Ø un centra koordinātas no gabala gala un malas | F14 |
| G10 | Pakas, rezerve, izmantojamie atlikumi | kopsavilkums | F11 |
| G11 | Nospraušana | pirmās rindas līnija, kontrolpunkti | F11 |
| G12 | Trausli gabali (šaura "mēlīte" robā) | brīdinājums; sods y0 un φ izvēlē | F14 |
| G13 | Līkumoti griezumi (gabali pie lokiem) | pazīme `curveCut`: figūrzāģis, ordinātu tabula, 1:1 šablons; pēc noklusējuma iesaka griezt uz vietas pēc šablona | F3 (pazīme), F11 (šabloni) |

### H. Mērījumi

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| H1 | Taisnleņķa telpa ar sienu garumiem | redaktors vai sienu tabula | F8 |
| H2 | Netaisnleņķa telpa: diagonāles, leņķi, saslēgšanās kļūda | mazāko kvadrātu saskaņošana ar atlikumiem | F9 |
| H3 | Izliektas sienas | ordinātas no atskaites līnijas | F9 |
| H4 | Kontrolmērījumi pirms griešanas | lietotne iesaka 2–3 attālumus pārbaudei | F11 |
| H5 | Loka mērīšana | horda + bultas augstums vai 3 punkti; "pusaplim" pārbauda, vai dziļums = platums/2 | F9 |

### I. Papildu materiāli

| # | Gadījums | Modelēšana | Fāze |
|---|---|---|---|
| I1 | Grīdlīstes (1D griešana, stūru griezumi; lokiem — lokanas grīdlīstes) | tas pats princips, cits dekoders | F15 |
| I2 | Pārejas profili | skaits un garumi | F15 |
| I3 | Pamatne (ruļļi) | laukums + pārlaide | F15 |

## 7. Izpildes realitāte: kāpēc iepriekšēja griešana strādā

- Dēļu izmēri ir rūpnīcas precizitātē, un rinda neuzkrāj kļūdu garumā. Gabals būs tieši tik garš, cik plānots.
- Kļūdas avots ir **telpas mērījumi**. Tos absorbē izplešanās sprauga: siena drīkst būt par `g − g_min` tuvāk vai par `g_max − g` tālāk nekā izmērīts. Ar noklusējumiem tas ir −3…+4 mm.
- Lāzera tālmērs (tipiski ±1,5–2 mm) ir pietiekams. Līkas sienas jāuzmēra vairākos punktos (H3).
- Katru rindu klāj, piespiežot to pie sākuma sienas ķīlīšiem. Sprauga rindas beigās absorbē atlikušo kļūdu.
- Pirmās rindas novietojums ir kritisks. Plāns dod attālumu no sienas un kontrolpunktus (G11).
- Pēdējo rindu pirms garengriezuma iesaka pārmērīt, jo savienojumos uzkrājas nelielas pielaides.
- Hibrīdrežīms (G3): nedrošām sienām gala gabalus plāno ar rezervi `trimMargin` un nogriež uz vietas.
- Izgriezumus ap caurulēm plānā norāda, bet iesaka pārbaudīt uz vietas, pirms urbj.

## 8. Datu modelis (TypeScript)

Patiesības avots ir zod shēmas `packages/core/src/model/schema.ts`; TypeScript tipi ir to izvade (`z.output`). Zemāk esošais bloks ir lasāms pārskats. Atšķirības no tā, kas tika plānots pirms F2:

- Noklusējumus aizpilda shēma: visiem `Rules` laukiem ir noklusējums no §5 tabulas (`hPattern.enabled` = true, `pattern` = `{ kind: 'free' }`; `fixed.fraction` ∈ (0, 1)); `EdgeProps.kind` = `wall`; `Doorway.mode` = `continuous`; `LayoutSettings` = `auto` virzienam, pusei un `y0`, `precut`, `aesthetics` 0,5, `seed` 1, `timeLimitMs` 3000.
- `Project.meta?: { source: 'planted' | 'manual' | 'real'; knownOptimum?; bestKnown? }` (testa instancēm, sk. §9).
- Modeļa integritāti pārbauda `model/integrity.ts` (parametru diapazoni no §5, CCW un vienkāršs kontūrs ar lokiem, `edges.length === outline.length`, unikāli ID, durvju atsauces un diapazons); tā nav neatkarīgais plāna validētājs `core/validate`.
- Ielāde: `parseProject` = migrācija (`schemaVersion`) → zod → integritāte; `saveProject` raksta kanonisku JSON (shēmas atslēgu secība).
- `Plan`, `PlannedPiece`, `PlannedBoard` (zemāk) ir F3 izvade un modelī vēl nav.

```ts
/** Visi garumi — milimetros. */
export type Mm = number;
export interface Vec2 { x: Mm; y: Mm }

export interface Product {
  id: string;
  name: string;
  boardLength: Mm;          // L — redzamais garums (bez spundes)
  boardWidth: Mm;           // W — redzamais platums
  boardsPerPack: number;
  pricePerPack?: number;
}

export interface Rules {
  kerf: Mm;                 // k
  minPieceLength: Mm;       // L_min
  minStagger: Mm;           // D
  minRipWidth: Mm;          // w_min
  expansionGap: Mm;         // g — noklusējums visām malām
  minGap: Mm;               // g_min — pielaidēm
  maxGap: Mm;               // g_max — ko vēl nosedz grīdlīste
  hPattern: { enabled: boolean; distance: Mm };            // D_H
  pattern: { kind: 'free' } | { kind: 'fixed'; fraction: number };  // 1/2, 1/3
  maxRunLength?: Mm;
  maxRunWidth?: Mm;
  reservePercent: number;
}

export type EdgeKind = 'wall' | 'transition' | 'stairs' | 'fixed' | 'doorway';
export interface EdgeProps {
  kind: EdgeKind;
  gap?: Mm;                 // pārraksta noklusējumu
  /** Loka mala (kā DXF): bulge = tan(θ/4), θ — loka centrālais leņķis.
   *  0 vai nav = taisne; ±1 = pusaplis. > 0: loks iet pretēji pulksteņrādītājam
   *  un ir izliekts pa labi no virziena outline[i] → outline[i+1]. CCW telpā tas
   *  nozīmē uz āru (izvirzījums), < 0 — uz iekšu (niša). */
  bulge?: number;
}

/** Virsotne ar stabilu ID (izvēlei, undo, formu grupām). */
export interface Vertex extends Vec2 { id?: string }

export type Obstacle =
  | { kind: 'polygon'; id: string; label?: string; points: Vertex[]; bulges?: number[]; gap?: Mm }
  | { kind: 'circle'; id: string; label?: string; center: Vec2; diameter: Mm; gap?: Mm }  // apaļa kolonna
  | { kind: 'pipe'; id: string; center: Vec2; diameter: Mm; gap?: Mm };                   // tikai urbums

/** Redaktorā ievietota forma, ko var rediģēt pēc parametriem (UI metadati).
 *  Ģeometrijas avots vienmēr ir outline + bulge; kodols šo lauku ignorē. */
export interface WallShape {
  id: string;
  kind: 'rect' | 'trapezoid' | 'triangle' | 'semicircle' | 'arcSegment' | 'freeform' | 'fillet' | 'chamfer';
  params: Record<string, number>;   // platums, dziļums, diametrs, rādiuss, leņķis...
  vertexIds: string[];              // virsotnes, kas pieder formai
}

export interface Room {
  id: string;
  name: string;
  code: string;             // īss kods marķējumiem, piem. "DZ"
  outline: Vertex[];        // vienkāršs daudzstūris, CCW, bez pašķrustošanās (arī pēc loku diskretizācijas)
  edges: EdgeProps[];       // edges[i]: outline[i] → outline[i+1]
  obstacles: Obstacle[];
  wallShapes?: WallShape[];
}

export interface Doorway {
  id: string;
  roomA: string; edgeA: number; offsetA: Mm;     // pozīcija uz malas no tās sākuma
  roomB?: string; edgeB?: number; offsetB?: Mm;
  width: Mm;
  depth: Mm;                // cik dziļi grīda iet ailā
  jambUndercut: Mm;         // cik zem durvju kārbas katrā pusē
  mode: 'continuous' | 'profile';
}

export interface LayoutSettings {
  angleDeg: number | 'auto';             // virziens, kurā liek dēļus rindā
  stackSide: 'left' | 'right' | 'auto';  // uz kuru pusi krājas rindas (skatoties klāšanas virzienā)
  rowOffset: Mm | 'auto';                // y0
  mode: 'precut' | 'onsite';
  trimMargin: Mm;                        // hibrīdam (F14)
  aesthetics: number;                    // 0..1 → λ_H
  seed: number;
  timeLimitMs: number;
}

export interface Project {
  schemaVersion: 1;
  name: string;
  product: Product;
  rules: Rules;
  rooms: Room[];
  doorways: Doorway[];
  settings: LayoutSettings;
}
```

Plāna izvade:

```ts
export type ShortNeeds = 'start' | 'end' | 'full' | 'free';  // kuri īsie gali vajadzīgi
export type LongNeeds  = 'both' | 'low' | 'high' | 'none';   // kuras garās malas vajadzīgas

export interface PlannedPiece {
  id: string;               // marķējums, piem. "DZ-05a-S"
  roomId: string;
  band: number;             // rindas numurs no sākuma sienas (1..)
  segmentId: string;
  indexInRow: number;
  short: ShortNeeds;
  long: LongNeeds;
  extent: Mm;               // x apjoms (pārošanai)
  lengthLow: Mm;            // garums gar apakšmalu
  lengthHigh: Mm;           // garums gar augšmalu
  width: Mm;                // vajadzīgais platums
  outline: Vec2[];          // precīza forma telpas koordinātās
  boardId: string;
  boardRect: { x: Mm; y: Mm; w: Mm; h: Mm };   // novietojums dēlī (dēļa koordinātās)
  features: PieceFeature[]; // robi, slīpumi, urbumi
}

export type PieceFeature =
  | { kind: 'bevelCut'; side: 'left' | 'right'; lengthLow: Mm; lengthHigh: Mm }
  | { kind: 'notch'; corner: 'lowLeft' | 'lowRight' | 'highLeft' | 'highRight'; dx: Mm; dy: Mm }
  | { kind: 'drill'; x: Mm; y: Mm; diameter: Mm }       // gabala koordinātās
  | { kind: 'scribe'; widthAtLeft: Mm; widthAtRight: Mm }
  | { kind: 'curveCut'; side: 'left' | 'right' | 'low' | 'high';
      ordinates: { at: Mm; offset: Mm }[];   // ik pēc 50 mm: attālums no gabala malas līdz griezumam
      tool: 'jigsaw'; cutOnSite: boolean };

export interface PlannedBoard {
  id: string;               // "D07"
  placements: { pieceId: string; rect: { x: Mm; y: Mm; w: Mm; h: Mm } }[];
}

export interface Plan {
  boards: PlannedBoard[];
  pieces: PlannedPiece[];
  stats: {
    boards: number; packs: number; wastePct: number; areaInstalled: number;
    lb0: number; lb1: number; provenOptimal: boolean;
  };
  warnings: { code: string; message: string; refs: string[] }[];
}
```

Griešanas instrukcijas (secību, grupēšanu pēc garuma) no `placements` iegūst `core/cutlist`. Plānā tās neglabā.

## 9. Instances JSON piemērs

```json
{
  "schemaVersion": 1,
  "name": "L veida dzīvojamā istaba",
  "product": { "id": "demo-1285x192", "name": "Demo 1285×192", "boardLength": 1285, "boardWidth": 192, "boardsPerPack": 8 },
  "rules": {
    "kerf": 3, "minPieceLength": 300, "minStagger": 300, "minRipWidth": 50,
    "expansionGap": 10, "minGap": 7, "maxGap": 14,
    "hPattern": { "enabled": true, "distance": 100 },
    "pattern": { "kind": "free" }, "reservePercent": 2
  },
  "rooms": [{
    "id": "r1", "name": "Dzīvojamā", "code": "DZ",
    "outline": [
      { "x": 0, "y": 0 }, { "x": 5200, "y": 0 }, { "x": 5200, "y": 3100 },
      { "x": 3000, "y": 3100 }, { "x": 3000, "y": 4600 }, { "x": 0, "y": 4600 }
    ],
    "edges": [
      { "kind": "wall" }, { "kind": "wall" }, { "kind": "wall" },
      { "kind": "wall" }, { "kind": "wall" }, { "kind": "wall" }
    ],
    "obstacles": [
      { "kind": "pipe", "id": "p1", "center": { "x": 5130, "y": 1400 }, "diameter": 16 }
    ]
  }],
  "doorways": [],
  "settings": {
    "angleDeg": 0, "stackSide": "left", "rowOffset": "auto", "mode": "precut",
    "trimMargin": 0, "aesthetics": 0.5, "seed": 1, "timeLimitMs": 3000
  }
}
```

Testa instancēm pievieno lauku `"meta": { "knownOptimum"?: number, "bestKnown"?: number, "source": "planted" | "manual" | "real" }`.

## 10. Izvade klājējam

### Marķējumi

`<telpa>-<rinda><segments>-<pozīcija>`:

- `DZ-05a-S` — telpa DZ, 5. rinda (skaitot no sākuma sienas), segments a, sākuma gabals;
- `DZ-05a-03` — 3. gabals rindā;
- `DZ-05a-B` — beigu gabals.

Ja projektā ir viena telpa, telpas kodu var izlaist. Segmenta burtu raksta tikai tad, ja joslā ir vairāki segmenti. Dēļiem ir numuri `D01`, `D02`, …

### Griešanas karte (piemērs teksta formā)

```
D07  (1285 × 192)
  ✂ šķērsgriezums pie 743 mm
  ├─ kreisā daļa  743 mm → DZ-05-B   (5. rindas beigas)
  └─ labā daļa    539 mm → DZ-11-S   (11. rindas sākums)
     atgriezums:   0 mm   (kerf 3 mm)

D15  (1285 × 192)
  ✂ garengriezums: apakšējā strēmele 84 mm | augšējā 105 mm
  ├─ apakšējā → DZ-24-01  (pēdējā rinda)
  └─ augšējā  → DZ-01-01  (pirmā rinda)
```

Pārbaude: 743 + 3 + 539 = 1285; 84 + 3 + 105 = 192.

### Atdura saraksts

Vienādus šķērsgriezumus grupē, lai atduri iestata vienu reizi, piemēram: `743 mm — D07, D12, D19 (3×)`. Sakārto pēc garuma dilstošā secībā.

### Klāšanas secība

Katrai rindai: gabali secībā no kreisās uz labo ar marķējumiem un garumiem.
