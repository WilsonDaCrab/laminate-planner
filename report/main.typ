// Kursa atskaite: "Praktiskā kombinatoriālā optimizācija".
// Būvēšana (no repozitorija saknes):
//   typst compile --root . report/main.typ report/main.pdf
//   typst compile --root . --input results=results/quick report/main.typ report/quick.pdf   (sausā palaišana)
// Tabula un attēli tiek ņemti no results/ (pnpm bench all). Vietas, kas atkarīgas no galīgajiem
// skrējieniem, ir atzīmētas ar "JĀPABEIDZ".

#let res = sys.inputs.at("results", default: "results")
#let todo(body) = text(fill: red, weight: "bold")[\[JĀPABEIDZ: #body\]]

#set page(paper: "a4", margin: (x: 1.8cm, y: 1.8cm), numbering: "1")
#set text(lang: "lv", size: 9.5pt)
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

*d) Simulētā rūdīšana.* Sākums ir B-INST fāzes (derīgas pēc konstrukcijas). Sākuma temperatūra $T_0 = -"median"(Delta^+) / ln p_0$ tiek kalibrēta no 200 izmēģinājuma gājieniem ($p_0 = "0,8"$), beigu temperatūra $T_"end" = 1 slash ln(1 slash p_"end")$ ($p_"end" = "0,001"$: +1 dēli pieņem ar varbūtību 0,001); dzesēšana ģeometriska, $T = T_0 (T_"end" slash T_0)^tau$, kur $tau$ ir iztērētā budžeta daļa. Pieņemšana pēc Metropolisa kritērija $Delta <= 0 or "rnd" < e^(-Delta \/ T)$; atsevišķi tiek glabāts labākais _derīgais_ risinājums, un meklēšana apstājas, tiklīdz $B = "LB"_1$ (pierādīts optimums). Eksperimentos budžets ir iterāciju skaits (nevis laiks), lai rezultāti nebūtu atkarīgi no datora ātruma.

#todo("SA pseidokods (ALGORITHM §7) un galīgo skrējienu parametri, ja atšķiras no noklusējuma (ADR-016)")

= Testēšana

*Instanču komplekts* (27 telpas): tiny (T1–T4; pilnā pārlase), planted (P1–P6 ar zināmu optimumu $B^* = "LB"_1$), taisnstūri (R1–R4), L un U telpas (L1–L3, U1), slīpās (S1–S4), ar šķēršļiem (O1, O2) un ar lokiem (C1–C3). *Protokols:* metodes B-NEXT, B-INST, RS, HC, SA (precut) un SA-onsite; 20 sēklas, 200 000 novērtējumu uz skrējienu; $theta$, sākuma puse un $y_0$ fiksēti. Mēra $B$, apakšējo robežu, gap, laiku un derīgumu. Dators un commit ir ierakstīti `results/env.json`.

#let rows = csv("/" + res + "/summary.csv", row-type: dictionary)
#let num(x, d: 1) = if x == "" { "–" } else { str(calc.round(float(x), digits: d)) }
#let sa(r) = if r.sa_best == "" { "–" } else { r.sa_best + " / " + num(r.sa_mean, d: 2) + " ± " + num(r.sa_std, d: 2) }

#figure(
  table(
    columns: (auto, auto, auto, auto, auto, auto, auto, auto, 1fr, auto),
    align: (left, right, right, right, right, right, right, right, right, right),
    stroke: 0.4pt + luma(160),
    inset: (x: 3pt, y: 2.2pt),
    table.header[*Instance*][*m²*][*segm.*][*LB*][*B-NEXT*][*B-INST*][*RS*][*HC*][*SA: labākais / vid. ± std*][*SA laiks, s*],
    ..rows.map(r => (
      r.instance, num(r.zoneM2), r.segments, r.lb,
      num(r.b_next_mean), num(r.b_inst_mean), num(r.rs_mean), num(r.hc_mean),
      sa(r),
      if r.sa_ms == "" { "–" } else { num(float(r.sa_ms) / 1000) },
    )).flatten(),
  ),
  caption: [Galvenā tabula (vidējais $B$ pa derīgajiem skrējieniem; $m^2$ ir uzstādāmās zonas laukums). Avots: `results/summary.csv`.],
)

#figure(
  image("/" + res + "/plots/G1.svg", width: 100%),
  caption: [G1. SA konverģence: labākais $B$ līdz attiecīgajam novērtējumu skaitam (vidējais un min–max pa sēklām).],
)

#figure(
  image("/" + res + "/plots/G3.svg", width: 100%),
  caption: [G3. Iepriekšējas griešanas vērtība: $B$ procentos pret B-INST (klāšanas laikā griežot); SA-onsite ir tas pats SA ar atlikumu izmantošanu uz vietas, SA ir iepriekšēja griešana.],
)

#figure(
  image("/" + res + "/plots/G2.svg", width: 100%),
  caption: [G2. H-rakstura cena: vidējais $B$ atkarībā no šuvju nobīdes attāluma $D$ (mm).],
)

*Plantētie optimumi un grūtības sērija.* #todo("cik sēklu atrod plantēto optimumu P1–P6 un n = 6…42 (results/f6/difficulty.csv, planted.txt); godīgi: SA ≈ HC uz daļas instanču, P2–P4 nav optimums — ADR-017)")

*Secinājumi.* #todo("gap pret LB, plantēto optimumu atrašanas daļa, laiks, iepriekšējas griešanas vērtība; pilnā pārlase uz T1–T4 (ADR-018, ADR-019); ierobežojumi")

= Saite uz repozitoriju

#todo("publiskā GitHub repozitorija URL; git tag v0.1-kurss; viena rindkopa par lietotni (PWA), ja ir ekrānuzņēmums")
