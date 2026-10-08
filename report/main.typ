// Kursa atskaite: "Praktiskā kombinatoriālā optimizācija".
// Būvēšana (no repozitorija saknes):
//   typst compile --root . report/main.typ report/main.pdf
// Skaitļi tiek ņemti no results/ (pnpm bench all): galvenā tabula no results/summary.csv
// (viens eksperiments, mērķis ir tikai dēļu skaits B).

#let res = sys.inputs.at("results", default: "results")

#set page(paper: "a4", margin: (x: 1.8cm, y: 1.6cm), numbering: "1")
#set text(lang: "lv", size: 10pt)
#set par(justify: true, leading: 0.58em)
#set heading(numbering: "1.")
#show heading: set block(above: 1.1em, below: 0.6em)
#show figure.caption: set text(size: 8.5pt)
#show figure.where(kind: image): set figure(supplement: [Attēls])
#show figure.where(kind: table): set figure(supplement: [Tabula])

#align(center)[
  #text(size: 15pt, weight: "bold")[Lamināta izkārtojuma optimizācija ar simulēto rūdīšanu]\
  #v(2pt)
  Praktiskais darbs kursā "Praktiskā kombinatoriālā optimizācija" (LU)
]

= Uzdevuma formulējums

*Ievade.* Telpas kontūra (daudzstūris; testos ir arī L un U veida telpas, slīpas sienas, loki un šķēršļi), lamināta dēlis $L times W$ (testos $1285 times 192$ mm) un klāšanas noteikumi: zāģa griezuma platums $k$, minimālais rindas pirmā un pēdējā gabala garums $L_"min"$, minimālā šuvju nobīde $D$ starp blakus rindām un sprauga pie sienām. Dēļu orientācija ir fiksēta.

*Mērķis.* Sagriezt un izkārtot dēļus tā, lai atgriezumu būtu pēc iespējas mazāk. Klājamās virsmas laukums $A$ ir fiksēts, un atgriezumu laukums ir $B L W - A$, tāpēc *atgriezumu minimizēšana ir tas pats, kas dēļu skaita $B$ minimizēšana*.

*Atgriezumu izmantošana.* Klasiskajā klāšanā rindas pēdējā gabala atgriezums sāk nākamo rindu. Šajā darbā tas ir vispārināts: visus dēļus sagriež *pirms* ieklāšanas, tāpēc kādas rindas beigu gabals $e$ un *jebkuras* rindas sākuma gabals $s$ var nākt no viena dēļa, ja $e + s + k <= L$. Tādējādi uzdevuma kodols ir gabalu *pārošana* starp visām rindām (tuvs _cutting stock_ uzdevumam), ko ierobežo šuvju nobīde starp blakus rindām. Klasiskā metode ir viena no salīdzinājuma metodēm (B-NEXT).

#figure(
  image("/report/figures/plan-L1.svg", width: 46%),
  caption: [L veida telpas L1 griešanas plāns ($B = 87$). Gabali vienā krāsā nāk no viena dēļa. Marķējums: rinda, gabals, S = sākuma, B = beigu gabals.],
)

= Algoritms

*a) Domēns.* Klājamo zonu (telpa mīnus spraugas un šķēršļi) pagriež tā, lai rindas ietu pa $x$ asi. Rindas ir joslas $[y_0 + j W, y_0 + (j+1) W]$, un *segments* ir zonas un joslas sakarīga daļa (viena rinda var dot vairākus segmentus, piem., U telpā). Katram segmentam $s$ ir *šuvju fāze* $phi_s in [0, L)$: šuves atrodas punktos $x = phi_s + m L$, un no $phi_s$ viennozīmīgi izriet visi segmenta gabali. Risinājums ir vektors $phi = (phi_1, ..., phi_n)$, kur $n$ ir 2–62 segmenti. Fāzes, kas dotu pirmo vai pēdējo gabalu īsāku par $L_"min"$, nav atļautas. Rindu virziens un nobīde $y_0$ eksperimentos ir fiksēti.

*b) Novērtēšana.* _Dekoders_ pārvērš $phi$ griešanas plānā. Sākumā tas no $phi$ aprēķina visus gabalus. Tad beigu un sākuma gabalus sapāro: pēc kārtošanas *divu rādītāju* metode dod maksimālo pāru skaitu ar $e + s + k <= L$ (tas ir precīzi). Tāpat sapāro pirmās un pēdējās rindas garengriezuma strēmeles. Atlikušos gabalus izgriež no atgriezumiem (_best fit_) vai no veseliem dēļiem. Rezultāts ir dēļu skaits $B$. Mērķa funkcija ir
$ f(phi) = B + lambda_V V + epsilon N, $
kur $V$ ir šuvju nobīdes pārkāpumu skaits (sods ļauj meklēšanai īslaicīgi iziet cauri nederīgiem risinājumiem) un $N in [0, 1)$ ir maza piedeva, kas mēra, cik tuvu nesapārotie gabali ir nākamajam pārim (atšķir risinājumus ar vienādu $B$). *Apakšējās robežas:* saskaņotā $"LB"_0 = ceil(A slash (L W))$ un stingrāka $"LB"_1$, kas ņem vērā, ka gabali, kas saskaras ar blakus rindu, dēlī aizņem noteiktu augstumu. Ja $B = "LB" = max("LB"_0, "LB"_1)$, optimums ir pierādīts. Katru plānu no jauna pārbauda neatkarīgs validētājs.

*c) Gājieni.* M1 _Reset_: nejauša pieļaujama fāze vienam segmentam. M2 _Shift_: neliela nobīde, kas samazinās līdz ar temperatūru. M3 _Swap_: divu segmentu fāžu apmaiņa. M4 _Pair_ (mērķtiecīgs): nesapārotam beigu gabalam $e$ kādam segmentam iestata sākuma gabalu tieši $s = L - k - e$, tātad pāris nedod atgriezumu. M5 _Block_: viena nobīde 2–6 secīgām rindām. Varbūtības M1–M5: 0,05 / 0,15 / 0,05 / 0,60 / 0,15.

*d) Simulētā rūdīšana.* Sākuma risinājums ir konstruktīvās metodes B-INST fāzes. Sākuma temperatūru kalibrē no 200 izmēģinājuma gājieniem: $T_0 = -"median"(Delta^+) slash ln p_0$ ar $p_0 = "0,3"$. Beigu temperatūra ir $T_"end" = 1 slash ln(1 slash p_"end")$ ar $p_"end" = 10^(-8)$, un dzesēšana ir ģeometriska: $T = T_0 (T_"end" slash T_0)^tau$, kur $tau$ ir iztērētā budžeta daļa. Gājienu pieņem pēc Metropolisa kritērija ($Delta <= 0$ vai $"rnd" < e^(-Delta slash T)$). Atsevišķi glabā labāko *derīgo* risinājumu ($V = 0$). Ja 0,5~% budžeta nav atrasts jauns labākais, meklēšana atsākas no labākā ar $T_0 slash 2$. Ja $B = "LB"$, meklēšana apstājas (pierādīts optimums). Parametrus izvēlējos nelielā eksperimentā uz 9 telpām. Budžets ir novērtējumu skaits, lai rezultāti nebūtu atkarīgi no datora.

= Testēšana

*Testa piemēri* (27 telpas, `instances/`): taisnstūri R1–R4 (12–60 m²), L un U telpas L1–L3 un U1, telpas ar slīpām sienām (S1–S4), šķēršļiem (O1, O2) un lokiem (C1–C3). *Ģenerētās* telpas P1–P6 (14–61 m²) ir uzbūvētas tā, lai būtu zināms optimums $B^* = "LB"_1$, kurā atgriezumu nav (paliek tikai zāģa griezumi). Mazās telpas T1–T4 ļauj veikt pilnu pārlasi. Ja optimums nav zināms, salīdzinu ar *labāko zināmo* $B$ no 10 gariem SA skrējieniem (2~000~000 novērtējumu).

*Metodes.* B-NEXT: klasiskā klāšana (atgriezums sāk tikai nākamo rindu). B-INST: klājēja metode, kas izmanto atgriezumu kaudzi. HC: kāpšana kalnā ar gājieniem M1–M2 un restartiem. SA. *Protokols:* 20 sēklas uz telpu un metodi, 200~000 novērtējumu uz skrējienu, mērķis ir tikai $B$.

#let env = json("/" + res + "/env.json")
#let rows = csv("/" + res + "/summary.csv", row-type: dictionary)
#let boardM2 = 1285 * 192 / 1e6
// Latvian number format: decimal comma, `d` fixed decimals; `trim` drops them for whole numbers.
#let num(x, d: 1, trim: false) = {
  let v = calc.round(float(x), digits: d)
  if trim and v == calc.round(v) { return str(int(v)) }
  let parts = str(v).split(".")
  let decs = if parts.len() > 1 { parts.at(1) } else { "" }
  parts.at(0) + if d > 0 { "," + decs + "0" * (d - decs.len()) } else { "" }
}
#let waste(area, b) = num((1 - float(area) / (float(b) * boardM2)) * 100)
#let ref(r) = if r.knownOptimum != "" { r.knownOptimum + "*" } else { r.bestKnown }
#let refB(r) = float(if r.knownOptimum != "" { r.knownOptimum } else { r.bestKnown })

#figure(
  table(
    columns: 12,
    align: (left,) + (right,) * 11,
    stroke: 0.4pt + luma(160),
    inset: (x: 3pt, y: 2.2pt),
    table.header[*Telpa*][*m²*][*$"LB"_0$*][*LB*][*$B^*$*][*B-NEXT*][*B-INST*][*HC vid.*][*SA lab. / vid.*][*SA gap*][*Atgr. B-NEXT → SA*][*SA, s*],
    ..rows.map(r => {
      (
        r.instance, num(r.zoneM2), str(calc.ceil(float(r.zoneM2) / boardM2)), r.lb, ref(r),
        num(r.b_next_mean, d: 2, trim: true), num(r.b_inst_mean, d: 2, trim: true), num(r.hc_mean, d: 2, trim: true),
        r.sa_best + " / " + num(r.sa_mean, d: 2, trim: true),
        num((float(r.sa_mean) - refB(r)) / refB(r) * 100, d: 2, trim: true) + " %",
        waste(r.zoneM2, r.b_next_mean) + " → " + waste(r.zoneM2, r.sa_mean) + " %",
        num(float(r.sa_ms) / 1000),
      )
    }).flatten(),
  ),
  caption: [Rezultāti (dēļu skaits $B$). $B^*$: optimums (\* = pierādīts) vai labākais zināmais. HC un SA: vidējais pa 20 sēklām; SA gap $= (overline(B)_"SA" - B^*) slash B^*$. Atgriezumi $= 1 - A slash (B L W)$. Laiks ir vidējais uz skrējienu, ja 8 skrējieni vienlaikus darbojas uz #env.cpu. Avots: `results/summary.csv`.],
)

*Ģenerētās telpas pieaugošā izmērā.* Grūtības sērijā ģenerēju telpas ar zināmu optimumu un $n$ rindām (20 sēklas, 200~000 novērtējumu). SA optimumu atrod gandrīz vienmēr. HC to atrod tikai mazākajā telpā, citur paliek pie $B^* + 1$. Izņēmums ir $n = 38$ (2/20); ar 2~000~000 novērtējumu tur ir 17/20.

#let dif = csv("/results/f6/difficulty.csv", row-type: dictionary)
#let found(n, m) = {
  let r = dif.find(r => r.n == n and r.method == m)
  r.found + "/" + r.runs
}
#figure(
  table(
    columns: 10 + 1,
    align: (left,) + (right,) * 10,
    stroke: 0.4pt + luma(160),
    inset: (x: 4pt, y: 2.2pt),
    ..{
      let ns = dif.map(r => r.n).dedup()
      let cell(n, f) = f(dif.find(r => r.n == n))
      (
        ([*$n$ rindas*],) + ns.map(n => [*#n*]),
        ([m²],) + ns.map(n => cell(n, r => num(r.areaM2))),
        ([$B^*$],) + ns.map(n => cell(n, r => r.optimum)),
        ([B-INST],) + ns.map(n => found(n, "b-inst")),
        ([HC],) + ns.map(n => found(n, "hc")),
        ([SA],) + ns.map(n => found(n, "sa")),
      ).flatten()
    },
  ),
  caption: [Cik skrējienu atrod zināmo optimumu $B^*$. Avots: `results/f6/difficulty.csv`.],
)

*Secinājumi.*
+ *Kvalitāte.* SA labākais rezultāts sakrīt ar optimumu vai labāko zināmo visās 27 telpās, un vidējā atšķirība ir ≤ 0,17~% visur, izņemot S2 (2,6~%, viena dēļa starpība). 12 telpās $B = "LB"$, tātad optimums ir pierādīts (T1, T2, T4, P1–P6, R1, L3, O2). Pilnā pārlase uz T1–T4 dod tos pašus rezultātus kā SA. Ģenerētajās telpās SA atrod optimumu bez atgriezumiem (atgriezumi ≤ 0,2~%, tikai zāģa griezumi).
+ *Pret klasisko klāšanu.* SA vidēji izmanto par 4,6~% mazāk dēļu nekā B-NEXT (līdz 9,3~%, R3) un par 2,2~% mazāk nekā B-INST (līdz 9,0~%, U1). Atgriezumi samazinās, piemēram, R2 no 11,7~% līdz 3,2~% un U1 no 14,6~% līdz 6,2~%.
+ *SA pret HC.* Ģenerētajās telpās atšķirība ir skaidra: SA atrod optimumu, HC nē. Pārējās telpās abi bieži sasniedz to pašu $B$ (17 vienādi, SA labāks 8, HC labāks 2 ar starpību ≤ 0,15 dēļa).
+ *Iepriekšējas griešanas vērtība.* Tas pats SA ar klasisko atgriezumu izmantošanu klāšanas laikā nekad nav labāks un 15 telpās ir sliktāks (līdz 1,95 dēļa).
+ *Laiks* (viens pavediens, R1–R4): B-NEXT un B-INST 5–39 ms, HC 1,0–1,3 s, SA 2,2–2,9 s uz skrējienu (200~000 novērtējumu).

*Ierobežojumi.* 15 telpās labākais zināmais nav pierādīts optimums, un tas arī ir atrasts ar SA (garākos skrējienos). LB nav šaura (R4: LB = 249, labākais zināmais 256; T3: LB = 5, pārlase 7). Parametri izvēlēti uz daļas telpu, tāpēc pastāv pārmērīgas pielāgošanas risks. Ģenerētās telpas ir gandrīz taisnstūra formas.

= Saite uz repozitoriju

Kods, testa piemēri, rezultāti un atskaite: #link("https://github.com/WilsonDaCrab/laminate-planner")[github.com/WilsonDaCrab/laminate-planner]. Kods ir TypeScript; optimizācijas kodols ir `packages/core`, eksperimenti `packages/bench`. Rezultātus atkārto #box[`pnpm bench all --jobs auto`].
