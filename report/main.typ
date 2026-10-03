// Kursa atskaite: "Praktiskā kombinatoriālā optimizācija".
// Būvēšana (no repozitorija saknes):
//   typst compile --root . report/main.typ report/main.pdf
//   typst compile --root . --input results=results/quick report/main.typ report/quick.pdf   (sausā palaišana)
// Tabula un attēli tiek ņemti no results/ (pnpm bench all). Vietas, kas atkarīgas no galīgajiem
// skrējieniem, ir atzīmētas ar "JĀPABEIDZ".

#let res = sys.inputs.at("results", default: "results")
#let todo(body) = text(fill: red, weight: "bold")[\[JĀPABEIDZ: #body\]]

#set page(paper: "a4", margin: (x: 1.6cm, y: 1.5cm), numbering: "1")
#set text(lang: "lv", size: 9pt)
#set par(justify: true, leading: 0.55em)
#set heading(numbering: "1.")
#show heading: set block(above: 1em, below: 0.6em)
#show figure.caption: set text(size: 8.5pt)

#align(center)[
  #text(size: 15pt, weight: "bold")[Lamināta izkārtojums ar iepriekšēju griešanu: simulētā rūdīšana]\
  #v(2pt)
  Praktiskais darbs kursā "Praktiskā kombinatoriālā optimizācija" (LU)
]

= Uzdevuma formulējums

Telpa ir daudzstūris (arī ar lokiem un šķēršļiem). To jāsegt ar lamināta dēļiem, kuru orientācija ir fiksēta (dēli nevar pagriezt), tā, lai būtu ievēroti klāšanas noteikumi, un *jāminimizē nepieciešamo dēļu skaits $B$*. Noteikumi: termiskā sprauga pie sienām, zāģa griezums $k$, minimālais sākuma/beigu gabala garums $L_"min"$, blakus rindu šuvju minimālā nobīde $D$ un minimālais strēmeles platums. Mērķis ir arī praktisks: klājējs visus dēļus *sagriež pirms ieklāšanas* (nav cikla "mēri – griez – mēri – griez"), tāpēc vienu dēli drīkst dalīt vairākos gabalos tikai noteiktā veidā: dēlī ir ne vairāk kā viens sākuma un viens beigu gabals.

Kombinatoriskais kodols ir globāla gabalu *pārošana*: rindas beigu gabals $e$ un kādas rindas sākuma gabals $s$ var nākt no viena dēļa, ja $e + s + k <= L$. Tas ir cieši saistīts ar _cutting stock_ / _bin packing_ uzdevumu, bet ar papildu ģeometriskiem ierobežojumiem (šuvju nobīde starp blakus rindām).

#figure(
  image("/report/figures/plan-L1.svg", width: 52%),
  caption: [Telpas L1 (L veida dzīvojamā istaba) griešanas plāns, ko atrod SA (30 000 novērtējumu, sēkla 1): $B = 87$, apakšējā robeža $"LB"_1 = 85$. Katra krāsa ir viens dēlis; gabali ar vienu krāsu nāk no viena dēļa (pāris $e + s + k <= L$). Marķējums: rinda, gabals, S = sākuma, B = beigu gabals. Attēls: `bench run instances/lshape/L1.json --method sa --seed 1 --iters 30000 --svg`.],
)

= Algoritms

*a) Domēns.* Uzstādāmā zona $Z$ (telpa mīnus spraugas un šķēršļi) tiek pagriezta par $-theta$, lai rindas ietu pa $x$. Rindas ir joslas $[y_0 + j W, y_0 + (j+1) W]$; _segments_ ir sakarīga komponente $Z inter$ josla. Katram segmentam $s$ ir šuvju fāze $phi_s in [0, L)$; šuves ir taisnes $x = phi_s + m L$, un no $phi_s$ viennozīmīgi izriet segmenta gabali. Risinājums ir vektors $phi = (phi_s)$; katram segmentam pieļaujamo fāžu kopa $F_s$ izriet no $L_"min"$. Ārējā cilpa pārlasa virzienu $theta$, sākuma sienu un rindu nobīdi $y_0$.

*b) Novērtēšana.* _Dekoders_ pārvērš $phi$ konkrētā griešanas plānā: sākuma un beigu gabalus un strēmeles pāro ar kārtošanu un divu rādītāju metodi (precīzs maksimālais pāru skaits), atlikumus izmanto brīvajiem gabaliem; rezultāts ir dēļu skaits $B$. Mērķa funkcija $f = B + lambda_V V + lambda_H H + epsilon N$, kur $V$ ir šuvju nobīdes pārkāpumi, $H$ estētika (H-raksts), $N$ tuvums nākamajam pārim. Apakšējā robeža $"LB"_1 = ceil(max_(y_b) sum_s c_s (y_b) / L)$ nav atkarīga no $phi$; ja $B = "LB"_1$, optimums ir pierādīts. Neatkarīgs validators pārbauda katru plānu no jauna, un novērtētāja, plāna konstruktora un validatora dēļu skaits vienmēr sakrīt.

*c) Gājieni.* Pieci gājieni pār $phi$: M1 _Reset_ ($phi_s <- U(F_s)$), M2 _Shift_ (nobīde $delta$, kas dilst līdz ar temperatūru), M3 _Swap_ (divu segmentu fāžu apmaiņa), M4 _Pair_ un M5 _Block_ (vienas nobīdes pielikšana 2–6 secīgām joslām). M4 ir mērķtiecīgs: nesapārotam beigu gabalam $e$ tas uzstāda kāda segmenta sākuma gabalu tieši $s^* = C - e$ ($C = L - k$), tātad $e + s + k = L$ un atgriezums ir nulle; paplašinātā versija meklē _slēgtus_ pāru ciklus. Noklusējuma varbūtības M1–M5: 0,05; 0,15; 0,05; *0,60*; 0,15 (ADR-016; sākotnējās 0,15/0,30/0,15/0,30/0,10 ir saglabātas salīdzināšanai).

*d) Simulētā rūdīšana.* Sākums ir B-INST fāzes (derīgas pēc konstrukcijas). Sākuma temperatūra $T_0 = max(-"median"(Delta^+) / ln p_0, T_"end")$ tiek kalibrēta no 200 izmēģinājuma gājieniem (gājieni, kas palielina $V$, netiek ņemti vērā) ar $p_0 = "0,3"$; beigu temperatūra $T_"end" = 1 slash ln(1 slash p_"end")$ ar $p_"end" = 10^(-8)$; dzesēšana ģeometriska, $T = T_0 (T_"end" slash T_0)^tau$, kur $tau$ ir iztērētā budžeta daļa. Pieņemšana pēc Metropolisa kritērija $Delta <= 0 or "rnd" < e^(-Delta slash T)$; atsevišķi tiek glabāts labākais _derīgais_ risinājums, un meklēšana apstājas, tiklīdz $B = "LB"$ (pierādīts optimums). *Atjaunošana:* ja 0,5 % budžeta nav jauna labākā, meklēšana turpinās no labākā risinājuma ar $T_0 / 2$ un atlikušajam budžetam atkal atdzesē (ADR-027). Parametri izvēlēti uz 9 telpām ar tīru $B$ mērķi: 88/90 skrējienu sasniedz labāko zināmo optimumu pret 52/90 ar sākotnējiem $p_0 = "0,8"$, $p_"end" = "0,001"$ un bez atjaunošanas. Eksperimentos budžets ir iterāciju skaits (nevis laiks), lai rezultāti nebūtu atkarīgi no datora ātruma.

Eksperimentos izmantoti noklusējuma parametri (ADR-027), 200 000 novērtējumu uz skrējienu, gājienu varbūtības kā augstāk (ADR-016); pilns pseidokods ir `docs/ALGORITHM.md` §7.

= Testēšana

*Instanču komplekts* (27 telpas): tiny (T1–T4; pilnā pārlase), planted (P1–P6 ar zināmu optimumu $B^* = "LB"_1$; tās ir tīri dēļu minimizēšanas uzdevumi bez H-rakstura, ADR-026), taisnstūri (R1–R4), L un U telpas (L1–L3, U1), slīpās (S1–S4), ar šķēršļiem (O1, O2) un ar lokiem (C1–C3). *Protokols:* metodes B-NEXT, B-INST, RS, HC, SA (precut) un SA-onsite; 20 sēklas, 200 000 novērtējumu uz skrējienu; $theta$, sākuma puse un $y_0$ fiksēti. Eksperimenti: E1 ar produkta mērķi (H-raksts ieslēgts, kur noteikumos tas ir), E3 ar H-rakstura attālumu un E4 tikai ar dēļu skaitu (H-raksts izslēgts visās telpās; HC, SA, SA-onsite; `results/summary_bonly.csv`). Mēra $B$, apakšējo robežu $"LB"$, laiku un derīgumu; tabulā $"gap" = B - "LB"$ var nolasīt no kolonnām, bet vidējie ir tikai pa derīgajiem skrējieniem (kolonna "der." rāda SA derīgo skrējienu daļu). Dators, pavedienu skaits un commit ir ierakstīti `results/env.json`.

#let env = json("/" + res + "/env.json")
#let rows = csv("/" + res + "/summary.csv", row-type: dictionary)
#let num(x, d: 1) = if x == "" { "–" } else { str(calc.round(float(x), digits: d)) }
#let sa(r) = if r.sa_best == "" { "–" } else { r.sa_best + " / " + num(r.sa_mean, d: 2) + " ± " + num(r.sa_std, d: 2) }

#figure(
  table(
    columns: (auto, auto, auto, auto, auto, auto, auto, auto, 1fr, auto, auto),
    align: (left, right, right, right, right, right, right, right, right, right, right),
    stroke: 0.4pt + luma(160),
    inset: (x: 3pt, y: 2.2pt),
    table.header[*Instance*][*m²*][*segm.*][*LB*][*B-NEXT*][*B-INST*][*RS*][*HC*][*SA: labākais / vid. ± std*][*der.*][*SA laiks, s*],
    ..rows.map(r => (
      r.instance, num(r.zoneM2), r.segments, r.lb,
      num(r.b_next_mean), num(r.b_inst_mean), num(r.rs_mean), num(r.hc_mean),
      sa(r),
      if r.sa_feasible == "" { "–" } else { r.sa_feasible },
      if r.sa_ms == "" { "–" } else { num(float(r.sa_ms) / 1000) },
    )).flatten(),
  ),
  caption: [Galvenā tabula (vidējais $B$ pa derīgajiem skrējieniem; $m^2$ ir uzstādāmās zonas laukums). Avots: `results/summary.csv`. Laiki mērīti ar #env.threads pavedienu(-iem) uz #env.cpu; ar vairākiem pavedieniem skrējieni dala datoru, tāpēc laiki ir aptuveni.],
)

#figure(
  image("/" + res + "/plots/G1.svg", width: 74%),
  caption: [G1. SA konverģence: labākais $B$ līdz attiecīgajam novērtējumu skaitam (vidējais un min–max pa 20 sēklām), pa vienai vidēja lieluma telpai no katras ģimenes (P4, R2, L1, S1, O1, C1); visas instances ir `results/tables/g1_convergence.csv`.],
)

#figure(
  image("/" + res + "/plots/G3.svg", width: 66%),
  caption: [G3. Iepriekšējas griešanas vērtība: $B$ procentos pret B-INST (klāšanas laikā griežot); SA-onsite ir tas pats SA ar atlikumu izmantošanu uz vietas, SA ir iepriekšēja griešana.],
)

#figure(
  image("/" + res + "/plots/G2.svg", width: 76%),
  caption: [G2. H-rakstura cena: vidējais $B$ atkarībā no šuvju nobīdes attāluma $D$ (mm).],
)

*Plantētie optimumi un grūtības sērija.* Plantētās telpas P1–P6 ir ar zināmu optimumu $B^* = "LB"_1$ (ADR-015). SA atrod optimumu 20/20 sēklās uz P1–P4, 16/20 uz P5 un 18/20 uz P6; HC nekad (vienmēr $B^* + 1$). Grūtības sērijā (plantētas telpas ar $n$ rindām, ģeneratora sēkla $n$, 20 sēklas, 200 000 novērtējumu, jaunie SA noklusējumi, ADR-027) SA optimumu atrod 20/20 pie $n = 6, 10, 14, 18, 22, 26, 34$ un $42$, 18/20 pie $n = 30$ un tikai 2/20 pie $n = 38$ (vidējais $B$ ir $B^* + 0,9$). B-INST un RS to neatrod nekad (RS pie $n >= 18$ nedod nevienu derīgu rezultātu, jo neņem vērā šuvju nobīdi), HC to atrod tikai pie $n = 6$ (20/20), citur vienmēr $B^* + 1$. Sērija nav monotona ($n = 38$ ir krasi grūtāka par $n = 42$), jo katram $n$ ir cita nejauša instance.

#let dif = csv("/results/f6/difficulty.csv", row-type: dictionary)
#let found(n, m) = {
  let r = dif.find(r => r.n == n and r.method == m)
  r.found + "/" + r.runs
}
#figure(
  table(
    columns: (auto, auto, auto, auto, auto, auto, auto),
    align: (right, right, right, right, right, right, right),
    stroke: 0.4pt + luma(160),
    inset: (x: 4pt, y: 2.2pt),
    table.header[*$n$*][*m²*][*$B^*$*][*B-INST*][*RS*][*HC*][*SA*],
    ..dif.map(r => r.n).dedup().map(n => {
      let r = dif.find(r => r.n == n)
      (n, str(calc.round(float(r.areaM2), digits: 1)), r.optimum, found(n, "b-inst"), found(n, "rs"), found(n, "hc"), found(n, "sa"))
    }).flatten(),
  ),
  caption: [Grūtības sērija: skrējieni, kas atrod plantēto optimumu $B^*$ (atrasts/skrējieni). Avots: `results/f6/difficulty.csv`.],
)

*Secinājumi.* (1) *Pret bāzes metodēm.* SA uzlabo B-INST vidēji par 2,1 % (līdz 9,0 %, telpa U1) un B-NEXT par 4,5 % (līdz 9,3 %, telpa R3) uz 23 netriviālām instancēm (vidējie $B$ pa 20 sēklām); visi SA skrējieni (1720 no 1720, G2/G3/E4 ieskaitot) beidzas derīgi. RS 408 no 540 skrējieniem ir nederīgi ($V > 0$), tāpēc tas nav lietojams. (2) *Pret apakšējo robežu.* SA labākais rezultāts atšķiras no $"LB" = max("LB"_0, "LB"_1)$ vidēji par 1,2 dēļiem (2,9 %); 12 no 27 telpām sakrīt ar LB (T1, T2, T4, P1–P6, R1, L3, O2), tātad ir pierādīti optimāli. Lielākā atšķirība ir R4 (+7 dēļi, 2,8 %) un T3 (LB 5, pārlase 7), tātad LB nav šaura. (3) *SA pret HC.* E1: vidējais $B$ pa 20 sēklām SA labāks 8 telpās (P1–P6, L2, L3), HC labāks 2 (L1 +0,2, S2 +0,05), 13 vienādi (zīmju tests $p = "0,11"$). *Plantētajās atšķirība ir pilnīga* (sk. augstāk). Pārējās telpās starpība ≤ 0,35 dēļa, tur SA priekšrocība nav pierādīta. F5 kritērijs (a) nav stingri izpildīts (L1: HC 86,6 pret SA 86,8), kritērijs (b) ir izpildīts 5 no 6 plantētajām (P5: 80 %, citām ≥ 90 %). (4) *Mērķa funkcija maskēja SA* (ADR-026): ar ieslēgtu H-rakstu SA plantētajās telpās pareizi apmainīja vienu dēli pret nulles H sodu, tāpēc iepriekšējie secinājumi "SA ≈ HC" mērīja nepareizu uzdevumu. (5) *Parametri un atjaunošana* (ADR-027): zemāks sākuma $p_0$, ļoti zems $p_"end"$ un biežas atjaunošanas no labākā risinājuma uzlaboja labākā zināmā optimuma sasniegšanu no 52/90 līdz 88/90 skrējieniem. Atkārtots `bestKnown` (10 × 2 000 000 ar jauno SA) 15 telpās (12 ar `knownOptimum` nav pārskrietas) sakrīt ar ierakstītajām vērtībām (S2: 37 → 36); SA ar 200 000 novērtējumiem tām sakrīt, izņemot S2. (6) *Iepriekšēja griešana.* Pie vienāda budžeta SA ar iepriekšēju griešanu nekad nav sliktāks par SA-onsite (vidējā starpība 0…1,95 dēļi, G3); B-INST nav labāks ne par vienu no tiem. (7) *H-raksts (G2).* Šuvju nobīdes attālums $D = 200…500$ mm maina vidējo $B$ tikai L1 (bez H-raksta 86,15, ar H-rakstu 87,1–87,8, t.i., +1,0…+1,7 dēļi) un R2 (≤ +0,25); S1 ≤ +0,3, O1 nemainās. (8) *Pilnā pārlase uz T1–T4* (ADR-018, ADR-019): HC un SA sakrīt ar pārlasi visās četrās; $B = "LB"_1 = 5$ ir sasniegts T1, T2, T4, bet T3 optimums ir 7.

(9) *Laiks* (viens pavediens, R1–R4, 3 sēklas, `results/timing`): B-NEXT un B-INST 5–39 ms, HC 1,0–1,3 s, SA 2,2–2,9 s, RS 4,6–10,6 s un SA-onsite 3,7–5,1 s uz skrējienu ar 200 000 novērtējumiem. SA-onsite ir tikai 1,7–1,9 reizes lēnāks par SA pēc ātrā on-site novērtētāja (ADR-025; iepriekš 18–38 reizes: 37–110 s). Visa matrica (4474 skrējieni) uz 8 pavedieniem aizņēma 1 h 24 min.

*Ierobežojumi.* 20 sēklas uz kombināciju; `bestKnown` ir labākais no 10 gariem SA skrējieniem (un E4), nevis pierādīts optimums; LB nav šaura (T3, R4); SA parametri izvēlēti uz 9 telpām un 10 sēklām (pārmērīgas pielāgošanas risks); plantētās telpas ir gandrīz taisnstūra (ADR-015); laiki ar vienu pavedienu mērīti tikai uz R1–R4.


= Saite uz repozitoriju

Kods, instances, rezultāti un šī atskaite: #link("https://github.com/WilsonDaCrab/laminate-planner")[github.com/WilsonDaCrab/laminate-planner] (tag `v0.1-kurss`). Skaitļus un grafikus atkārto `pnpm bench all --jobs auto` (~1,5 h uz 8 pavedieniem). Web lietotne (PWA) vēl nav izveidota (fāzes F7+).
