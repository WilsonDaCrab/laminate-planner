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
  Mazais praktiskais darbs kursā "Praktiskā kombinatoriālā optimizācija" (LU)\
  Aigars Rācenis, ar26104
]

= Uzdevuma formulējums

*Ievade.* Telpas kontūra (daudzstūris; testos ir arī L un U veida telpas, slīpas sienas, loki un šķēršļi), lamināta dēlis $L times W$ un klāšanas noteikumi: zāģa griezuma platums $k$, minimālais rindas pirmā un pēdējā gabala garums $L_"min"$, minimālā šuvju nobīde $D$ starp blakus rindām un sprauga pie sienām. Testos dēlis ir $1285 times 192$~mm, $k = 3$~mm, $L_"min" = D = 300$~mm, sprauga 10~mm. Lokus pirms aprēķina aizstāj ar lauztu līniju (novirze ≤ 0,5~mm). Dēļa orientācija ir fiksēta: dēli nevar pagriezt.

*Mērķis.* Sagriezt un izkārtot dēļus tā, lai atgriezumu būtu pēc iespējas mazāk. Klājamās virsmas laukums $A$ ir fiksēts, un atgriezumu laukums ir $B L W - A$, tāpēc *atgriezumu minimizēšana ir tas pats, kas dēļu skaita $B$ minimizēšana*.

*Atgriezumu izmantošana.* Dēļa galos ir slēdzeņu profili, un gabalam profils vajadzīgs tajā galā, kur tas savienojas ar blakus dēli. Tāpēc rindas sākuma gabals ir dēļa labā daļa, bet beigu gabals — kreisā daļa, un no viena dēļa var iegūt vienu beigu un vienu sākuma gabalu. Klasiskajā klāšanā rindas beigu gabala atgriezums sāk nākamo rindu. Šajā darbā tas ir vispārināts: visus dēļus sagriež *pirms* ieklāšanas, tāpēc kādas rindas beigu gabals $e$ un *jebkuras* rindas sākuma gabals $s$ var nākt no viena dēļa, ja $e + s + k <= L$. Tādējādi uzdevuma kodols ir gabalu *pārošana* starp visām rindām (līdzīgi kā _cutting stock_ uzdevumā), ko ierobežo šuvju nobīde starp blakus rindām. Klasiskā metode ir viena no salīdzinājuma metodēm (B-NEXT). Ja telpas platums nav $W$ daudzkārtnis, pirmā un pēdējā rinda ir šaurāka par $W$, un to gabalus izgriež gareniski (strēmeles). Pirmās rindas strēmelei vajag tikai augšmalas profilu, bet pēdējās — tikai apakšmalas, tāpēc strēmeles ar platumu $a$ un $b$ var izgriezt no viena dēļa, ja $a + b + k <= W$.

#figure(
  image("/report/figures/plan-L1.svg", width: 46%),
  caption: [L veida telpas L1 griešanas plāns ar $B = 86$ (SA, sēkla 1). Viena dēļa gabaliem ir vienāda krāsa.],
)

= Algoritms

*a) Domēns.* Klājamo zonu (telpa mīnus spraugas un šķēršļi) pagriež tā, lai rindas ietu pa $x$ asi. Rindas ir joslas $[y_0 + j W, y_0 + (j+1) W]$, $j in ZZ$, un *segments* ir zonas un joslas sakarīga daļa (viena rinda var dot vairākus segmentus, piem., U telpā). Katram segmentam $s$ ir *šuvju fāze* $phi_s in [0, L)$: šuves atrodas punktos $x = phi_s + m L$, $m in ZZ$, un no $phi_s$ viennozīmīgi izriet visi segmenta gabali. Risinājums ir vektors $phi = (phi_1, ..., phi_n)$, kur $n$ ir segmentu skaits (testos no 2 līdz 62). Taisnstūra segmentos fāzes attālums no segmenta sākuma ir vesels milimetru skaits, citos segmentos fāze ir nepārtraukta. Fāzes, kas dotu pirmo vai pēdējo gabalu īsāku par $L_"min"$, nav atļautas. Rindu virziens un nobīde $y_0$ ir fiksēti: $y_0$ ir mazākais veselais milimetru skaits, pie kura katra strēmele pie rindām paralēlas sienas ir vismaz 50~mm plata vai tādas strēmeles nav (ģenerētajās telpās $y_0 = 0$).

*b) Novērtēšana.* _Dekoders_ pārvērš $phi$ griešanas plānā. Vispirms tas no $phi$ aprēķina visus gabalus. Tad beigu un sākuma gabalus sapāro: pēc kārtošanas *divu rādītāju* metode dod maksimālo iespējamo pāru skaitu ar $e + s + k <= L$. Gabaliem ar slīpu galu pārošanā ņem to pilno garumu $x$ virzienā (taisnstūra griezums vienmēr der). Līdzīgi sapāro strēmeles. Atlikušos gabalus izgriež no atgriezumiem (_best fit_, ievērojot vajadzīgos profilus) vai no veseliem dēļiem. Rezultāts ir dēļu skaits $B$. Pāru skaits ir maksimāls, bet _best fit_ ir heiristika, tāpēc $B$ ir sasniedzams, taču ne vienmēr mazākais iespējamais pie dotā $phi$. Mērķa funkcija ir
$ f(phi) = B + lambda_V V + epsilon N, quad lambda_V = 2, quad epsilon = "0,2". $
$V$ mēra šuvju nobīdes pārkāpumus: $V = sum (D - |x - x'|) slash D$ pa visiem blakus rindu šuvju pāriem $(x, x')$ rindu kopīgās malas posmā, kuriem $|x - x'| < D$. Ja blakus segmentu $s$ un $t$ kopīgā mala ir garāka par $L + D$, $V = 0$ nozīmē, ka apļveida attālums starp $phi_s$ un $phi_t$ pēc moduļa $L$ ir vismaz $D$. Sods ļauj meklēšanai īslaicīgi iziet cauri nederīgiem risinājumiem. $N$ atšķir risinājumus ar vienādu $B$: ja ir nesapāroti beigu gabali $E'$ un sākuma gabali $S'$, tad $N = (min E' + min S' + k - L) slash L$, ierobežots intervālā $[0, 1]$, citādi $N = 0$. Jo mazāks $N$, jo tuvāk ir nākamais pāris. *Apakšējās robežas.* Laukuma robeža ir $"LB"_0 = ceil(A slash (L W))$. Stingrākā robeža $"LB"_1$ izmanto to, ka gabals, kas saskaras ar blakus rindu, dēlī atrodas fiksētā augstumā: tā garajai malai jābūt pie dēļa malas, un dēli nevar pagriezt. Ja $c(y_b)$ ir šādu gabalu kopējais garums dēļa augstumā $y_b$, tad katrā augstumā $c(y_b) <= B L$, tātad $"LB"_1 = ceil(max_(y_b in [0, W]) c(y_b) slash L)$. Ja $B = "LB" = max("LB"_0, "LB"_1)$, optimums ir pierādīts. $"LB"_1$ ir atkarīga no $y_0$, tāpēc "pierādīts" nozīmē "optimāls pie fiksētā $y_0$". Katru plānu no jauna pārbauda neatkarīgs validētājs.

*c) Gājieni.* M1 _Reset_: nejauša pieļaujama fāze vienam segmentam. M2 _Shift_: fāzes nobīde par nejaušu $delta in (-Delta, Delta)$, kur $Delta = max(20 "mm", L T slash (2 T_0))$, tātad nobīde samazinās līdz ar temperatūru. M3 _Swap_: divu segmentu fāžu apmaiņa. M4 _Pair_ (mērķtiecīgs): nejaušam nesapārotam beigu gabalam $e$ izvēlas segmentu (parasti tādu, kura sākuma gabals arī nav sapārots) un iestata tā sākuma gabalu tieši $s = L - k - e$, tātad pāris nedod atgriezumu; nesapārotam sākuma gabalam simetriski iestata beigu gabalu. Ja jaunā fāze pārkāpj $L_"min"$, mēģina citu segmentu (līdz 3 reizēm), pēc tam izpilda M2. Šuvju nobīdes pārkāpumus gājiens pieļauj, tos soda $V$. M5 _Block_: viena nobīde visiem segmentiem 2–6 secīgās rindās. Varbūtības M1–M5: 0,05 / 0,15 / 0,05 / 0,60 / 0,15.

*d) Simulētā rūdīšana.* Sākuma risinājums ir konstruktīvās metodes B-INST fāzes. Sākuma temperatūru kalibrē no 200 izmēģinājuma gājieniem: $T_0 = -"median"(Delta^+) slash ln p_0$, kur $Delta^+$ ir šo gājienu pozitīvās $f$ izmaiņas, un $p_0 = "0,3"$. Beigu temperatūra ir $T_"end" = 1 slash ln(1 slash p_"end")$ ar $p_"end" = 10^(-8)$, un dzesēšana ir ģeometriska: $T = T_0 (T_"end" slash T_0)^tau$, kur $tau$ ir iztērētā budžeta daļa. Gājienu pieņem pēc Metropolisa kritērija: ja $Delta <= 0$ vai $r < e^(-Delta slash T)$, kur $r$ ir nejaušs skaitlis no $[0, 1)$. Atsevišķi glabā labāko *derīgo* risinājumu ($V = 0$). Ja 0,5~% budžeta laikā tas nav uzlabojies, meklēšana turpinās no tā ar temperatūru $T_0 slash 2$, un atlikušajā budžetā temperatūra atkal ģeometriski samazinās līdz $T_"end"$. Ja $B = "LB"$, meklēšana apstājas (pierādīts optimums). Parametrus izvēlējos nelielā eksperimentā uz 9 telpām. Budžets ir novērtējumu skaits, lai rezultāti nebūtu atkarīgi no datora.

= Testēšana

*Testa piemēri* (27 telpas, `instances/`): taisnstūri R1–R4 (12–60 m²), L un U telpas L1–L3 un U1, telpas ar slīpām sienām (S1–S4), šķēršļiem (O1, O2) un lokiem (C1–C3). *Ģenerētās* telpas P1–P6 (14–61 m²) ir "kāpņu" telpas ar zināmu optimumu: katrai rindai $i$ nejauši izvēlas sākuma gabalu $s_i$ un veselu dēļu skaitu $m_i$, beigu gabals ir $e_i = L - k - s_(pi(i))$, kur $pi$ ir nejauša permutācija, un rindas garums ir $s_i + m_i L + e_i$. Tad katrs dēlis ir vai nu vesels, vai dod precīzu pāri, tāpēc $B^* = sum_i (m_i + 1) = "LB"_1$ un atgriezumu nav (paliek tikai zāģa griezumi). Mazās telpas T1–T4 (2–3 segmenti) ļauj veikt pilnu pārlasi uz fāžu režģa (solis 1~mm, T3 — 5~mm). Ja optimums nav zināms, salīdzinu ar *labāko zināmo* $B$, t.i., mazāko $B$, kas atrasts jebkurā skrējienā ar jebkuru metodi, arī 10 garos SA skrējienos (2~000~000 novērtējumu).

*Metodes.* B-NEXT: klasiskā klāšana (atgriezums sāk tikai nākamo rindu). B-INST: klājēja metode bez iepriekšējas griešanas. Rindas klāj pēc kārtas, sākuma gabalam ņem garāko derīgo atgriezumu no kaudzes, un atgriezumu var izmantot tikai vēlāk klātam gabalam. B-NEXT un B-INST ir deterministiskas (viens skrējiens). HC: kāpšana kalnā ar gājieniem M1–M2 (pieņem tikai $Delta <= 0$); pēc 2000 novērtējumiem bez uzlabojuma tā restartē no nejaušām fāzēm. SA: kā 2. nodaļā. SA-onsite: tas pats SA, bet $B$ skaita pēc B-INST noteikuma, t.i., bez iepriekšējas griešanas. *Protokols:* 20 sēklas uz telpu un metodi, 200~000 novērtējumu uz skrējienu; metodes salīdzina pēc $B$.

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
  placement: top,
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
  caption: [Rezultāti (dēļu skaits $B$). $B^*$: optimums (\* = pierādīts, $B^* = "LB"$) vai labākais zināmais. HC un SA: vidējais pa 20 sēklām; SA gap $= (overline(B)_"SA" - B^*) slash B^*$. Atgriezumi $= 1 - A slash (B L W)$. Laiks: viena SA skrējiena vidējais laiks, 8 skrējieniem darbojoties vienlaikus uz #env.cpu. Ja SA sasniedz $B = "LB"$, tā apstājas, tāpēc laiks var būt tuvs nullei. Telpās ar slīpām sienām un lokiem segmenti nav taisnstūri, un to novērtēšana ir lēnāka. Avots: `results/summary.csv`.],
)

*Ģenerētās telpas pieaugošā izmērā.* Grūtības sērijā ģenerēju tādas pašas kāpņu telpas ar 6–42 rindām (20 sēklas, 200~000 novērtējumu). Tās nav telpas P1–P6 (ģeneratora sēkla ir cita), tāpēc pie vienāda rindu skaita rezultāts var atšķirties no 1. tabulas (30 rindas: SA 18/20, P3: 20/20). SA optimumu atrod gandrīz vienmēr. HC to atrod tikai mazākajā telpā, citur paliek pie $B^* + 1$. Izņēmums ir 38 rindu telpa: SA 2/20, pārējie skrējieni beidzas ar $B^* + 1$; ar 2~000~000 novērtējumu tur ir 17/20.

#let dif = csv("/results/f6/difficulty.csv", row-type: dictionary)
#let found(n, m) = {
  let r = dif.find(r => r.n == n and r.method == m)
  r.found + "/" + r.runs
}
#figure(
  placement: top,
  table(
    columns: 10 + 1,
    align: (left,) + (right,) * 10,
    stroke: 0.4pt + luma(160),
    inset: (x: 4pt, y: 2.2pt),
    ..{
      let ns = dif.map(r => r.n).dedup()
      let cell(n, f) = f(dif.find(r => r.n == n))
      (
        ([*Rindas*],) + ns.map(n => [*#n*]),
        ([m²],) + ns.map(n => cell(n, r => num(r.areaM2))),
        ([$B^*$],) + ns.map(n => cell(n, r => r.optimum)),
        ([B-INST],) + ns.map(n => found(n, "b-inst")),
        ([HC],) + ns.map(n => found(n, "hc")),
        ([SA],) + ns.map(n => found(n, "sa")),
      ).flatten()
    },
  ),
  caption: [Cik skrējienu atrod zināmo optimumu $B^*$. B-INST ir deterministiska (viens skrējiens). Avots: `results/f6/difficulty.csv`.],
)

*Secinājumi.*
+ *Kvalitāte.* SA labākais rezultāts sakrīt ar optimumu vai labāko zināmo visās 27 telpās, un vidējā atšķirība ir ≤ 0,17~% visur, izņemot S2 (2,6~%, viena dēļa starpība). 12 telpās $B = "LB"$, tātad optimums ir pierādīts (T1, T2, T4, P1–P6, R1, L3, O2). Pilnā pārlase uz T1–T4 dod tos pašus rezultātus kā SA. T3 pārlase ar 5~mm soli dod $B = 7 > "LB" = 5$, tāpēc T3 optimums nav pierādīts. Ģenerētajās telpās SA atrod optimumu bez atgriezumiem (atgriezumi ≤ 0,2~%, tikai zāģa griezumi).
+ *Pret klasisko klāšanu.* 23 telpās (bez T1–T4) SA vidēji izmanto par 4,6~% mazāk dēļu nekā B-NEXT (līdz 9,3~%, R3) un par 2,2~% mazāk nekā B-INST (līdz 9,0~%, U1). Atgriezumi samazinās, piemēram, R2 no 11,7~% līdz 3,2~% un U1 no 14,6~% līdz 6,2~%.
+ *SA pret HC.* Ģenerētajās telpās atšķirība ir skaidra: SA atrod optimumu, HC nē. Pārējās 21 telpā metodes praktiski neatšķiras: vidējais $B$ sakrīt 17 telpās, SA ir labāka 2 telpās un HC — 2 telpās, un starpība nepārsniedz 0,15 dēļa.
+ *Iepriekšējas griešanas vērtība.* SA-onsite (bez iepriekšējas griešanas) nekad nav labāka par SA un 15 telpās ir sliktāka (līdz 1,95 dēļa, P4).
+ *Laiks* (viens pavediens, R1–R4): B-NEXT un B-INST 5–39 ms, HC 1,0–1,3 s, SA 2,2–2,9 s uz skrējienu (200~000 novērtējumu).

*Ierobežojumi.* 15 telpās labākais zināmais nav pierādīts optimums, un arī tas ir SA rezultāts. LB nav cieša (R4: LB = 249, labākais zināmais 256; T3: LB = 5, pārlase 7), un tā attiecas uz fiksētu $y_0$. HC izmanto tikai M1–M2, tāpēc SA pārākumu ģenerētajās telpās var radīt arī mērķtiecīgais gājiens M4, ne tikai rūdīšana; ablācija (HC ar M1–M5, SA bez M4) nav veikta. Parametri izvēlēti uz daļas telpu, tāpēc pastāv pārmērīgas pielāgošanas risks. Ģenerētās telpas ir gandrīz taisnstūra formas.

= Saite uz repozitoriju

Kods, testa piemēri, rezultāti un atskaite: #link("https://github.com/WilsonDaCrab/laminate-planner")[https://github.com/WilsonDaCrab/laminate-planner]. Kods ir rakstīts TypeScript valodā; optimizācijas kodols ir `packages/core`, eksperimenti — `packages/bench`. Rezultātus atkārto #box[`pnpm bench all --jobs auto`]. Izstrādē kā palīgrīks izmantots AI asistents Claude Code.
