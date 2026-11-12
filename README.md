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

## Pagelle e articoli (a mano)
Vanno in `data/pagelle.json`, agganciati all'id della partita (`g1`, `g2`… = numero di giornata):
```json
{
  "g1": {
    "title": "Titolo del resoconto",
    "report": "Testo breve della partita.",
    "pagelle": [ { "playerId": "p1", "vote": 6.5, "comment": "Commento" } ]
  }
}
```

## Valore dei giocatori e bestemmie dello staff (automatico)
Dopo ogni giornata `scripts/update_values.py` aggiorna i valori e il sito mostra una freccia verde ▲ (aumento) o rossa ▼ (calo) accanto al numero, sul retro della scheda.
- **Giocatori** (serve la pagella della giornata in `data/pagelle.json`): cammelli = `(voto - 6) × 4`, più 2 per ogni gol e meno 1 per ogni tunnel subito. Nella pagella puoi aggiungere i campi facoltativi `goals` e `tunnels` della partita, che vengono sommati ai totali:
  `{ "playerId": "p10", "vote": 8, "goals": 2, "tunnels": 0, "comment": "..." }`. Chi non ha la pagella non cambia (e non ha freccia).
- **Staff** (basta il risultato): vittoria −3 bestemmie, pareggio +2, sconfitta +6.
- Ogni giornata viene applicata una sola volta (lo stato è in `data/values.json`). Parte da sola dopo "Aggiorna risultati" e quando salvi `data/pagelle.json` (workflow "Aggiorna valori da pagelle"); a mano: `python scripts/update_values.py`.
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
- `tunnels`: tunnel subiti 🕳️
- `goals`: gol fatti ⚽
- facoltativi: `photo`, `status` (`ok`, `injured`, `suspended`, `doubt`) e `statusNote`.
- `role`: `POR`, `CEN`, `LAT`, `PIV`, `UNI` (va bene anche per esteso: Portiere, Centrale...).
- `photo`: per esempio `"assets/giocatori/serra.jpg"`. Meglio verticale (4:5), soggetto in alto. Se manca compare la mascotte.
**Staff** (`data/staff.json`). Campi: `id`, `name`, `role` (es. "Allenatore") e `bestemmie` (solo un numero, il contatore 🤬). Sulla scheda al posto del numero di maglia compare "STAFF". Facoltativo: `photo`.
La pagina si apre su "Tutta la squadra"; `rosa.html#pivot` o `rosa.html#staff` aprono direttamente una sezione.
