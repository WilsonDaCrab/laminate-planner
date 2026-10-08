# Lamināta plānotājs

Kursa darba kods: pēc telpas zīmējuma (daudzstūris ar šķēršļiem) aprēķina lamināta izkārtojumu ar minimālu dēļu skaitu un **griešanas plānu**, lai visus dēļus var sagriezt pirms ieklāšanas.

Optimizācijas kodols: simulētā rūdīšana (SA) pār rindu šuvju fāzēm ar dekoderu, kas atgriezumus pāro starp jebkurām rindām; kvalitāti novērtē pret pierādāmu apakšējo robežu un zināmiem optimumiem.

> Izstrādāts kā praktiskais darbs LU kursā "Praktiskā kombinatoriālā optimizācija". Repozitorijs ir tikai kursa darbs; lietotne ir atsevišķā projektā.

## Kursa darbs

- Optimizācijas kodols (SA, gājieni, dekoders, apakšējās robežas): `packages/core/src` (`optimize/`, `plan/`, `evaluate/`, `bounds/`).
- Testa piemēri: `instances/` (27 telpas); rezultāti: `results/summary.csv`, `results/f6/difficulty.csv`.
- Viens skrējiens: `pnpm bench run instances/rect/R2.json --method sa --seed 1 --iters 200000 --svg`
- Visi eksperimenti: `pnpm bench all --jobs auto` (~10–20 min uz 8 pavedieniem).

## Statuss

Projekts ir noslēgts kā kursa darbs.

## Struktūra

| Mape | Saturs |
|---|---|
| `packages/core` | kodols: ģeometrija, modelis, dekoders, SA, robežas, validētājs |
| `packages/bench` | CLI eksperimentiem un instanču ģenerēšanai |
| `instances/` | testa telpas |
| `results/` | eksperimentu rezultāti |

## Palaišana

Vajag Node ≥ 22 un pnpm.

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
```

## Licence

[MIT](LICENSE)
