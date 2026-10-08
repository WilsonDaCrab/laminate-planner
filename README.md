# Lamināta plānotājs

Tīmekļa lietotne (PWA), kas pēc telpas zīmējuma aprēķina optimālu lamināta izkārtojumu, materiāla daudzumu un **griešanas plānu**, lai visus dēļus var sagriezt pirms ieklāšanas.

Optimizācijas kodols: simulētā rūdīšana (SA) pār rindu šuvju fāzēm ar dekoderu, kas atgriezumus pāro starp jebkurām rindām; kvalitāti novērtē pret pierādāmu apakšējo robežu.

> Izstrādāts kā praktiskais darbs LU kursā "Praktiskā kombinatoriālā optimizācija".

## Kursa darbs

- Atskaite: [`report/main.pdf`](report/main.pdf) (avots `report/main.typ`).
- Optimizācijas kodols (SA, gājieni, dekoders, apakšējās robežas): `packages/core/src` (`optimize/`, `plan/`, `evaluate/`, `bounds/`).
- Testa piemēri: `instances/` (27 telpas); rezultāti: `results/summary_bonly.csv`, `results/summary.csv`, `results/f6/difficulty.csv`.
- Viens skrējiens: `pnpm bench run instances/rect/R2.json --method sa --seed 1 --iters 200000 --svg`
- Visi eksperimenti: `pnpm bench all --jobs auto` (~1,5 h uz 8 pavedieniem).

## Statuss

Skatīt [docs/ROADMAP.md](docs/ROADMAP.md).

## Struktūra

| Mape | Saturs |
|---|---|
| `packages/core` | kodols: ģeometrija, modelis, dekoders, SA, robežas, validētājs |
| `packages/bench` | CLI eksperimentiem un instanču ģenerēšanai |
| `apps/web` | lietotne (PWA) |
| `instances/` | testa telpas |
| `results/` | eksperimentu rezultāti |
| `report/` | kursa atskaite |
| `docs/` | domēns, algoritms, UI, plāns, lēmumi |

## Palaišana

Vajag Node ≥ 22 un pnpm.

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm dev        # web lietotne (apps/web)
```

## Licence

[MIT](LICENSE)
