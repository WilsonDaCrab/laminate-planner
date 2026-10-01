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

*d) Simulētā rūdīšana.* Sākums ir B-INST fāzes (derīgas pēc konstrukcijas). Sākuma temperatūra $T_0 = max(-"median"(Delta^+) / ln p_0, T_"end")$ tiek kalibrēta no 200 izmēģinājuma gājieniem (gājieni, kas palielina $V$, netiek ņemti vērā, jo sods nav dēļu skaita solis) ($p_0 = "0,8"$), beigu temperatūra $T_"end" = 1 slash ln(1 slash p_"end")$ ($p_"end" = "0,001"$: +1 dēli pieņem ar varbūtību 0,001); dzesēšana ģeometriska, $T = T_0 (T_"end" slash T_0)^tau$, kur $tau$ ir iztērētā budžeta daļa. Pieņemšana pēc Metropolisa kritērija $Delta <= 0 or "rnd" < e^(-Delta \/ T)$; atsevišķi tiek glabāts labākais _derīgais_ risinājums, un meklēšana apstājas, tiklīdz $B = "LB"$ (pierādīts optimums). Eksperimentos budžets ir iterāciju skaits (nevis laiks), lai rezultāti nebūtu atkarīgi no datora ātruma.

Eksperimentos izmantoti noklusējuma parametri: $p_0 = "0,8"$, $p_"end" = "0,001"$, 200 000 novērtējumu uz skrējienu, gājienu varbūtības kā augstāk (ADR-016); pilns pseidokods ir `docs/ALGORITHM.md` §7.

= Testēšana

*Instanču komplekts* (27 telpas): tiny (T1–T4; pilnā pārlase), planted (P1–P6 ar zināmu optimumu $B^* = "LB"_1$), taisnstūri (R1–R4), L un U telpas (L1–L3, U1), slīpās (S1–S4), ar šķēršļiem (O1, O2) un ar lokiem (C1–C3). *Protokols:* metodes B-NEXT, B-INST, RS, HC, SA (precut) un SA-onsite; 20 sēklas, 200 000 novērtējumu uz skrējienu; $theta$, sākuma puse un $y_0$ fiksēti. Mēra $B$, apakšējo robežu $"LB"$, laiku un derīgumu; tabulā $"gap" = B - "LB"$ var nolasīt no kolonnām, bet vidējie ir tikai pa derīgajiem skrējieniem (kolonna "der." rāda SA derīgo skrējienu daļu). Dators, pavedienu skaits un commit ir ierakstīti `results/env.json`.

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

*Plantētie optimumi un grūtības sērija.* Plantētās telpas P1–P6 ir ar zināmu optimumu $B^* = "LB"_1$ (ADR-015). SA atrod optimumu tikai P1 (visas 20 sēklas); P2–P6 tas visās sēklās atrod $B^* + 1$ (labākais 89, 121, 169, 201, 249 pret 88, 120, 168, 200, 248). Grūtības sērijā (plantētas telpas ar $n$ rindām, ģeneratora sēkla $n$, 20 sēklas, 200 000 novērtējumu) SA optimumu atrod 20/20 pie $n = 6$, 8/20 pie 10, 14/20 pie 14, 5/20 pie 18, 1/20 pie 26 un nekad pie 22 un $n >= 30$; B-INST un RS to neatrod nekad (RS pie $n >= 18$ nedod nevienu derīgu rezultātu, jo neņem vērā šuvju nobīdi), HC tikai pie $n = 6$ (20/20). Tātad ar šo budžetu SA ir labāks par HC tikai mazās telpās (n = 38 SA vidēji ir nedaudz sliktāks, 153,3 pret 153,0; pie 22, 30, 34 un 42 abi ir vienādi), un optimuma atrašanas varbūtība strauji krīt, pieaugot rindu skaitam; sērija nav monotona (14, 18, 22), jo katram $n$ ir cita nejauša instance.

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

*Secinājumi.* (1) *Pret bāzes metodēm.* SA uzlabo B-INST vidēji par 1,9 % (līdz 9,0 %, telpa U1) un B-NEXT par 4,3 % (līdz 9,3 %, telpa R3) uz 23 netriviālām instancēm (vidējie $B$ pa 20 sēklām); visi SA skrējieni (540 no 540) beidzas derīgi. RS 408 no 540 skrējieniem ir nederīgi ($V > 0$), tāpēc tas nav lietojams. (2) *Pret apakšējo robežu.* SA labākais rezultāts atšķiras no $"LB" = max("LB"_0, "LB"_1)$ vidēji par 1,4 dēļiem (3,1 %); 7 no 27 telpām sakrīt ar LB (T1, T2, T4, P1, R1, L3, O2), tātad ir pierādīti optimāli. Lielākā atšķirība ir R4 (+7 dēļi, 2,8 %) un T3 (LB 5, pārlase 7), tātad LB nav šaura. (3) *SA pret HC.* Vidējais $B$ pa 20 sēklām sakrīt 16 telpās no 23, SA ir labāks 3, HC labāks 4 telpās (zīmju tests $p = "1,0"$): *SA nav būtiski labāks par HC pie šī budžeta*, un F5 kritēriji (a) un (b) paliek neizpildīti (ADR-017). (4) *Budžets.* SA labākais rezultāts 200 000 novērtējumos sakrīt ar labāko no 10 skrējieniem pa 2 000 000 (`bestKnown`) visās 21 telpā, kurām tas ir ierakstīts, tātad labākais rezultāts 10× lielākā budžetā nemainījās (vidējais gan uzlabojās par ≤ 0,7 dēļiem: L1 86,95 → 86,70, L2 129,8 → 129,1, L3 64,7 → 64,3), lai gan G1 līknes pie 200 000 vēl krīt; sešās no šīm telpām (T1, T2, T4, R1, L3, O2) sakritība ir triviāla, jo LB ir sasniegta. (5) *Iepriekšēja griešana.* Pie vienāda budžeta SA ar iepriekšēju griešanu nekad nav sliktāks par SA-onsite (vidējā starpība 0…1,3 dēļi, G3); B-INST nav labāks ne par vienu no tiem. (6) *H-raksts (G2).* Šuvju nobīdes attālums $D = 200…500$ mm maina vidējo $B$ tikai uz L1 (bez H-raksta 86,7, ar H-rakstu 87,0–87,5, t.i., līdz 0,8 dēļiem) un R2 (≤ 0,05); S1 un O1 tas nemainās. Atlikušais $H$ pārkāpums gan aug līdz ar $D$ (R2: no 4,7 pie 200 mm līdz 22,3 pie 500 mm), tātad uz R2, S1 un O1 cena dēļos ir ≈ 0 (uz L1 līdz +0,8), bet atlikušais H pārkāpums pieaug. (7) *Pilnā pārlase uz T1–T4* (ADR-018, ADR-019): HC un SA sakrīt ar pārlasi visās četrās; $B = "LB"_1 = 5$ ir sasniegts T1, T2, T4, bet T3 optimums ir 7.

(8) *Laiks* (viens pavediens, R1–R4, 3 sēklas, `results/timing`): B-NEXT un B-INST 5–40 ms, HC 0,9–1,4 s, SA 2,1–2,9 s, RS 4,6–10 s un SA-onsite 37–110 s uz skrējienu ar 200 000 novērtējumiem; tātad SA-onsite ir 18–38 reizes lēnāks par SA, jo tam nav ātrā (tipizēto masīvu) novērtētāja. R1 SA apstājas pēc 11 ms, jo sasniedz LB (pierādīts optimums). Visa matrica (2854 skrējieni) uz 15 pavedieniem aizņēma 2 h 41 min; tabulas laika kolonna ir no šī skrējiena, tāpēc tā ir aptuvena.

*Ierobežojumi.* 20 sēklas uz kombināciju; `bestKnown` ir labākais no 10 gariem SA skrējieniem, nevis pierādīts optimums; LB nav šaura (T3, R4); plantētās telpas ir gandrīz taisnstūra (ADR-015); SA-onsite bez ātrā novērtētāja; laiki ar vienu pavedienu mērīti tikai uz R1–R4.


= Saite uz repozitoriju

Kods, instances, rezultāti un šī atskaite: #link("https://github.com/WilsonDaCrab/laminate-planner")[github.com/WilsonDaCrab/laminate-planner] (tag `v0.1-kurss`). Skaitļus un grafikus atkārto `pnpm bench all --jobs auto` (~2,7 h). Web lietotne (PWA) vēl nav izveidota (fāzes F7+).
