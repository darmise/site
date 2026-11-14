# Blog Football Tricarico

Sito statico (HTML/CSS/JS) pensato per GitHub Pages.

## Risultati automatici

Uno script Python (`scripts/update_matches.py`) legge i risultati da Tuttocampo e riscrive
`data/matches.json` e `data/live.json`. **Non modificare a mano questi due file**: vengono sovrascritti
(per le correzioni a mano usa `data/manual.json`).

**Lettura con `requests` (predefinita, nessun browser).** Per ogni giornata n = 1 ... 22:
1. `GET .../Giornata<n>`: se la tabella è già nell'HTML la legge subito;
2. altrimenti fa la seconda chiamata che carica i risultati (la pagina la fa con JavaScript), usando
   `tuttocampo.resultsUrl` di `data/config.json` (vedi sotto);
3. cerca la partita della squadra (`teamName`) e salva giornata, data/ora, squadre, risultato, stato e
   **indirizzi dei logo** (non scarica nulla).

Se il sito risponde 401/403/429 lo script si ferma subito, senza insistere. Se una giornata non si legge,
quella già salvata resta com'era e la risposta ricevuta finisce in `debug/` (su GitHub: artefatto "debug-pagine").
L'alternativa con il browser è `--mode browser` (richiede `pip install playwright` e `playwright install chromium`).

### Indirizzo dei risultati (`tuttocampo.resultsUrl`)
La pagina di una giornata arriva con il blocco dei risultati vuoto: i dati vengono chiesti con una seconda
chiamata. Serve l'indirizzo di quella chiamata. Se hai già uno script `requests` che funziona, è quello. Altrimenti:
Chrome → F12 → scheda *Network* → filtro *Fetch/XHR* → ricarica la pagina di una giornata → clicca la richiesta la
cui risposta contiene le partite → copia l'indirizzo. Sostituisci i valori con i segnaposto:
`{round}` (numero giornata), `{tckk}`, `{roundID}`, `{regionID}` (questi tre li legge lo script dalla pagina).
Un indirizzo relativo (es. `Ajax/NomeRichiesta?...`) si risolve a partire dalla pagina della giornata.
Se la richiesta è POST: `"resultsMethod": "POST"` e i parametri in `"resultsData"`.
```json
"tuttocampo": { "resultsUrl": "Ajax/...?giornata={round}&tckk={tckk}", "resultsMethod": "GET", "resultsData": {} }
```

### Esecuzione su GitHub Actions
`.github/workflows/update-data.yml` gira sul runner **self-hosted Windows**: parte ogni 10 minuti, ma si ferma
subito se non c'è una partita tra 30 minuti prima e 4 ore dopo l'inizio; una volta al giorno aggiorna comunque.
Servono *Settings → Actions → General → Workflow permissions → Read and write permissions*.

Per provare **senza** il tuo computer: *Actions → "Prova lettura da GitHub" → Run workflow*
(`.github/workflows/test-github-hosted.yml`). Gira su `ubuntu-latest`, legge le giornate 1-2 e mostra il risultato nel
log, senza salvare nulla. Se Tuttocampo risponde 403 ai server di GitHub lo vedi subito (lo script si ferma alla prima giornata).

### Prove in locale
```
pip install -r scripts/requirements.txt
python scripts/update_matches.py --rounds 1-3                                  # legge solo alcune giornate
python scripts/update_matches.py --from-file tests/giornata1.html --round 1   # prova sul file salvato
python -m http.server                                                          # poi apri http://localhost:8000
```

## Come la home sceglie le partite da mostrare
Il contatore è la prima giornata ancora da giocare (o in corso):
- se manca **meno di 2 giorni** all'inizio (o la partita è in corso) diventa la **partita attuale**, in alto
  (con countdown, oppure punteggio se è in corso), e in "Prossima gara" va la giornata successiva;
- altrimenti in alto resta l'**ultimo risultato** e in "Prossima gara" va la giornata del contatore;
- a partita finita la giornata passa a "ultimo risultato" e il contatore avanza da solo.

`data/manual.json` (facoltativo) permette di scrivere o correggere partite a mano, per esempio se Tuttocampo non
si riesce a leggere: ogni voce sovrascrive quella automatica con lo stesso `id` (`g2` = giornata 2). Esempio:
```json
[ { "id": "g2", "round": 2, "date": "2026-11-14T19:00", "timeKnown": true, "competition": "Serie D Calcio a 5",
    "home": "Football Tricarico", "away": "Boys Valleverde Academy", "status": "scheduled" } ]
```
(`status`: `scheduled`, `live` o `played`; per le partite giocate aggiungi `homeScore` e `awayScore`; i logo si
indicano con `homeLogo` e `awayLogo`.)

## Pagelle (archivio delle 22 giornate)
La pagina `pagelle.html` mostra le giornate in alto (verde/giallo/rosso = vittoria/pareggio/sconfitta, puntino blu = pagelle disponibili) e sotto la giornata scelta. Il pulsante "Leggi le pagelle" della home porta direttamente alla giornata dell'ultimo risultato (`pagelle.html#g5` = quinta giornata).
Le pagelle si scrivono a mano in `data/pagelle.json`, agganciate all'id della partita (`g1`, `g2`… = numero di giornata). Un esempio completo è in `data/pagelle.esempio.json`:
```json
{
  "g1": {
    "title": "Titolo del resoconto",
    "report": "Testo breve della partita.",
    "pagelle": [
      { "playerId": "p10", "vote": 8, "label": "Devastante", "goals": 2, "tunnels": 0, "comment": "Commento scherzoso." }
    ]
  }
}
```
- `vote`: voto finale (anche con decimali, es. 6.5); `label`: l'aggettivo della prestazione; `goals` e `tunnels`: gol fatti e tunnel subiti **in quella partita**; `comment`: la battuta.
- Le pagelle compaiono ordinate dal voto più alto; il migliore ha la stella. Chi non è in lista non ha giocato.
- I campi `goals`, `tunnels` e `vote` alimentano anche l'aggiornamento automatico dei cammelli (vedi sezione sopra).
- Per vedere le pagelle d'esempio copia il contenuto di `pagelle.esempio.json` in `pagelle.json` (ma i valori dei giocatori cambierebbero davvero).

## Valore dei giocatori e bestemmie dello staff (automatico)
Dopo ogni giornata il sito stesso (`js/rosa.js`) ricalcola i valori e mostra una freccia verde ▲ (aumento) o rossa ▼ (calo) accanto al numero, sul retro della scheda.
- **Giocatori** (serve la pagella della giornata in `data/pagelle.json`): cammelli = `(voto - 6) × 4`, più 2 per ogni gol e meno 1 per ogni tunnel subito. Nella pagella puoi aggiungere i campi facoltativi `goals` e `tunnels` della partita, che vengono sommati ai totali:
  `{ "playerId": "p10", "vote": 8, "goals": 2, "tunnels": 0, "comment": "..." }`. Chi non ha la pagella non cambia (e non ha freccia).
- **Portieri**: cammelli = `(voto - 6) × 4`, più 1 ogni 3 parate, meno 1 per ogni gol subito, più 3 se la porta è rimasta inviolata. Nella pagella usa `"saves"` (parate) e `"conceded"` (gol subiti mentre era in porta): `{ "playerId": "p1", "vote": 6.5, "saves": 14, "conceded": 3 }`.
- **Staff** (basta il risultato): le bestemmie salgono solo con pareggi e sconfitte e non scendono mai: base vittoria 0, pareggio +2, sconfitta +6, moltiplicata per il ruolo: **Allenatore ×2** (0 / +4 / +12), **Vice allenatore ×1,5**, tutti gli altri ×1. Su una scheda dello staff puoi forzare il peso con il campo facoltativo `peso`.
- `data/players.json` e `data/staff.json` contengono i valori **iniziali** e non vengono più riscritti da nessun lavoro automatico. Il sito parte da lì e applica, in ordine, le partite giocate (`data/matches.json`) e le pagelle pubblicate (`data/pagelle.json`): appena una di queste cambia, Rosa mostra i valori nuovi e le frecce. Non c'è più niente da lanciare. Il file `data/values.json` e il workflow "Aggiorna valori da pagelle" non servono più (puoi cancellarli).
- I valori nei file sono il punto di partenza: scrivi quelli veri prima della prima giornata. Per i numeri delle regole modifica le costanti in cima allo script.

## Fonte dei dati
Risultati: Tuttocampo.it (il sito lo cita in basso). Verifica le condizioni d'uso del servizio.

## Utenti online e visite del mese (footer)
Nel footer compare una riga piccola: "N utenti online · N visite questo mese". Serve un database gratuito di Firebase
(un sito statico da solo non può contare chi è collegato). Nessun cookie e nessun dato personale: per ogni scheda del browser
si salva solo un codice casuale e l'orario dell'ultimo segnale; si è "online" se il segnale è di meno di 75 secondi fa.
Una visita si conta una volta per sessione del browser.

1. Su console.firebase.google.com crea un progetto (Analytics non serve) → *Build → Realtime Database → Create database*.
2. Scheda *Rules*: incolla il contenuto di `firebase-rules.json` e pubblica.
3. Copia l'indirizzo del database (es. `https://nome-default-rtdb.europe-west1.firebasedatabase.app`) e in `data/config.json` aggiungi:
```json
"analytics": { "counters": { "databaseURL": "https://nome-default-rtdb.europe-west1.firebasedatabase.app" } }
```
Se il campo manca la riga non compare. Da `localhost` i contatori non partono.

## Rosa (`data/players.json` e `data/staff.json`)
Davanti a ogni scheda si vedono solo numero di maglia (sullo sfondo), ruolo, nome e cognome. Toccando la scheda si gira e compaiono le statistiche.
**Giocatori** (`data/players.json`). Campi: `id`, `number`, `name` ("Nome Cognome"), `role`, `birth`, `nat`, più:
- `camels`: valore del giocatore, in cammelli 🐪
- giocatori di movimento: `tunnels` (tunnel subiti 🕳️) e `goals` (gol fatti ⚽)
- portieri: `saves` (parate 🧤) e `conceded` (gol subiti 🥅) al posto di tunnel e gol
- facoltativi: `photo`, `status` (`ok`, `injured`, `suspended`, `doubt`) e `statusNote`.
- `role`: `POR`, `CEN`, `LAT`, `PIV`, `UNI` (va bene anche per esteso: Portiere, Centrale...).
- Foto: la strada più semplice è salvare il file `assets/giocatori/<id>.png` oppure `.jpg` (es. `assets/giocatori/p10.png`; per lo staff `assets/staff/s1.png`). Un PNG con sfondo trasparente (giocatore ritagliato) è il più bello: dietro resta visibile il numero di maglia: compare da sola. Chi non ha il file resta con la mascotte, scheda per scheda. In alternativa, `photo` con un percorso qualsiasi.
- `photo`: per esempio `"assets/giocatori/serra.jpg"`. Meglio verticale (4:5), soggetto in alto. Se manca compare la mascotte.
**Staff** (`data/staff.json`). Campi: `id`, `name`, `role` (es. "Allenatore") e `bestemmie` (solo un numero, il contatore 🤬). Sulla scheda al posto del numero di maglia compare "STAFF". Facoltativo: `photo`.
La pagina si apre su "Tutta la squadra"; `rosa.html#pivot` o `rosa.html#staff` aprono direttamente una sezione.

## Pagelle dal foglio Google (modo consigliato)
Inserisci voti, commenti e titolo in un foglio Google condiviso: il sito si aggiorna da solo.
**Come funziona, partita dopo partita**
1. Aggiorni i risultati ("Aggiorna risultati"). Il sistema ricalcola anche `data/foglio-rosa.csv` (id di giocatori e staff) e `data/foglio-partite.csv` (partite).
2. Il foglio, con il suo script (`foglio/Sincronizza.gs`), legge questi due file dal sito: ogni ora, o subito dal menu **Pagelle > Aggiorna dal sito**.
3. Quando una partita risulta giocata compaiono nella scheda **Pagelle** le righe di quella giornata, una per ogni id (giocatori e staff) con nome e ruolo già scritti. Nella scheda **Giornate** compare la riga della partita, anche la prossima con data e ora. Le giornate da giocare non hanno righe di pagelle.
4. Tu scegli chi ha giocato scrivendo il Voto; chi resta vuoto non ha giocato. Le pagelle si basano solo sull'id: il sito ricava da lì nome, ruolo e numero. Lo staff può avere voto, aggettivo e commento (niente statistiche).
5. Scrivi Titolo e Commento partita nella scheda Giornate e metti **Pubblica = SI**. Entro 30 minuti (o subito con Actions > "Pagelle dal foglio Google" > Run workflow) il sito si aggiorna e si ricalcolano cammelli e bestemmie.
**Preparazione (una volta sola)**
1. Crea il file del foglio: `python scripts/build_sheet_template.py` (serve `pip install openpyxl`, genera `pagelle-foglio.xlsx`). Caricalo su Google Drive, aprilo con Fogli Google e fai **File > Salva come Fogli Google**.
2. Nel foglio: **Estensioni > Apps Script**. Cancella il codice, incolla `foglio/Sincronizza.gs`, modifica in cima `SITO` con l'indirizzo del tuo sito (senza `/` finale) e salva. Ricarica il foglio: compare il menu **Pagelle**. Premi **Pagelle > Aggiorna dal sito** (la prima volta Google chiede i permessi: Avanzate > Vai a... > Consenti), poi **Pagelle > Attiva aggiornamento automatico**.
3. Nel foglio: File > Condividi > Pubblica sul web. Scegli la scheda **Giornate** e il formato **CSV**, pubblica e copia l'indirizzo. Ripeti per **Pagelle**.
4. Su GitHub: Settings > Secrets and variables > Actions > scheda **Variables** > New repository variable: `SHEET_GIORNATE_URL` e `SHEET_PAGELLE_URL` con i due indirizzi. In Settings > Actions > General > Workflow permissions attiva "Read and write permissions".
5. Carica nel repository: `scripts/import_sheet.py`, `scripts/export_sheet_data.py`, `.github/workflows/sheet-pagelle.yml`, `.github/workflows/update-data.yml` e i due file `data/foglio-rosa.csv` e `data/foglio-partite.csv`.
Se cambia la rosa (nuovo giocatore o staff) basta aggiornare i JSON: le righe mancanti compaiono nelle giornate già giocate alla sincronizzazione successiva.
**Errori:** se nel foglio c'è un voto fuori da 1-10, un numero non valido o un id ripetuto, il lavoro in Actions diventa rosso e dice scheda e riga da correggere; finché c'è un errore non viene importato niente. Dopo la pubblicazione i cammelli di quella giornata non si ricalcolano.

## Bot Telegram per le pagelle (alternativa, non necessario con il foglio)
Il bot (`bot/telegram_bot.py`) ti guida a inserire le pagelle dal telefono e le salva in `data/pagelle.json` con un commit; il commit fa partire da solo il calcolo dei valori.
**Come si usa:** `/pagelle` (o `/pagelle 5`) → tocchi chi ha giocato → per ognuno scegli il voto con i bottoni, poi l'aggettivo suggerito, poi scrivi `g2 t1 commento` (per i portieri `p14 s3 commento`). Scorciatoia: una riga sola, `7.5 Brillante g2 t0 - Corre per due`. Finiti i giocatori, il bot ti chiede il **commento della partita** e un titolo (si possono saltare), poi riepilogo e «Pubblica». Dal riepilogo puoi correggerli con `/resoconto testo` e `/titolo testo`. Altri comandi: `/stato` (giornate con o senza pagelle), `/indietro`, `/annulla`.
**Su Render (gratis, senza computer acceso):** `bot/render_server.py`, istruzioni in `bot/RENDER.md`.
**Su Google Apps Script (gratis, tutto nel tuo account Google):** `bot/appsscript/Code.gs`, istruzioni in `bot/appsscript/LEGGIMI.md`.
**Su Cloudflare:** `bot/cloudflare/worker.js` fa la stessa cosa su Cloudflare Workers, gratis e senza computer acceso. Istruzioni passo passo in `bot/cloudflare/LEGGIMI.md`. La versione Python qui sotto gira solo mentre il computer è acceso.
**Configurazione della versione Python (una tantum)**
1. Su Telegram scrivi a **@BotFather**, `/newbot`, scegli nome e username: ti dà il *token*.
2. Su GitHub: Settings > Developer settings > Fine-grained tokens > nuovo token, solo sul repository del sito, permesso **Contents: Read and write**.
3. Copia `bot/.env.esempio` in `bot/.env` e compila token, repository e token GitHub. In `TELEGRAM_ALLOWED_IDS` metti il tuo id Telegram: scrivi al bot e ti risponde con il numero.
4. Avvio: `python bot/telegram_bot.py` (su Windows doppio clic su `bot/avvia-bot.bat`). Il bot risponde finché il programma resta acceso, quindi va bene il computer del runner. Non servono librerie da installare.
Solo gli id elencati possono usarlo. `bot/.env` non va mai caricato su GitHub (è già nel `.gitignore`).
Per provarlo senza toccare il sito: `python bot/telegram_bot.py --local data` salva soltanto in locale.
