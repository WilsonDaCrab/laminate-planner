# Darba gaita VS Code (cilvēkam)

Šis fails ir tev, nevis Claude. Tas apraksta, kā strādāt ar Claude Code VS Code, lai rezultāts būtu precīzs un tokeni netērētos velti.

## 1. Vienreizēja sagatavošana

1. Uzstādi **Node.js** (aktuālā LTS), **git** un **VS Code** (≥ 1.94).
2. Uzstādi pnpm un TypeScript valodas serveri:
   ```bash
   npm install -g pnpm typescript-language-server typescript
   ```
3. VS Code uzstādi paplašinājumu **Claude Code** (Anthropic). Pārējos (ESLint, Prettier, Vitest) VS Code ieteiks pats, kad atvērsi projektu.
4. Izveido GitHub repozitoriju. Sākumā tas var būt privāts; kursa nodošanai tam jābūt pieejamam pasniedzējam.

## 2. Projekta izveide

1. Izveido mapi `laminate-planner` un izpako arhīvu tā, lai `CLAUDE.md` būtu mapes saknē. Pārbaudi, ka ir arī slēptās mapes `.claude` un `.vscode` (macOS Finder slēptos failus parāda ar `Cmd+Shift+.`).
2. Terminālī šajā mapē:
   ```bash
   git init
   git add .
   git commit -m "docs: project context for Claude Code"
   ```
   Git vajag ne tikai GitHub dēļ: Stop hook pēc tā nosaka, vai kods ir mainīts.
3. VS Code: **File → Open Folder** → `laminate-planner`. Ja jautā, vai uzticies mapes autoriem, apstiprini. Uzstādi ieteiktos paplašinājumus.

## 3. Pirmā Claude Code palaišana

1. Atver jebkuru failu (piem., `CLAUDE.md`) un noklikšķini uz **Spark** ikonas redaktora augšējā labajā stūrī (vai uz Spark ikonas kreisajā Activity Bar). Pieslēdzies ar Claude kontu.
2. **Spraudnis:** prompta lodziņā ieraksti `/plugins` → **Manage plugins** → meklē `typescript-lsp` → **Install** → **Install for you**. Ja saraksts ir tukšs, cilnē **Marketplaces** pievieno `anthropics/claude-plugins-official`.
3. **Pārbaudi konfigurāciju:**
   - ieraksti `/` → sadaļā **Customize** izvēlies **Hooks** — tur jābūt `Stop` hook;
   - pajautā Claude: *"Kādi projekta aģenti ir pieejami?"* — jānosauc `test-runner` un `reviewer`.
4. **Modelis:** poga ar modeļa nosaukumu prompta lodziņa apakšā. Projekts pēc noklusējuma izmanto Sonnet (`.claude/settings.json`).

## 4. Katras fāzes cikls

1. **Jauna saruna** — jauna cilne vai `/clear`. Nekas nepazūd: konteksts ir `CLAUDE.md`, `docs/` un git vēsturē.
2. **Plānošanas režīms** — noklikšķini uz režīma indikatora prompta apakšā → **Plan** (vai ieraksti `/plan`).
3. **Prompts:** *"Sāc F0 fāzi no @docs/ROADMAP.md. Vispirms izveido plānu: faili, publiskie tipi, testi."*
4. VS Code atver plānu kā Markdown dokumentu. Izlasi, pievieno komentārus, apstiprini.
5. Pārslēdz režīmu uz **Auto** vai **Edit automatically**. Claude raksta kodu. Stop hook pirms katras atbildes beigām pārbauda typecheck, lint un testus.
6. **Fāzes beigās:** *"Palaid reviewer fāzei F0. Izlabo KRITISKOS un SVARĪGOS atradumus, palaid test-runner, atzīmē ROADMAP un izveido commit."*
7. **Pārbaudi pats:** izmēģini komandas, apskati rezultātus (no F4 — SVG plānus), izlasi `git log`.
8. `/clear` → nākamā fāze.

### Modelis pa fāzēm

| Fāze | Plānošana | Kodēšana |
|---|---|---|
| F0–F2, F4 | Sonnet | Sonnet |
| F3 (dekoders), F5 (SA) | Opus | Sonnet; grūtās vietās Opus |
| F6 (eksperimenti, atskaite) | Sonnet | Sonnet |
| F7–F12 (lietotne) | Sonnet | Sonnet |

Vienkāršiem darbiem (pārdēvēšana, formatēšana, dokumentu labojumi) samazini **Effort** tajā pašā modeļa izvēlnē.

## 5. Gatavi prompti

| Situācija | Prompts |
|---|---|
| Fāzes sākums | *Sāc F{n} fāzi. Izlasi tās uzdevumus un kritērijus @docs/ROADMAP.md un tikai vajadzīgās docs/ sadaļas. Izveido plānu: faili, publiskie tipi, testi.* |
| Kļūda | *Tests {nosaukums} krīt. Palaid to caur test-runner, atrodi cēloni un izlabo. Nemaini gaidītās vērtības.* |
| Fāzes beigas | *Palaid reviewer fāzei F{n}. Izlabo KRITISKOS un SVARĪGOS atradumus, palaid test-runner, atzīmē ROADMAP, commit.* |
| Pēc pārtraukuma | *Kur mēs palikām? Apskati docs/ROADMAP.md un git log un pasaki nākamo soli.* |
| Dziļa pārbaude (reti, F3 un F5 beigās) | *ultracode: pārbaudi visu packages/core pret CLAUDE.md stingrajiem noteikumiem un docs/ALGORITHM.md formulām; katru atradumu neatkarīgi pārbaudi.* |

Pēdējais prompts palaiž dinamisko darbplūsmu (daudz aģentu). Tā ir dārga; projektā izmērs ir ierobežots līdz "small". Pro plānā darbplūsmas vispirms jāieslēdz ar `/config`.

## 6. Ikdienas paradumi, kas taupa tokenus

- **Viena fāze = viena saruna.** Gara saruna katrā ziņā sūta visu vēsturi vēlreiz.
- **Aptur uzreiz:** ja Claude iet nepareizā virzienā, spied `Esc`. Uzvirzi peli uz ziņas un izvēlies **Rewind code to here**, lai atgrieztos.
- **Norādi precīzi:** `@fails` vai `@docs/ALGORITHM.md` ļauj Claude nemeklēt.
- **Skaties, kur aiziet tokeni:** `/usage` (vai **Account & usage** dialogs). Aģentu skaits prompta apakšā (piem., **2 agents**) atver aģentu karti ar katra aģenta tokeniem.
- **Pēc ilgāka pārtraukuma** (vairāk par stundu) sāc jaunu sarunu: kešs ir beidzies, un turpināšana vecajā maksā vairāk.

## 7. Ja kaut kas neiet

- **Stop hook ziņo, ka `pnpm` nav atrasts:** aizver VS Code un atver to no termināļa ar `code .`, lai tas redzētu to pašu PATH.
- **Stop hook traucē** (piem., apzināti strādā ar salauztiem testiem): izveido `.claude/settings.local.json` ar `{ "disableAllHooks": true }` un pēc tam to izdzēs. Hook pats atlaiž bloķēšanu pēc 3 neveiksmīgiem mēģinājumiem pēc kārtas.
- **Claude neredz tipu kļūdas:** pārbaudi, vai `typescript-language-server` ir PATH (`which typescript-language-server` vai `Get-Command typescript-language-server`) un vai `typescript-lsp` spraudnis ir ieslēgts.
- **Claude grib instalēt pakotni:** tas vienmēr jautās tev (atļauju noteikumi `.claude/settings.json`). Pārbaudi, vai tā nav aizliegta optimizācijas bibliotēka (`CLAUDE.md`, 1. noteikums).
