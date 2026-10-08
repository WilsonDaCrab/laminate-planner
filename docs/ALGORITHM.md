# ALGORITHM.md — Modelis un algoritmi

Šis ir kodola (`packages/core`) tehniskais apraksts un kursa atskaites pamats. Termini ir `DOMAIN.md` §2.

## 0. Kopsavilkums (kursa atskaites struktūrā)

- **a) Domēns.** Katram rindas segmentam s šuvju fāze φ_s no pieļaujamās kopas F_s ⊆ [0, L). Risinājums ir vektors φ ∈ ∏ F_s. Rindu virziens θ, sākuma puse un nobīde y0 eksperimentos ir fiksēti (§8).
- **b) Novērtēšana.** Dekoders no φ uzbūvē konkrētu griešanas plānu un saskaita dēļus B. Mērķa funkcija `f = B + λ_V·V + ε·N` sastāv no dēļu skaita, šuvju nobīdes pārkāpumu soda un maza vadošā locekļa, kas mēra "tuvumu nākamajam pārim".
- **c) Gājieni.** Fāzes nomaiņa, neliela nobīde, divu segmentu fāžu apmaiņa, mērķtiecīga pāra veidošana, joslu bloka nobīde.
- **d) Algoritms.** Simulētā rūdīšana ar ģeometrisku dzesēšanu, T₀ kalibrāciju pēc pieņemšanas varbūtības, labākā derīgā risinājuma saglabāšanu un agru apstāšanos, ja sasniegta apakšējā robeža (pierādīts optimums).

## 1. Uzdevuma formulējums

**Dots:**

- telpa: vienkāršs daudzstūris P ar malu tipiem un spraugām g_e, šķēršļi (daudzstūri ar spraugām), caurules;
- produkts: dēļa garums L un platums W; noteikumi k, L_min, D, w_min;
- klāšanas virziens θ un rindu krāšanās puse (fiksēti).

**Jāatrod** šuvju fāzes φ = (φ_s) katram segmentam un griešanas plāns (katram gabalam — dēlis un taisnstūris dēlī), lai:

1. gabali pārklāj uzstādāmo zonu Z un savstarpēji nepārklājas;
2. katram gabalam vajadzīgie profili atrodas uz pareizajām dēļa malām (§3.2), un dēlis netiek pagriezts;
3. gabali vienā dēlī nepārklājas, un starp tiem ir vismaz k;
4. katrs sākuma un beigu gabals gar katru atvērto garo malu ir vismaz L_min garš; katra strēmele ir vismaz w_min plata, ja ģeometrija to atļauj;
5. šuves blakus rindās ir vismaz D attālumā;

un **minimizēt** izmantoto dēļu skaitu B (rindu nobīde y0 ir fiksēta, §8).

**Sarežģītība.** Ar fiksētām fāzēm pilna platuma gabalu pārošana ir polinomiāla (§4.1). Grūtība rodas no fāžu izvēles kopā ar nobīdes ierobežojumiem (cirkulāri attālumi starp kaimiņu segmentiem) un no strēmeļu un brīvo gabalu izvietošanas, kas ir griešanas krājuma (cutting stock) tipa apakšuzdevums. Tāpēc izvēlēta metaheiristika kopā ar stingru apakšējo robežu, pret kuru var novērtēt kvalitāti.

## 2. No telpas uz segmentiem

### 2.1 Uzstādāmā zona

`Z = offset_e(P, −g_e) − ⋃_O inflate(O, g_O)`

- **Loki.** Malas ar `bulge ≠ 0` un apaļos šķēršļus pirms visām operācijām pārvērš lauztā līnijā modulī `core/geometry/arcs` (vienīgā vieta, kur to dara). Maksimālā novirze no loka ir `ARC_TOL = 0,5 mm`; segmentu skaits ir `n = ⌈θ / (2·acos(1 − ARC_TOL/r))⌉` (vismaz 2 lokam, 8 aplim). Katrai iegūtajai mazajai malai saglabā atsauci uz sākotnējo loka malu (`sourceEdge`), lai plāna konstruktors varētu atpazīt līkumotus griezumus. Clipper operācijas šo atsauci nesaglabā, tāpēc pēc tām to atjauno ar Clipper Z vērtību (Z-callback) vai ģeometriski: mala ir līkumota, ja tās galapunkti atrodas uz sākotnējā loka koncentriskā loka (rādiuss r ± g) ARC_TOL robežās. Offset izpilda pēc diskretizācijas; kļūda nepārsniedz ARC_TOL.
- **Mainīga platuma iekšējais offset.** Katras malas taisni nobīda uz iekšu par tās spraugu g_e. Jaunā virsotne ir blakus malu nobīdīto taisnu krustpunkts (miter). Ja blakus malas ir paralēlas ar vienādu spraugu, virsotne ir projekcija uz nobīdīto taisni; ar dažādām spraugām (pakāpiens) vai pretparalēlas — virsotne kļūst par diviem punktiem (abu malu nobīžu galapunktiem).
- Ja offset rada pašķrustošanos (īsas malas, šauras nišas), rezultātu tīra ar Clipper `union` (FillRule.Positive).
- Asos leņķos (pagrieziens > 150°, t.i. iekšējais leņķis < 30° vai > 330°) izdod brīdinājumu `sharpCorner`. Izliektā asā stūrī miter smaile paliek (tas ir precīzs iekšējais offset); tā netiek apcirpta. Sk. ADR-011.
- **Durvju aila.** Zonai pievieno taisnstūri uz āru no malas: platums `width + 2·jambUndercut`, dziļums `depth` no sienas līnijas (sk. ADR-011).
- Šķēršļus paplašina ar Clipper `inflatePaths` (JoinType.Miter) un atņem ar `difference`.
- **Caurules neatņem no Z.** Tās neietekmē dēļu patēriņu un profilus, tikai rada urbumu. Plāna konstruktors tās piesaista gabalam kā `drill` pazīmi. Validētājs pārbauda, ka katra caurule atrodas tieši vienā gabalā (vai uz šuves) un ka urbums ir pareizajā vietā.

### 2.2 Koordinātu sistēmas

| Sistēma | Apraksts |
|---|---|
| telpa | lietotāja zīmējums |
| rindas | pagriezta par −θ; ja `stackSide = right`, vēl spoguļota pret x asi. Rindas iet pa +x, krājas pa +y |
| dēlis | x_b ∈ [0, L], y_b ∈ [0, W] |

Visi pārveidojumi ir `core/geometry/frames`, un tiem ir round-trip testi.

### 2.3 Joslas un segmenti

- Rindu sistēmā joslu robežas ir pie `y ≡ y0 (mod W)`, kur y0 ∈ [0, W).
- Pirmās rindas platums ir `a = (y0 − y_min) mod W`; ja tas ir 0, pirmā rinda ir pilna platuma.
- Joslas numurē no sākuma sienas: j = 1, 2, …; josla j ir `B_j = ℝ × [β_j, β_j + W]`.
- **Segments** ir sakarīga komponente `Z ∩ B_j`. To iegūst ar Clipper `intersect` ar joslas taisnstūri un PolyTree grupēšanu (komponente var saturēt caurumus). Segmentu ID: joslas numurs un burts x secībā.

### 2.4 Atvērtās malas un kaimiņi

- Uz joslu robežas `y = β_{j+1}` segmenta s (josla j) augšmala un segmenta t (josla j+1) apakšmala sakrīt intervālos `I_st`. Tos iegūst, šķeļot abu daudzstūru horizontālās malas uz šīs taisnes.
- Ja `I_st` nav tukšs, (s, t) ir **kaimiņi**. Tas veido kaimiņu grafu 𝒩.
- `O_s^high = ⋃_t I_st` ir segmenta atvērtā augšmala, `O_s^low` — atvērtā apakšmala. Pārējā robeža ir "slēgta" (siena, šķērslis).

### 2.5 Segmenta x-profils (iepriekšējais aprēķins)

Katram segmentam vienreiz aprēķina:

- `[a_s, b_s]` — projekcija uz x ass (sakarīgam segmentam tā ir intervāls);
- `isRect` — vai segments ir taisnstūris ar konstantām atvērtajām malām (atvērts visā garumā vai nemaz). Tas ir ātrais ceļš, un tipiskās telpās tā ir lielākā daļa segmentu;
- vispārīgam segmentam: sakārtotus x lūzumpunktus (virsotņu x) un katram elementārajam intervālam šķērsgriezuma y-intervālus kā lineāras funkcijas no x; `O_s^low`, `O_s^high` kā intervālu sarakstus;
- `complex` — vai kādā x šķērsgriezums sastāv no vairāk nekā viena intervāla (caurums vai C forma). Tad gabala vertikālā šķēle var būt nesakarīga. Deskriptorus arī šādiem segmentiem rēķina no šķērsgriezumiem (`layout/xprofile`), platumu ņemot kā ekstrēmus pār visiem intervāliem; Clipper (`pieceShapes`) izmanto tikai precīzai gabalu formai un kā testa orākulu (ADR-012).
- `isRect` (ātrais ceļš) prasa taisnstūri **bez cauruma**, kura atvērtā apakšmala un augšmala katra ir atvērta visā garumā vai nemaz; daļēji atvērta mala padara segmentu par vispārīgu.

## 3. No fāzes uz gabaliem

### 3.1 Šuves

Segmenta s šuves ir taisnes `x = φ_s + mL, m ∈ ℤ`. Iekšējās šuves ir tās, kam `a_s + EPS < x < b_s − EPS`. Apzīmē tās ar x_1 < … < x_M. Ja M = 0, segments ir viens gabals.

### 3.2 Gabali un to deskriptori

Gabals i ir `R_s ∩ ([x_i, x_{i+1}] × ℝ)`, kur x_0 = a_s un x_{M+1} = b_s. Deskriptors:

| Lauks | Definīcija |
|---|---|
| `extent` ℓ | x_{i+1} − x_i |
| `short` | vajag kreiso galu, ja i > 0; labo, ja i < M → `start` (tikai labais), `end` (tikai kreisais), `full` (abi), `free` (neviens) |
| `long` | vajag apakšmalu, ja \|O_s^low ∩ [x_i, x_{i+1}]\| > 0; augšmalu analogi → `both`, `low`, `high`, `none` |
| `width` w | `both`: W; `low`: max y_hi − β_j; `high`: β_j + W − min y_lo; `none`: max y_hi − min y_lo (sloksnē) |
| `lengthLow`, `lengthHigh` | gabala malas garums pie y = β_j un y = β_j + W (slīpiem griezumiem) |

`L_min` ierobežojums attiecas uz `start` un `end` gabaliem: gar katru vajadzīgo garo malu atvērtās daļas garums ≥ L_min (vajadzīga ir mala, kuras atvērtās daļas mērs gabalā > `MIN_OPEN_LENGTH` = 0,02 mm, nevis > EPS; sk. ADR-012 "Režģa troksnis"; validētājam jālieto tas pats slieksnis). Ja atvērtā mala gabalā sastāv no vairākiem atdalītiem posmiem, L_min salīdzina ar to **kopējo** mēru (`openLow`/`openHigh`), nevis ar katru posmu (ADR-012). Segments, kura augstums vai laukums ir zem `MIN_SEGMENT_HEIGHT`/`MIN_SEGMENT_AREA` (`layout/bands`), tiek atmests kā režģa troksnis. Ja gabalam nav nevienas atvērtas malas (`long = none`), tam pašam jābūt `extent ≥ L_min` — tas sakrīt ar §3.4 taisnstūra formulu (ADR-012). `full` gabaliem ierobežojuma nav (tie pieslēgti abos galos), `free` gabaliem nav izvēles. Neizpildes apjoms (`lengthDeficit`) ir kopējais iztrūkums mm; to izmanto, ja F_s ir tukša.

Katram gabalam `extent ≤ L`, jo šuvju taisnes atkārtojas ar periodu L. Tāpēc gabals vienmēr ietilpst dēlī.

Ja gabala robeža iet gar malu, kas radusies no loka (`sourceEdge`), plāna konstruktors tam pievieno pazīmi `curveCut` (ordinātas ik pēc 50 mm, figūrzāģis). Dēļu skaitu tas neietekmē: pārošanā izmanto `extent`, un materiāls aiz līknes ir atgriezums.

### 3.3 Ātrais ceļš taisnstūra segmentiem

```
r   = (φ − a) mod L
x_1 = a + (r > EPS ? r : L)             // šuve pie sienas nav šuve
if x_1 ≥ b − EPS:  viens gabals [a, b]
else:
  M   = 1 + floor((b − EPS − x_1) / L)
  s   = x_1 − a                         // sākuma gabals (s = L → vesels dēlis)
  e   = b − (x_1 + (M − 1)·L)           // beigu gabals (e = L → vesels dēlis)
  pilno gabalu skaits = M − 1
```

### 3.4 Pieļaujamās fāzes F_s

- Taisnstūra segmentam: `F_s = {φ : M = 0} ∪ {φ : s ≥ L_min ∧ e ≥ L_min}`. To aprēķina analītiski kā cirkulāru intervālu šķēlumu.
- Vispārīgam segmentam: vienreiz pārbauda φ ar 1 mm soli (cirkulāri) un apvieno derīgos punktus atzaros; katra atzara galapunktus precizē ar bisekciju no derīgās puses, tāpēc F_s ir konservatīva (nesatur φ, kas pārkāpj L_min). Šaurus logus < 1 mm (derīgus vai nederīgus) skenēšana var neredzēt.
- Taisnstūrim analītiski, ar r = (φ − a) mod L un s = pirmā gabala garums: bez šuves iekšā (r = 0 vai r ≥ b − a, ja b − a ≤ L) vai `s ∈ ⋃ₘ [len − (m+1)L, len − mL − L_min] ∩ [L_min, min(L, len))`, kur len = b − a. Tas sakrīt ar brutālu pārlasi (testos).
- Ja `L_min ≤ L/2`, taisnstūra segmentam F_s nekad nav tukša.
- Ja F_s ir tukša (ļoti slīpas sienas), atļauj visu [0, L), L_min iztrūkumu soda mērķa funkcijā un izdod brīdinājumu.
- F_s glabā kā sakārtotu intervālu sarakstu. Vajag: nejauša izvēle, projekcija uz tuvāko punktu, piederības pārbaude.

## 4. Dekoders (plāna konstruktors)

Ievade: visu segmentu gabali ar deskriptoriem. Izvade: dēļi ar gabalu novietojumiem. Dēļu skaits B ir dekodera rezultāts. Tas ir sasniedzams, tātad augšējā robeža optimālajam griešanas plānam pie dotajām fāzēm. SA optimizē φ attiecībā pret šo dekoderu (dekoderā balstīta metaheiristika).

Klases pēc garajām malām: `K_full` (both), `K_low`, `K_high`, `K_none`.

**Pilna platuma gabali (ADR-019).** Gabals, kura platums ir vismaz `W − EPS`, pieder `K_full` neatkarīgi no `long`: tam ir abas sava dēļa garās malas, tāpēc `low`/`high` prasība neko nemaina. Tipisks gadījums ir nenogriezta pirmā un pēdējā rinda (`long = high` un `long = low`): to beigu un sākuma gabali pārojas savā starpā kā A posmā. Tas pats noteikums ir `plan/decode.ts` un `evaluate/fast.ts`.

### 4.1 A posms — pilna platuma gabali (K_full)

- `short = full` → katram viens dēlis (F gab.).
- `short = start` → saraksts S; `short = end` → saraksts E; `short = free` → uz C posmu.
- `pairs = maxPairs(E, S, C = L − k)`; dēļi: `B_A = F + |S| + |E| − |pairs|`.

```
maxPairs(E, S, C):
  sakārto E dilstoši, S augoši; j ← 0; pairs ← []
  for e in E:
    if j < |S| and e + S[j] ≤ C:
      pairs.push((e, S[j])); j ← j + 1
  return pairs
```

**Pareizība.** Beigu gabala e kaimiņu kopa `N(e) = {s : s ≤ C − e}` ir sakārtotā S prefikss, un lielākam e prefikss ir īsāks (kopas ir ieslēgtas viena otrā). Apstrādājot visierobežotāko e pirmo, jebkurš brīvs s no tā prefiksa ir pieejams arī visiem nākamajiem e. Tātad izvēle neierobežo nākotni. Ja mazākais brīvais s neder, neder neviens, un e nekad nevarēs sapārot. Tāpēc pāru skaits ir maksimāls. Sarežģītība: O(n log n).

**Atlikumi** (krājums C posmam):

- nesapārots s → kreisā daļa `L − s − k` (kreisā gala profils, abas garās malas);
- nesapārots e → labā daļa `L − e − k` (labā gala profils);
- pāris (e, s) → vidus `L − e − s − 2k` bez īso galu profiliem, ja > 0.

Slīpiem gabaliem A posms izmanto `extent` (konservatīvi, taisnstūra griezums vienmēr derīgs). Precīzā pārošana pēc abām malām (`e_low + s_low + k ≤ L ∧ e_high + s_high + k ≤ L`) nav ieviesta (projekts noslēgts, ADR-029). Tā būtu divdimensiju dominances pārošana, un tai vajag vispārīgu divdaļīga grafa maksimālo pārošanu (pašu Hopcroft–Karp vai Kuhn).

### 4.2 B posms — strēmeles (K_low, K_high)

1. **B.1.** Katrai pusei σ ∈ {low, high}: `full` gabali → atsevišķas vienības; `start`/`end` pāro ar `maxPairs` pēc `extent` → pāris ir viena vienība; nesapārotie ir atsevišķas vienības. Vienības platums = lielākais tās gabalu platums.
2. **B.2.** Apakšējās un augšējās vienības apvieno dēļos: `maxPairs` pēc platumiem ar ietilpību `W − k` (low platumi dilstoši, high augoši). `B_B = |U_low| + |U_high| − |pāri|`.
3. Atlikumi (garengriezuma atlikusī strēmele `W − w − k`, garuma atlikumi) ar pareiziem profilu karogiem nonāk krājumā C posmam.
4. **B.3.** Pirms B.1 strēmeļu sākuma/beigu gabalus (laukuma dilstošā secībā) mēģina izvietot A posma atlikumos (best fit ar profilu karogiem; jaunu dēli neatver), un tikai pēc tam pāro atlikušos. Tas nekad nepalielina B: gabals atlikumā izņem vienu vienību, un pārējo maksimālā pārošana samazinās ne vairāk kā par vienu.

   **Mērījums (F3).** Pirms B.3 iepriekšējās griešanas dekoders uz reālām instancēm bieži deva *vairāk* dēļu nekā secīgais dekoders (§4.5), jo tas strēmeles jau izmanto iepriekšējo gabalu atlikumus. 200 nejaušām φ ∈ F (sēklas 1–200, noklusējuma y0): `B_onsite < B_precut` R1 112, R2 73, L1 31, U1 6, S1 30, S2 161, C1 29, C2 14 reizes; vidēji R1 55,52 pret 56,13, S2 39,83 pret 40,90. Tāpēc B.3 tika ieviests jau F3 (ADR-013). Ar B.3 tā pati pārbaude dod `B_onsite < B_precut`: R1 18, R2 16, L1 14, U1 0, S1 13, S2 17, C1 10, C2 2 reizes no 200, un vidējais B ir mazāks `precut` režīmā visās 8 instancēs (R1 55,34 pret 55,52; R2 86,64 pret 87,48; L1 90,52 pret 92,02; U1 86,22 pret 87,92; S1 54,49 pret 54,80; S2 39,78 pret 39,83; C1 69,00 pret 69,47; C2 74,64 pret 74,69). Atlikušie atsevišķie gadījumi ir heiristikas troksnis, jo `B_onsite ≥ B_precut` ir pierādīts tikai tīrai pilna platuma klasei.

### 4.3 C posms — brīvie gabali (short = free vai long = none)

Sakārto pēc laukuma dilstoši. Katram gabalam izvēlas **best fit** krājumā: mazākais atlikums, kam ir vajadzīgie profili, platums ≥ w un garums ≥ ℓ. Gabalu griež no atbilstošā gala, un atlikumu atgriež krājumā. Ja nekas neder, atver jaunu dēli (`B_C += 1`), un tā atlikums nonāk krājumā.

### 4.4 Rezultāts

- `B = B_A + B_B + B_C`.
- Plāns: dēļi ar `placements` (taisnstūri dēļa koordinātās). Dēļu numuri seko dekodera secībai (`D01`, `D02`, …).
- **Determinisms:** visas kārtošanas ir stabilas ar sasaisti pēc gabala ID.
- Novērtētājs (`evaluate`) un plāna konstruktors (`buildPlan`) izmanto **vienu dekodera kodolu** (`plan/decode.ts`, izvēli pēc režīma dara `plan/run.ts`), tāpēc B sakrīt pēc konstrukcijas; `evaluate` atgriež arī nesapārotos sarakstus (N un M4 vajadzībām) un statistiku. Ātrā versija bez objektiem (typed arrays) ir `evaluate/fast.ts` (§14), ar tiem pašiem ekvivalences testiem. Īpašību tests: `evaluate(φ).B === plan(φ).boards.length === validate(plan).boards`.
- Dēļa novietojums (`boardRect`): sākuma gabals pie dēļa labā gala, beigu gabals pie kreisā, apakšmalas profils pie `y = 0`, augšmalas pie `y = W`; pirmās rindas strēmele (`long = high`) sēž dēļa augšā, pēdējās (`low`) apakšā.

### 4.5 Secīgais režīms (`mode: onsite`)

Modelē klāšanu bez iepriekšējas griešanas: atgriezumu var izmantot tikai vēlāk ieklātam gabalam (arī tajā pašā rindā, bet ne agrāk ieklātam).

- Klāšanas secība: josla augoši, joslā segmenti pēc x.
- Divas kaudzes: `stackS` (atgriezumi ar labā gala profilu, der sākumam) un `stackE` (ar kreisā gala profilu, der beigām).
- Sākuma gabals s: best fit no `stackS` (mazākais ≥ s); citādi jauns dēlis, un kreisā daļa `L − s − k` nonāk `stackE`.
- Beigu gabals e: best fit no `stackE`; citādi jauns dēlis, un labā daļa `L − e − k` nonāk `stackS`.
- Strēmeles un brīvie gabali analogi, ievērojot platumus.
- **Realizācija** (`decodeSequential`, `decodeOnsite`): viens best-fit cikls pār visiem gabaliem klāšanas secībā; atlikumi ar profilu karogiem (`left/right/low/high`) aizstāj abas kaudzes, un A/B pārošanas nav. `B_onsite ≥ B_precut` ir pierādāms tikai tīrai pilna platuma klasei (katrā dēlī ≤ 1 beigu un ≤ 1 sākuma gabals, un precut pāro maksimāli); vispārīgi tas nav garantēts (sk. B.3 mērījumu §4.2).

Šis dekoders ir B-INST bāzes metodes pamatā. Salīdzinājums `SA(precut)` pret `SA(onsite)` parāda, cik ietaupa tieši iepriekšēja griešana.

## 5. Mērķa funkcija

```
f(φ) = B(φ) + λ_V·V(φ) + ε·N(φ)
```

- **V — šuvju nobīde.** Katram kaimiņu pārim (s, t) un katram šuvju pārim x ∈ šuves_s, x' ∈ šuves_t, kas atrodas `I_st` (paplašinātā par D), un kam `|x − x'| < D`, pieskaita `(D − |x − x'|)/D`.
  - Ātrais ceļš: ja `I_st` ir viens intervāls ar garumu ≥ L + D, tad `V_st = ⌈|I_st|/L⌉ · max(0, D − circDist(φ_s, φ_t))/D`. Nosacījums `V_st = 0 ⇔ circDist ≥ D` šeit ir precīzs.
  - Citādi uzskaita reālās šuves pārklāšanās intervālā.
- **N — tuvums nākamajam pārim.** Pēc A posma, ja ir gan nesapāroti beigu E', gan sākuma S' gabali: `N = (min E' + min S' + k − L)/L ∈ (0, 1]` (tas ir pozitīvs, jo citādi pārošana nebūtu maksimāla); citādi `N = 0`. Tas dod SA virzienu uz "plato", kur B nemainās.

| Svars | Noklusējums | Piezīme |
|---|---|---|
| λ_V | 2,0 | viens pārkāpums "maksā" ~2 dēļus: meklēšana var šķērsot nederīgus apgabalus, bet galarezultāts ir derīgs |
| ε | 0,2 | ε·N < 1, tāpēc nekad neatsver vienu dēli |

- **Derīgums:** risinājums ir derīgs ⇔ V = 0 un L_min ir izpildīts (`lengthDeficit = 0`; tas ir garantēts, ja φ ∈ F_s, un sods tikai tad, ja F_s ir tukša); w_min nodrošina y0.
- SA atsevišķi glabā labāko derīgo (salīdzina pēc B, tad pēc f). Ja derīga nav, atgriež labāko pēc f ar brīdinājumu.

## 6. Gājieni

| Gājiens | Apraksts | Varbūtība |
|---|---|---|
| M1 Reset | φ_s ← U(F_s) | 0,15 |
| M2 Shift | φ_s ← proj_{F_s}(φ_s + δ), δ ~ U(−Δ, Δ), Δ = max(20, (L/2)·T/T₀) mm | 0,30 |
| M3 Swap | apmaina φ_s un φ_t. Ar varbūtību 0,7 t ņem no tās pašas ekvivalences klases (taisnstūra segmenti ar vienādiem `a mod L`, `b mod L` un klasi — dēļu skaits nemainās, mainās tikai kaimiņi), citādi nejauši | 0,15 |
| M4 Pair | mērķtiecīga pāra veidošana (zemāk) | 0,30 |
| M5 Block | visiem segmentiem 2–6 secīgās joslās pieskaita vienu δ (saglabā relatīvo nobīdi bloka iekšienē) | 0,10 |

**M4 Pair.** No pašreizējā dekodējuma paņem nejaušu nesapārotu beigu gabalu e. Izvēlas segmentu t (ar varbūtību 0,7 no tiem, kuru sākuma gabals ir nesapārots) un uzstāda tā sākuma gabalu tieši `s* = C − e`: `φ_t = (a_t + s*) mod L`. Simetriski nesapārotam sākuma gabalam s: `φ_t = (b_t − (C − s)) mod L`. Ja `φ_t ∉ F_t`, mēģina citu t (līdz 3 reizēm), citādi izpilda M2.

M4 ir vienīgais gājiens, kas precīzi trāpa nepārtrauktā telpā šaurajos punktos, kur `e + s + k = L`. Tieši tie dod nulles atgriezumu. Paredzams, ka tas būs efektīvākais gājiens; to jāpārbauda ar gājienu statistiku (§15).

`proj_{F_s}` ir tuvākais F_s punkts (cirkulāri).

**Realizācija (F5).** Gājiens atgriež tikai mainītos φ_s un tur tos F_s iekšienē (`PhaseSpace.place`); taisnleņķa segmentiem φ − a tiek noapaļots uz veselu mm (ADR-013), pārējiem φ paliek nepārtraukts. M2: Δ = max(20, (L/2)·T/T₀). M3 klase: taisnstūra segmenti ar vienādu `a mod L`, garumu `b − a`, atvērto malu karogiem un platumiem; pārējie segmenti ir atsevišķas klases. M5: 2–6 secīgas joslas, viens δ visiem to segmentiem, katrs projicēts uz F_s.

**M4 papildinājums (ADR-016).** Precīzs optimums prasa *slēgtus* pāru ciklus: e_r + s_{r+2} = C un e_{r+2} + s_r = C vienlaikus. Tāpēc M4: (a) avots var būt jebkura rinda (varbūtība 0,5), ne tikai nesapārots gabals; (b) partneri izvēlas pēc *slēgšanas*: rindai j uzstāda gabalu C − e_i, un tiek meklēta tāda j, kuras otrais gabals e_j' tad precīzi papildina rindas i otro gabalu (e_j' + s_i = C). Viena izmaiņa tad dod divus precīzus pārus. Slēgšana ir statiska īpašība (κ_i + κ_j ≡ 2C (mod L), κ = rindas garums mod L); taisnstūra telpā tādu partneru nav, un M4 seko oriģinālajam aprakstam (0,7 nesapārotie, līdz 3 mēģinājumi), citādi M2. Noklusējuma varbūtības: M1 0,05, M2 0,15, M3 0,05, **M4 0,60**, M5 0,15 (oriģinālās 0,15/0,30/0,15/0,30/0,10 ir `SPEC_MOVE_WEIGHTS`).

## 7. Simulētā rūdīšana

```
SA(inst, cfg, rng, clock):
  x ← initial(inst)                       // B-INST fāzes (derīgas pēc konstrukcijas)
  fx ← f(x); best ← x; bestFeas ← feasible(x) ? x : ∅
  T0   ← calibrate(x, p0 = 0.3, samples = 200)
  Tend ← 1 / ln(1 / p_end)                // p_end = 1e-8: +1 dēli pieņem ar varbūtību 1e-8 (ADR-027)
  it ← 0
  while not budgetExhausted(it, clock):
    τ ← progress(it, clock)               // 0…1 (iterāciju vai laika daļa)
    T ← T0 · (Tend / T0)^τ
    y ← move(x, rng, T)
    Δ ← f(y) − fx
    if Δ ≤ 0 or rng.next() < exp(−Δ / T):
      x ← y; fx ← fx + Δ
      if feasible(x) and better(x, bestFeas):
        bestFeas ← x
        if B(x) = LB: return (bestFeas, provenOptimal = true)
      if fx < f(best): best ← x
    it ← it + 1
  return bestFeas ?? best
```

- `calibrate`: no x izpilda `samples` nejaušus gājienus (tos nepieņem), savāc Δ > 0 un aprēķina `T0 = −median(Δ⁺)/ln(p0)` (ADR-016). Gājienus, kas palielina V, neņem vērā: sods λ_V·V nav dēļu skaita solis un uzpūš T₀ par kārtu (L1, p₀ = 0,8: ≈ 27; ar B mērķi un p₀ = 0,8 T₀ ≈ 4,5, tāpēc noklusējums ir p₀ = 0,3, ADR-027). Ja tādu Δ⁺ ir < 10, izmanto visus; ja Δ⁺ nav, `T0 = 1`.
- **Budžets:** eksperimentos — iterāciju skaits N (`τ = it/N`), lai rezultāti nebūtu atkarīgi no datora ātruma; laiku tikai mēra. Laika režīmā (`timeMs` ar padotu `clock`) `τ = elapsed/limit`; `clock()` izsauc ik pēc 256 iterācijām.
- **Atjaunošana (`reheat`, noklusējumā ieslēgta, ADR-027):** ja labākais derīgais nav uzlabojies 0,5 % budžeta (iterāciju režīmā: iterāciju daļa; laika režīmā: progresa daļa `tau − tauBest`), meklēšana turpinās no labākā risinājuma ar `T0 · 0,5` un atlikušajam budžetam atkal atdzesē līdz `T_end` (vēlāk `tau < 0,95`). Biežāka atjaunošana ir labāka: uz 9 instancēm ar B mērķi 88/90 skrējienu sasniedz labāko zināmo optimumu (52/90 bez atjaunošanas un ar p₀ = 0,8).
- **Vairāki starti:** katra sēkla ir atsevišķs palaidiens.

| Parametrs | Noklusējums |
|---|---|
| p0 | 0,3 |
| p_end | 1e-8 |
| atjaunošana | ik pēc 0,5 % budžeta bez uzlabojuma, T₀ · 0,5 |
| laika režīms | `timeMs` + padotais `clock` (pēc noklusējuma nav) |
| iterāciju budžets (eksperimenti) | 200 000 |
| gājienu varbūtības | §6 |

**Realizācija (F5).** `runSa`: sākums ir B-INST φ; kalibrācija 200 gājieni (skaitās budžetā), `T₀ = max(−median(Δ⁺)/ln p₀, T_end)` (Δ⁺ bez V palielinošiem gājieniem, sk. §7 `calibrate`); τ = novērtējumi/budžets (laika režīmā laiks, pulksteni lasot ik pēc 256 iterācijām); gājiens tiek pielietots vietā un pēc noraidīšanas atcelts; labākais derīgais tiek glabāts atsevišķi (`Incumbent`); apstājas pie B = LB. Statistika: `byMove` (`proposed`, `accepted`, `downhill`, `newBest`), trajektorija ik N/200 novērtējumiem (labākais un pašreizējais f), iterācijas un laiks līdz labākajam. Atjaunošana (`reheat`) ir noklusējumā ieslēgta (ADR-027; `reheatFraction`, `reheatFactor` konfigurējami). Novērtētājs: abiem režīmiem tipizēto masīvu versija (§14, ADR-025), citādi atsauces `evaluate`; SA trajektorija ar abiem sakrīt (tests).

## 8. Rindu konfigurācija (θ, sākuma puse, y0)

Eksperimentos rindu konfigurācija ir fiksēta (ADR-029; agrākā ārējā cilpa, kas pārlasīja θ un sākuma pusi, ir izņemta):

- instancēs `angleDeg = 0`, `stackSide = left`;
- ja `rowOffset = 'auto'`, y0 izvēlas `resolveY0` (`goodY0`): pirmais veselais y0 = 0, 1, …, W − 1 mm, kuram katra rindām paralēla siena dod strēmeli ar platumu 0 vai ≥ w_min. Ja neviens y0 neder, izmanto 0. Plantētajām instancēm `rowOffset = 0` ir fiksēts failā.

Plānotājs pats y0 nefiltrē, tāpēc plāns ar nelabvēlīgu y0 var pārkāpt `w_min`; validētājs to ziņo.

## 9. Bāzes metodes

| Metode | Apraksts |
|---|---|
| B-NEXT | klasiskā klāšana: atgriezums tikai nākamās rindas sākumam |
| B-INST | klājēja metode ar atgriezumu kaudzi (secīgs dekoders, §4.5) |
| HC | SA ar T = 0 (pieņem tikai Δ ≤ 0) ar restartiem; parāda, ko dod "sliktāku" gājienu pieņemšana |
| LAHC (neobl.) | Late Acceptance Hill Climbing, vēstures garums 1000 |

```
B-INST(inst):                         // atgriež φ; B skaita secīgais dekoders
  stackS ← ∅; stackE ← ∅
  for segments s klāšanas secībā:
    if s nav apakšējā kaimiņa:
      φ_s ← sākums ir vesels dēlis; ja e < L_min, līdzsvaro abus galus
    else:
      o ← garākais stackS atgriezums, kura garums dod φ ∈ F_s
          un nobīdi ≥ D ar visiem apakšējiem kaimiņiem
      if o: φ_s ← (a_s + len(o)) mod L; izņem o
      else: jauns dēlis; s* ← pirmais derīgais no {L, 2L/3, L/3}, citādi skenē ar 1 mm soli;
            φ_s ← (a_s + s*) mod L; stackE += (L − s* − k)
    beigu gabals e: best fit no stackE, citādi jauns dēlis un stackS += (L − e − k)
```

B-NEXT ir tas pats, tikai `stackS` satur vienīgi pēdējo radīto atgriezumu, un `stackE` neizmanto.

**Realizācija (F4).** Pseidokods izvēlas tikai φ (`sequentialPhases`); dēļu skaitu B vienmēr mēra `evaluate` ar `mode: onsite`, tāpēc simulācijas kļūda nevar sabojāt B. Kandidāts φ_s tiek pieņemts, ja φ ∈ F_s un nobīde ≥ D pret jau nolemtajiem apakšējiem kaimiņiem. Segments bez apakšējā kaimiņa arī drīkst ņemt `stackS` atgriezumu. Bāzes līnija HC (F4) izmanto tikai M1 Reset un M2 Shift; HC sāk no B-INST φ un restartē no nejaušiem pēc 2000 neuzlabojošiem novērtējumiem (ADR-014).

## 10. Apakšējās robežas

- **LB0** = ⌈area(Z) / (L·W)⌉.
- **LB1.** Katram segmentam s un dēļa augstumam y_b ∈ [0, W]:
  `c_s(y_b) = |{x ∈ O_s^low ∪ O_s^high : (x, β_j + y_b) ∈ R_s}|`,
  `LB1 = ⌈ max_{y_b ∈ [0, W]} Σ_s c_s(y_b) / L ⌉`.

**Pierādījums.**

1. Ja gabalam vajag apakšmalas vai augšmalas profilu, tā novietojums dēlī y virzienā ir fiksēts: `y_b = y − β_j` (apakšmala pie y_b = 0 vai augšmala pie y_b = W, un dēli nevar pagriezt).
2. Punkts (x, y) ∈ R_s ar x ∈ O_s^low ∪ O_s^high pieder gabalam, kura sloksne satur x. Šim gabalam vajag attiecīgo profilu, tātad tā y_b ir fiksēts.
3. Vienā dēlī gabali nepārklājas, tāpēc katrā līmenī y_b to garumu summa ≤ L.
4. Summējot pa visiem dēļiem: `B·L ≥ Σ_s c_s(y_b)` katram y_b. ∎

- **Aprēķins:** c_s(y_b) ir pa daļām lineāra, tāpēc maksimumu meklē lūzumpunktos (virsotņu y) un intervālu galos.
- Taisnstūra telpā `LB1 = ⌈(F + max(G, T))/L⌉`, ja a + b ≤ W. Šeit F ir pilna platuma rindu garumu summa, G un T — pirmās un pēdējās rindas strēmeļu garumu summas. Ja a + b > W, tad `⌈(F + G + T)/L⌉`.
- LB1 nav atkarīga no φ, tāpēc to aprēķina vienreiz katram (θ, y0). Atskaitē izmanto `LB = max(LB0, LB1)` un atšķirību `gap = (B − LB)/LB`. Norāda, ka robeža attiecas uz doto (θ, y0); globālā robeža ir min pa y0.

## 11. Validētājs

Ievade: `Project` un `Plan`. Izmanto tikai `geometry` un `model` (un `num`); zonu pārrēķina pats (`validate/zoneInput.ts`), šuves un savienojumus nolasa no gabalu precīzajām formām rindas koordinātās (`Plan.frame`). Pārbaudes:

1. **Pārklājums** (`coverage`, `overlap`): ⋃ gabali = Z (simetriskās starpības laukums ≤ 0,5 + 0,01·perimetrs mm²), un Σ laukumi ≈ laukums(⋃) (nav pārklāšanās).
2. **Dēļi** (`boardBounds`, `overlap`, `kerf`, `shapeNotOnBoard`, `orientation`): katrs `rect` ir [0, L] × [0, W] robežās; taisnstūri nepārklājas, un starp tiem x vai y virzienā ir ≥ k; gabala forma dēļa koordinātās ir tā `rect` iekšpusē un ir tikai **pārbīde** no rindas koordinātu formas (dēli nevar pagriezt vai spoguļot).
3. **Profili** (`profile`): neatkarīgi nosaka, kuras gabala malas pieskaras citiem gabaliem (kopīga kolineāra mala > 0,02 mm). Vajag kreiso → `rect.x = 0`; labo → `rect.x + rect.w = L`; apakšmalu → `rect.y = 0`; augšmalu → `rect.y + rect.h = W`.
4. **L_min** (`minLength`): gabalam ar tieši vienu šuvi (sākuma/beigu) — kopīgais garums gar katru pieslēgto garo malu ≥ L_min; ja garās malas nav pieslēgtas, `extent ≥ L_min` (ADR-012).
5. **w_min** (`ripWidth`): tikai strēmelēm (augstums < W), kuru kontūra ir paralēla asīm; slīpas sienas strēmeles (scribe) netiek pārbaudītas, jo y0 izvēle (§8) attiecas uz rindām paralēlām sienām.
6. **Nobīde** (`stagger`): šuves (vertikālas kopīgas malas vienas rindas gabalu starpā) un kopīgā horizontālā robeža `I_st` (no blakus rindu gabalu kopīgajām malām); konflikts, ja abas šuves ir `I_st` paplašinātā par D un `|x − x′| < D − 0,01 mm` (režģa pielaide). Tā pati semantika kā V (§5), tāpēc `V = 0 ⇔` nav `stagger` pārkāpuma.
7. **Caurules** (`pipe`): katra caurule, kuras centrs ir gabalā vai kuras caurums sasniedz gabalu, tur ir urbumā (`drill`), koordinātas sakrīt (±0,05 mm), un nav urbumu bez caurules.
8. **Skaits** (`count`): plāna dēļu skaits = `stats.boards`; unikāli dēļu un gabalu ID, katrs gabals tieši vienā dēlī ar to pašu `rect`; `packs = ⌈boards·(1 + reserve)/perPack⌉`.

Izvade: `{ boards, violations }`; pārkāpums ir `{ code, message, refs }` ar atsaucēm uz gabaliem, segmentiem vai dēļiem. Plānotājs `y0` nefiltrē (§8), tāpēc plāns ar nelabvēlīgu y0 var pārkāpt `w_min`; validētājs to pareizi ziņo.

## 12. Instances ar zināmu optimumu

### 12.1 Pilnā pārlase mazām instancēm

- ≤ 2 segmenti: režģis 1 mm (taisnleņķa segmentiem tā ir pilna pārlase pār veseliem mm, ADR-013); ≤ 3 segmenti: 5 mm; ≤ 4 segmenti: 10 mm. Kandidāti segmentam: `a_s + j·solis` (taisnleņķa) vai soļa daudzkārtņi (citiem), kas ietilpst `F_s`, plus visi `F_s` intervālu galapunkti.
- Rezultāts ir labākais uz režģa, tātad augšējā robeža optimumam. Ja tas sakrīt ar LB, optimums ir pierādīts.
- **Uzmanību:** ar soli > 1 šuvju pārošana (`e + s + k = L`) prasa precīzas nobīdes, ko režģis var neaizķert, tāpēc HC/SA var uzvarēt pārlasi. Ticams optimums ir tikai ar soli 1; soļi > 1 dod tikai augšējo robežu.
- Pārlase strādā ar fiksētiem θ un y0 (y0 kā `runMethod`: `resolveY0`) un `precut` režīmu, tāpēc to salīdzina ar HC/SA, nevis ar B-INST (tas ir `onsite`). Aizsargs: režģis lielāks par `--max-evals` (50 M) tiek noraidīts. M3 simetrijas netiek izmantotas, jo mainītos V.
- Komanda: `pnpm bench exhaustive [ceļi] --step 5`; `--write-meta` ieraksta `meta.knownOptimum` (tikai ja B = LB1) vai `meta.bestKnown`.

### 12.2 Plantētais ģenerators ("kāpņu" telpas)

```
generatePlanted(n, mRange, L, W, k, L_min, D, g, rng):
  C ← L − k;  prasība: n·k < L
  repeat:
    π ← nejauša permutācija bez nekustīgiem punktiem
    for i in 1..n:  s_i ~ U[L_min, C − L_min]
    for i in 1..n:  e_i ← C − s_{π(i)};  m_i ~ U(mRange);  R_i ← s_i + m_i·L + e_i
    Z ← kāpņu daudzstūris: rinda i aizņem [0, R_i] × [(i−1)W, iW]
    P ← offset(Z, +g, miter)                  // telpa ar spraugām
    pārbauda: nobīde (precīzi, ar I_st), L_min, zone(P) = Z
  until viss derīgs
  knownOptimum ← Σ m_i + n
```

Instancē fiksē `angleDeg = 0`, `stackSide = left`, `rowOffset = 0`.

**Pierādījums.** Konstruētajā plānā katrs dēlis ir vai nu pilns, vai dod precīzu pāri `e_i + s_{π(i)} + k = L`, tātad `B* = Σ m_i + n`. No otras puses, `LB1 = ⌈Σ R_i / L⌉ = ⌈Σ m_i + n(L − k)/L⌉ = Σ m_i + n`, jo `0 ≤ nk < L`. Tātad `B* = LB1`, un plāns ir optimāls. ∎

**Variants "bloku telpas"** (reālistiskāki daudzstūri ar dažiem pakāpieniem): rindas grupē blokos ar vienādu R. Bloka iekšienē sākumi veido ķēdi `s' = s − δ (mod L)`, kur `δ = (R + k) mod L`. Pēdējās rindas garumu pielāgo tā, lai cikls noslēgtos. Derīgumu pārbauda ar tiem pašiem testiem.

## 13. Eksperimenti

### 13.1 Instanču komplekts (`instances/`)

| Grupa | Instances | Salīdzina ar |
|---|---|---|
| tiny | T1–T4: 2–3 segmenti | pilnā pārlase + LB |
| planted | P1–P6: ~12, 20, 30, 40, 50, 60 m² | zināmais optimums = LB1 |
| rect | R1 3×4 m, R2 4×5 m, R3 "nelabvēlīgs" (mazs `(R + k) mod L`), R4 6×10 m | LB1, bāzes metodes |
| lshape | L1–L3, U1 | LB1, labākais zināmais |
| slanted | S1 trapece, S2 paralelograms, S3 erkers, S4 diagonāli 45° | LB1 |
| obstacles | O1 kolonna + caurules, O2 virtuves bloks | LB1 |
| curved | C1 pusapaļš erkers, C2 apaļa kolonna, C3 noapaļoti stūri + V izgriezums | LB1 |

"Labākais zināmais" ir labākais rezultāts no 10 gariem SA palaidieniem (10× budžets). To ieraksta instances `meta.bestKnown`. Komanda: `pnpm bench bestknown [path...] --seeds 10 --iters 2000000 --write-meta` (instances ar `knownOptimum` izlaiž; `knownOptimum` ieraksta tikai tad, ja B = LB, t.i., max(LB0, LB1)).

### 13.2 Protokols

- Metodes: B-NEXT, B-INST, HC, SA, SA-onsite.
- 20 sēklas katrai (instance, metode) kombinācijai.
- Vienāds iterāciju budžets (noklusējums 200 000 novērtējumu).
- θ, sākuma puse un y0 fiksēti.
- Mēra: B, atgriezumu %, LB, gap, laiks līdz labākajam, kopējais laiks, derīgums, gājienu statistika.
- Pieraksta datora aprakstu (CPU, Node versija) un git commit.

### 13.3 Tabulas un grafiki atskaitei

- **Tabula** (`results/summary.csv`): instance | m² | segmenti | LB | B-NEXT | B-INST | HC | SA (labākais / vid. ± std) | SA-onsite | laiks.
- **Grūtības sērija** (`results/f6/difficulty.csv`): cik skrējienu atrod plantēto optimumu pieaugošā telpas izmērā.

### 13.4 Reproducējamība

`pnpm bench all [--jobs N|auto] [--quick]` (ADR-022, ADR-029) izveido:

- `results/env.json` — CPU, Node, commit, vai darba koks bija tīrs, pavedienu skaits;
- `results/raw/main.jsonl` — viena rinda katram skrējienam (instance, metode, sēkla, B, LB, V, N, derīgums, iterācijas, `evalsToFinalB`, laiks, commit); atsākams: pabeigtās atslēgas (ar budžetu un instances satura jaucējkodu) tiek izlaistas, rindas no cita commit izraisa brīdinājumu;
- `results/summary.csv` — galvenā tabula (§13.3), viena rinda instancei.

Viens eksperiments: visas instances × B-NEXT, B-INST (deterministiski, viens skrējiens), HC, SA, SA-onsite (20 sēklas, 200 000 novērtējumu), mērķis ir tikai B. Pilnā pārlase, `bestknown`, `difficulty` un `tune` ir atsevišķas komandas, ne daļa no `all`. Laika kolonna ir godīga tikai ar `--jobs 1`; ar vairākiem pavedieniem skrējieni dala datoru, bet B rezultāti ir identiski. `evalsToFinalB` ir pirmā iterācija, kurā sasniegts galīgais B (nevis sekundes).

## 14. Veiktspēja

- Mērķis: novērtētājs ≥ 100 000 novērtējumu/s pie 60 segmentiem (Node, mūsdienīgs portatīvais dators).
- Tipiska telpa: pirmais rezultāts (B-INST) < 100 ms; SA ≤ 5 s pārlūkā.
- Paņēmieni:
  - `Float64Array` garumiem, iepriekš alocēti buferi, iekšējā ciklā nerada objektus;
  - typed array `sort()` (skaitlisks);
  - inkrementāla atjaunināšana: gājiens maina 1–6 segmentus, tāpēc atjauno tikai to gabalus un sakārtotos masīvus (jaunie gabali — ne vairāk kā viens katram segmentam — tiek sakārtoti atsevišķi un apvienoti ar esošajiem no beigām ar bināro meklēšanu; vecos izmet pēc slota zīmoga, nevis pēc segmenta `dirty` karoga; nesapārotie A posma gabali glabājas pēc segmenta ranga, jo segmentā ir ≤ 1 sākuma un ≤ 1 beigu gabals — `layout/pieces.ts` `shortOf`; paaudžu skaitītāji aizstāj `fill(0)`; `mod(x, L)` ātrajā ceļā aizstāj bitu precīzs `modL`); V pārrēķina tikai skartajiem kaimiņu pāriem.
- Inkrementālo versiju raksta tikai pēc tam, kad vienkāršā versija ir pareiza un nomērīta. Tās rezultātiem jāsakrīt ar vienkāršo (īpašību tests).

**Realizācija (F6 turpinājums, ADR-025).** `createFastEvaluator(ctx, { mode: 'onsite' })` ir tā pati tipizēto masīvu versija ar sekvenciālo dekoderi (`decodeSeq`); SA-onsite R2 uz 200 000 novērtējumu 69,6 s → 4,5 s ar identisku trajektoriju.

**Realizācija (F5, ADR-016).** `evaluate/fast.ts` ir `precut` dekodera tipizēto masīvu versija: leftover ir (w, h, profilu karogi) un radīšanas secība (pozīcijas nav vajadzīgas); atlikumi, kurus neviena strēmele vairs nevar izmantot, netiek veidoti; gabalu `byId` secība tiek atveidota ar skaitlisku atslēgu (segmenta etiķetes rangs, loma `NN` < `B` < `S`). Gabali dzīvo katra segmenta pastāvīgā slotā un tiek pārrēķināti tikai, ja φ_s mainījās; veselie dēļi vidējiem "vienkāršiem" rindas gabaliem tiek tikai skaitīti; A posma gali un sākumi tiek uzturēti sakārtoti starp novērtējumiem; V locekļi tiek pārrēķināti tikai skartajiem segmentu pāriem (summas tajā pašā secībā kā atsauces versijā). Tests salīdzina B, V, N, f, `lengthDeficit` un nesapārotos gabalus ar `evaluate` uz 10 instancēm no 12 (P3, P4 netiek iekļautas), uz nejaušām taisnleņķa telpām (brīvie gabali, C posms) un garām gājienu virknēm ar vienu un to pašu novērtētāju.

## 15. Statistika un žurnāls

SA atgriež:

- iterāciju skaitu;
- pieņemšanas daļu kopā un pa gājienu tipiem;
- uzlabojumu skaitu pa gājienu tipiem;
- laiku un iterāciju līdz labākajam;
- trajektoriju (labākais un pašreizējais f ik pēc N/200 iterācijām).

Tas vajadzīgs kuru gājienu darbības analīzei un parametru pielāgošanai.
