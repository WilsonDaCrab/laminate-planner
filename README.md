# Lamināta plānotājs

Tīmekļa lietotne (PWA), kas pēc telpas zīmējuma aprēķina optimālu lamināta izkārtojumu, materiāla daudzumu un **griešanas plānu**, lai visus dēļus var sagriezt pirms ieklāšanas.

Optimizācijas kodols: simulētā rūdīšana (SA) pār rindu šuvju fāzēm ar dekoderu, kas atgriezumus pāro starp jebkurām rindām; kvalitāti novērtē pret pierādāmu apakšējo robežu.

> Izstrādāts kā praktiskais darbs LU kursā "Praktiskā kombinatoriālā optimizācija".

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

```bash
pnpm install
pnpm test
pnpm dev
```
