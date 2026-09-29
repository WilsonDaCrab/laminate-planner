# UI.md — Lietotne, redaktors un izvades

## 1. Platforma

**Web-first PWA** (TypeScript + React). Viena lietotne darbojas:

- datorā pārlūkā un kā instalēta lietotne (Chrome/Edge "Instalēt lietotni");
- planšetē un telefonā uz objekta ("Pievienot sākuma ekrānam");
- **bez interneta** (service worker); visi aprēķini notiek ierīcē Web Worker.

Serveris nav vajadzīgs: izvieto kā statisku vietni (GitHub Pages / Cloudflare Pages). Ja vēlāk vajadzēs klasisku instalētāju (.exe/.dmg) vai lietotņu veikalu, to pašu kodu ietin Tauri (dators) vai Capacitor (mobilās). Pamatojums: `DECISIONS.md` ADR-001.

## 2. Galvenās plūsmas

1. **Pilnā plūsma.** Jauns projekts → produkts (profils vai L, W, paka) → telpa (sagatave, līnijas vai sienu tabula) → precīzi izmēri → durvis un šķēršļi → **Aprēķināt** → virzienu salīdzinājums → plāns → drukāt/eksportēt → klāšanas režīms telefonā.
2. **Ātrā tāme.** Divi izmēri (vai sienu tabula) → paku skaits un aptuvens atgriezumu procents, bez zīmēšanas.
3. **Atkārtots darbs.** Projektu saraksts → atvērt → mainīt produktu vai virzienu → pārrēķināt.

## 3. Ekrāna izkārtojums (dators)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Projekts ▾   ↶ ↷   [Zīmēt | Plānot | Klāt]         Saglabāts ✓   LV ▾  ⋯  │
├────┬───────────────────────────────────────────────────┬─────────────────┤
│ ↖  │                                                   │ Īpašības        │
│ ╱  │                                                   │  (izvēlētā      │
│ ▭  │               audekls (mm, režģis)                │   mala/virsotne/│
│ •  │                                                   │   šķērslis)     │
│ ⊓  │                                                   ├─────────────────┤
│ ◠  │                                                   │ Telpas          │
│ ▦  │                                                   │ Produkts        │
│ ◯  │                                                   │ Klāšana         │
│ ⌂  │                                                   │                 │
│ 📏 │                                                   │                 │
├────┴───────────────────────────────────────────────────┴─────────────────┤
│ Rezultāti:  Plāns | Griešana | Rindas | Materiāli | Salīdzinājums        │
└──────────────────────────────────────────────────────────────────────────┘
```

Telefonā kreisā rīkjosla ir apakšā, bet paneļi ir izvelkamas lapas (bottom sheets).

## 4. Redaktors

### 4.1 Audekls

- Pasaules koordinātas ir mm; kamera = mērogs + nobīde.
- Zoom: ritenis, pinch; pārvietošana: vidējā poga, atstarpe + vilkšana, divi pirksti.
- Režģis: 100 mm smalks, 1 m galvenais; lineāli malās; mēroga josla.
- Katras malas garums ir redzams uz malas (klikšķis → rediģēt). Leņķi, kas nav 90°, redzami pie virsotnēm.

### 4.2 Rīki

| Rīks | Taustiņš | Darbība |
|---|---|---|
| Izvēle | V | izvēlēties, vilkt virsotnes un malas, rāmis vairākiem |
| Līnija (siena) | L | lauzta līnija ar klikšķiem vai ievadītiem garumiem; noslēdz, uzklikšķinot uz sākuma punkta |
| Taisnstūris | R | vilkt vai ievadīt `4200×3100` |
| Sagataves | — | L, U, T telpas ar parametru dialogu |
| Punkts sienā | P | ievieto virsotni malā (arī dubultklikšķis uz malas); punktu uzreiz var vilkt, lai ievilktu izgriezumu (§4.6) |
| Formas ielikums | I | izvēlas sienu → forma (taisnstūris, trapece, trīsstūris, pusaplis, loka segments, brīva līnija) → parametri (§4.6) |
| Izliekt | A | pārvērš visu malu lokā: bultas augstums vai rādiuss; loka vidū ir rokturis vilkšanai |
| Stūris | F | virsotni noapaļo (rādiuss) vai nošķeļ (nošķēluma garums) |
| Šķērslis | O | taisnstūris, daudzstūris (arī ar lokiem) vai aplis — apaļa kolonna |
| Caurule | C | aplis: diametrs, pozīcija ar attālumiem līdz divām sienām |
| Durvis | D | uz malas: pozīcija, platums, dziļums, zem kārbas, režīms (turpinās / profils) |
| Mērījums | M | diagonāle vai attālums starp divām virsotnēm (sk. §5) |
| Pārvietot skatu | H | |

Vispārīgi taustiņi: Esc — atcelt; Backspace — noņemt pēdējo punktu; Delete — dzēst izvēlēto; Ctrl+Z / Ctrl+Shift+Z; F8 — orto režīms; Alt (turot) — īslaicīgi bez piesaistes.

### 4.3 Līnijas rīks (dinamiskā ievade)

- Pēc pirmā klikšķa līnija seko pelei, un blakus redzams garums un leņķis.
- **Ierakstot skaitli**, līnija saņem tieši šo garumu pašreizējā virzienā. `Tab` pārslēdz uz leņķa lauku, `Enter` apstiprina.
- Ievade `3450<90` nozīmē: garums 3450 mm, pagrieziens 90° pa kreisi attiecībā pret iepriekšējo malu (relatīvs leņķis).
- Klikšķis uz sākuma punkta noslēdz daudzstūri un izveido telpu.
- Pēc noklusējuma ir orto režīms (0°/90°). Arī 45° un paralēli/perpendikulāri esošām malām ir piesaistes mērķi.

### 4.4 Piesaiste (prioritāte)

1. Esoša virsotne.
2. Malas turpinājums vai krustpunkts ar citas virsotnes x/y palīglīniju.
3. Esoša mala (tuvākais punkts).
4. Leņķis (orto, 45°, paralēli, perpendikulāri).
5. Režģis (ja ieslēgts).

Aktīvo piesaisti parāda ar palīglīnijām un ikonu. Piesaistes loģika ir tīrs TS modulis (`editor/snap.ts`) ar vienībtestiem.

### 4.5 Rediģēšana

- **Malas garuma maiņa** pārvieto **nākamo** malu malas virzienā (kā sienas "pabīdīšana"). Orto telpā leņķi saglabājas, un mainās nākamās paralēlās malas garums. Pirms apstiprināšanas parāda, kura siena kustēsies; `Shift` apgriež pusi.
- Malas vilkšana pārvieto to perpendikulāri, saglabājot blakus malu virzienus.
- Virsotnes vilkšana ar piesaisti. Skaitliska ievade: absolūtās koordinātas vai attālums līdz atskaites virsotnei.
- **Sienu tabula** (alternatīva zīmēšanai): rindā ir garums un pagrieziens (pa labi/kreisi 90° vai cits leņķis), piemēram, `4200 ↱ 3100 ↱ 2200 ↰ 1500 ↱ …`. Tabula un zīmējums ir sinhronizēti. Parāda saslēgšanās kļūdu (atstatums starp beigu un sākuma punktu). Loka malai tabulā ir papildu kolonna "bultas augstums".

### 4.6 Izgriezumi un formas sienās

Jebkuru sienu var pārveidot četros veidos. Visos gadījumos pēc darbības visi jaunie izmēri ir redzami un rediģējami skaitliski, tāpēc peles precizitāte nav svarīga.

**a) Brīvs izgriezums, velkot punktu.**

- Uzvirzot kursoru uz sienas, parādās "spoku" punkts. Velkot to prom no sienas, rodas jauna virsotne, un siena ieliecas uz iekšu vai izliecas uz āru (V forma).
- Velkot ar `Shift` nevis punktu, bet sienas **posmu** (starp diviem ievietotiem punktiem), posms pārvietojas perpendikulāri sienai, un sānu malas paliek perpendikulāras. Tā rodas taisnstūra niša vai izvirzījums (push/pull).
- Vilkšanas laikā rāda attālumu no tuvākā stūra, dziļumu un leņķi; tos var ierakstīt tieši (kā līnijas rīkā).
- Piesaiste: orto, 45°, citu virsotņu x/y palīglīnijas.

**b) Formas ielikums sienā.** Izvēlas sienu, formu un parametrus. Novietojums: attālums no sienas sākuma vai "centrēt". Virziens: uz iekšu (niša) vai uz āru (izvirzījums).

| Forma | Parametri | Piemērs |
|---|---|---|
| Taisnstūris | platums, dziļums | niša, skurstenis, izvirzījums |
| Trapece | platums pie sienas, platums dziļumā vai sānu leņķis, dziļums | erkers ar 45° sāniem |
| Trīsstūris (V) | platums, dziļums | stūra izvirzījums, slīps iegriezums |
| Pusaplis | diametrs (dziļums = rādiuss) | apaļš erkers, pusapaļa niša |
| Loka segments | horda un bultas augstums (vai rādiuss) | plakani izliekts erkers |
| Brīva līnija | zīmē lauztu līniju un lokus starp diviem sienas punktiem | neregulāra forma |

- Pirms apstiprināšanas rāda priekšskatījumu.
- Ievietotā forma paliek **rediģējama grupa**: to var atlasīt un mainīt parametrus (piem., diametru vai dziļumu), pārvietot pa sienu vai dzēst. Ja lietotājs rediģē grupas virsotnes atsevišķi, grupa pārvēršas parastās malās (ar brīdinājumu, ko var atsaukt).
- Formas var ievietot arī šķēršļos (piem., pusapaļa kolonna pie sienas).

**c) Visas malas izliekšana.** Izvēlas malu → "Izliekt" → bultas augstums vai rādiuss, uz āru vai uz iekšu. Loka vidū ir rokturis, ko var vilkt.

**d) Stūri.** Izvēlas virsotni → noapaļot (rādiuss) vai nošķelt (nošķēluma garums vai divi attālumi no stūra).

**Loku glabāšana un izmēri.**

- Loki glabājas precīzi — katrai malai ir `bulge` (kā DXF formātā: 0 = taisne, ±1 = pusaplis), nevis daudzi punkti. Tāpēc tos var rediģēt, un izmēri paliek precīzi. Lauztā līnijā tos pārvērš tikai kodols aprēķinam (`ALGORITHM.md` §2.1).
- Loka malai rāda hordu, bultas augstumu un rādiusu (un loka garumu informācijai). Mainot jebkuru no tiem, pārējos pārrēķina, un malas galapunkti paliek vietā.
- Piesaistes mērķi: loka centrs, loka viduspunkts, pieskare.

### 4.7 Validācija

Pastāvīgi pārbauda:

- pašķrustošanos;
- ļoti īsas malas (< 20 mm);
- šķēršļus ārpus telpas;
- durvis ārpus malas;
- sasniedzamību (vai zona Z nav tukša).

Kļūdas iezīmē audeklā un sarakstā ar pogu "Rādīt".

### 4.8 Malu īpašības

Tips: `siena` / `pārejas profils` / `kāpnes` / `fiksēts elements` / `durvju aila`. Spraugu var pārrakstīt katrai malai. Tipu attēlo ar līnijas stilu.

### 4.9 Vēsture un saglabāšana

- Undo/redo ar Immer patch. Vilkšanas žests ir viens solis.
- Automātiska saglabāšana IndexedDB ik pēc izmaiņas (ar debounce).
- Projektu saraksts; eksports un imports `.json`; shēmas versija ar migrācijām.

## 5. Mērījumu režīms

Netaisnleņķa telpai sienu garumi nenosaka formu viennozīmīgi. n-stūrim vajag n − 3 papildu mērījumus (diagonāles vai leņķus).

- **Mērījumi:** malas garums, diagonāle (starp divām virsotnēm), leņķis pie virsotnes, ordināta no atskaites līnijas.
- **Saskaņošana:** nezināmie ir virsotņu koordinātas (v₀ = (0, 0), v₁ uz +x ass). Tā ir nelineāra mazāko kvadrātu problēma, ko risina ar pašu Gauss–Newton / Levenberg–Marquardt (mazs blīvs sistēmas risinājums ar Cholesky) — `core/survey`.
- **Atlikumi:** katram mērījumam rāda atšķirību starp ievadīto un modeļa vērtību. Krāsas: < 2 mm zaļš, < 5 mm dzeltens, citādi sarkans. Ja ir liekie mērījumi, viena kļūdaina mērījuma (piem., par 20 mm) atlikums izceļas.
- **Nepietiek mērījumu:** parāda, cik vēl vajag un kuras diagonāles ieteicams izmērīt.
- **Viļņaina "taisna" siena:** atskaites līnija gar sienu (lāzers vai aukla) un attālumi līdz sienai ik pēc X mm → mala kļūst par lauztu līniju.
- **Loks:** horda un bultas augstums (auklu izstiepj starp loka galiem un mēra attālumu līdz sienai vidū) vai trīs punkti uz loka. "Pusaplim" vienmēr mēra gan platumu, gan dziļumu: ja dziļums ≠ platums/2, tas patiesībā ir loka segments, un lietotne to parāda.
- **Kontrolmērījumi (H4):** pirms griešanas lietotne iesaka 2–3 vēl nemērītus attālumus ar lielāko informatīvo vērtību (piem., garākā diagonāle) un sagaidāmo vērtību. Lietotājs ievada faktisko. Ja starpība pārsniedz pielaidi, brīdina: "neiesakām griezt iepriekš".

## 6. Produkts un noteikumi

- Produktu profili: saglabāti lietotāja profili un daži piemēri ar tipiskām vērtībām (skaidri atzīmēti kā piemēri, nevis konkrēti zīmoli).
- Visi `Rules` lauki ar paskaidrojumiem un saiti "kur to atrast produkta instrukcijā".
- Parametru validācija (`DOMAIN.md` §5).

## 7. Aprēķins

- **Iestatījumi:** virziens (fiksēts / auto; ātrās pogas "paralēli malai …"), sākuma puse, rindu nobīde (auto / pirmās rindas platums), režīms (iepriekšēja griešana / secīgi), estētikas slīdnis (Materiāls ↔ Izskats), laika budžets.
- **Aprēķināt:** B-INST rezultāts parādās uzreiz (< 200 ms). SA to uzlabo fonā, izmantojot vairākus Web Worker (`navigator.hardwareConcurrency − 1`).
- **Progress:** labākais dēļu skaits, LB, "līdz minimumam: +N", laiks. Ja B = LB, parāda nozīmīti **"Pierādīts minimums"**. Poga "Apturēt".
- **Virzienu salīdzinājums:** tabula ar sīkattēliem (dēļi, pakas, atgriezumi %, strēmeļu rindas, griezumu skaits). Lietotājs izvēlas, un plāns pārslēdzas.
- **Novecošana:** jebkura projekta izmaiņa rezultātu atzīmē kā novecojušu (hash no `Project`). Automātisks pārrēķins pēc 500 ms dīkstāves (var izslēgt).

## 8. Rezultāti

### 8.1 Plāns

- Gabali uzklāti uz telpas. Viena dēļa gabali ir vienā krāsā (nokrāsa no dēļa ID), tāpēc pāri redzami uzreiz.
- Marķējumi (ieslēdzami), rindu numuri, šuves.
- Brīdinājumi (trausli gabali, pielaides) ar ikonām.
- Klikšķis uz gabala → inspektors: marķējums, izmēri, dēlis, pāra gabals, griezumi, urbumi.
- Pārslēgi: rādīt šuvju attālumus, rādīt strēmeļu rindas, rādīt atgriezumus.

### 8.2 Griešana (pa dēļiem)

- Kartīte katram dēlim ar SVG shēmu: garengriezumi, šķērsgriezumi, gabalu marķējumi, izmēri, atgriezumi.
- **Atdura saraksts:** vienādi šķērsgriezumi grupēti un sakārtoti dilstoši (`743 mm — D07, D12, D19 (3×)`).
- Slīpiem griezumiem — abu malu garumi. Robiem — dx × dy no stūra. Urbumiem — Ø un koordinātas no gabala gala un malas.
- **Līkumoti griezumi** (gabali pie lokiem) ir atsevišķā sadaļā ar atzīmi "figūrzāģis", jo tos nevar izdarīt ar giljotīnu vai atduri. Katram ir ordinātu tabula (attālums no gabala malas līdz griezuma līnijai ik pēc 50 mm) un 1:1 šablons drukai. Pēc noklusējuma lietotne iesaka šos gabalus griezt pēc šablona uz vietas, jo liektas sienas reti ir precīzas.
- Atzīmēšana "sagriezts" (saglabājas).

### 8.3 Rindas (klāšanas secība)

Katrai rindai: gabali no kreisās uz labo ar marķējumiem un garumiem; rindas platums (strēmelēm platums abos galos); piezīmes (robs, urbums).

### 8.4 Materiāli

Dēļi, pakas (ar rezervi), laukums, atgriezumi %, izmantojamie atlikumi (> 300 mm) atsevišķi, cena (ja ievadīta). Vēlāk: grīdlīstes, profili, pamatne (F15).

### 8.5 Pielaides un nospraušana

- Katrai sienai pieļaujamā mērījumu kļūda (no g, g_min, g_max).
- Pirmās rindas līnija: attālums no sienas divos punktos.
- Kontrolmērījumi (§5).

## 9. Izvades

- **Drukāšana (A4, print CSS ar mm vienībām):** plāna lapa ar mēroga joslu un leģendu; griešanas kartes; atdura saraksts; klāšanas secība; kopsavilkums.
- **1:1 šabloni** līkumotiem griezumiem: sadalīti A4 lapās ar savietošanas zīmēm un kontrolizmēru (10 cm nogrieznis, lai pārbaudītu, vai printeris nav mērogojis).
- **Uzlīmes:** etiķešu lapas (noklusējums 3×8 uz A4, 70×37 mm; konfigurējams). Uz uzlīmes: marķējums, garums, bultiņa "← uz sienu", rindas numurs.
- **CSV:** gabali, dēļi, griezumi.
- **JSON:** projekts.
- **Saite:** projekts saspiests (`CompressionStream('deflate-raw')` + base64url) URL daļā `#p=…`, bez servera.

## 10. Klāšanas režīms (telefons)

- Rindu pa rindai: "Rinda 5 no 23: DZ-05-S (743 mm) → 3 pilni → DZ-05-B (412 mm)". Lieli burti; pogas "Gatavs" un "Atpakaļ".
- Progress saglabājas; darbojas bez interneta.
- Screen Wake Lock, lai ekrāns neizslēdzas.
- Pogas "Rādīt plānā" un "Problēma ar šo rindu" (atzīmē un parāda rindas pielaides).

## 11. Tehniskā arhitektūra

### 11.1 Stāvoklis

- `projectStore` (Zustand + Immer): `Project` dokuments. Vēsture ar patch.
- `uiStore`: rīks, izvēle, kamera, paneļi. Nav vēsturē.
- `resultStore`: aprēķinu rezultāti pēc projekta hash; statuss (skaita / gatavs / novecojis).
- Atvasinātie dati (Z, validācijas kļūdas) ir memoizēti selektori, kas izsauc `@lp/core`.

### 11.2 Worker protokols (Comlink)

```ts
interface OptimizerApi {
  optimize(
    project: Project,
    options: { timeLimitMs: number; workers: number; seed: number },
    onProgress: (p: {
      elapsedMs: number; bestBoards: number; lb: number;
      feasible: boolean; iteration: number; config: string;
    }) => void,
  ): Promise<{ plan: Plan; comparison: ConfigSummary[]; stats: SaStats }>;
  cancel(): void;
}
```

- Koordinators sadala konfigurācijas un sēklas pa worker, apvieno labākos rezultātus un rāda progresu.
- `core` ir vienīgā atkarība worker iekšienē.

### 11.3 Attēlošana

- SVG ar slāņiem: režģis → telpas aizpildījums → plāna gabali → malas un izmēri → šķēršļi un durvis → izvēle un rokturi → piesaistes palīglīnijas → rīka priekšskatījums.
- Līdz ~1000 gabaliem SVG pietiek. Ja kļūst lēns, plāna slāni pārvērš par `<canvas>`.
- Trāpījumu pārbaude un piesaiste notiek ģeometrijā (`@lp/core` + `editor/snap.ts`), nevis DOM notikumos.
- Drukāšanai izmanto to pašu SVG ģeneratoru (`core/render`).

### 11.4 i18n

Tipizēta vārdnīca `i18n/lv.ts` un `i18n/en.ts` (atslēgu kopai jāsakrīt, to pārbauda tests). Skaitļu formāts: `1 285 mm` (lv), decimāldaļas atdala ar komatu.

### 11.5 Pieejamība un ergonomika

- Viss ir izdarāms ar tastatūru. Redzams fokuss. Kontrasts WCAG AA.
- Skārienmērķi ≥ 44 px.
- Tumšais režīms.
- Kļūdu paziņojumi saka, **ko darīt**, nevis tikai "kļūda".

### 11.6 Testēšana

- Vitest: `snap.ts`, rīku stāvokļu mašīnas, store reduktori.
- Playwright e2e:
  1. uzzīmēt 4200×3100 ar ievadītiem garumiem;
  2. izveidot L telpu ar formas ielikumu (taisnstūris) un ar posma push/pull;
  3. ievilkt V izgriezumu, velkot punktu, un ierakstīt dziļumu;
  4. ievietot pusapaļu erkeru, tad mainīt tā diametru un pārbaudīt, ka grupa saglabājas;
  5. mainīt malas garumu un pārbaudīt pretējo malu;
  6. aprēķināt un atvērt griešanas karti (ar līkumotu griezumu sadaļu);
  7. strādāt bez interneta (offline) pēc pirmās ielādes.
