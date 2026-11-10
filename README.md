# Blog Football Tricarico

Sito statico (HTML/CSS/JS) pensato per GitHub Pages.

## Risultati automatici

I risultati vengono letti da Tuttocampo (girone Serie D Calcio a 5 Potenza) da uno script che gira su
GitHub Actions e riscrive `data/matches.json` e `data/live.json`. **Non modificare a mano questi due file**:
vengono sovrascritti.

Come funziona `scripts/update_matches.py`:
- un contatore va da 1 a 22 (`totalRounds` in `data/config.json`) e apre `.../Giornata<n>` con un browser
  automatico, perché le tabelle di Tuttocampo si caricano con JavaScript;
- per ogni giornata cerca la partita della squadra indicata in `config.json` → `teamName` e salva giornata,
  data/ora, squadre, risultato (se già giocata), stato e **indirizzi dei logo** (non scarica nulla);
- sul sito la "Prossima gara" è la prima giornata ancora da giocare, l'ultimo risultato è l'ultima giocata;
- stati: `scheduled` (da giocare), `live` (in corso), `played` (terminata), `postponed` (rinviata);
- se una giornata non si riesce a leggere, quella già salvata resta com'era e la pagina viene salvata in
  `debug/` (su GitHub la trovi come "debug-pagine" in fondo alla pagina dell'esecuzione).

`.github/workflows/update-data.yml` lo lancia ogni 10 minuti, ma si ferma subito se non c'è una partita tra
30 minuti prima e 4 ore dopo l'orario d'inizio. Una volta al giorno aggiorna comunque.

### Attivazione (una volta sola)
1. Carica **tutto** il contenuto della cartella in un repository GitHub, compresa la cartella nascosta `.github`.
2. *Settings → Pages*: sorgente "Deploy from a branch", branch `main`, cartella `/ (root)`.
3. *Settings → Actions → General → Workflow permissions*: scegli **Read and write permissions**.
4. Tab *Actions* → "Aggiorna risultati" → *Run workflow*: legge tutte le 22 giornate (circa 1-2 minuti).

### Prove in locale
```
pip install -r scripts/requirements.txt && playwright install chromium
python scripts/update_matches.py --from-file tests/giornata1.html --round 1   # prova sul file salvato
python scripts/update_matches.py --rounds 1-3                                  # legge solo alcune giornate
python -m http.server                                                          # poi apri http://localhost:8000
```

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

## Fonte dei dati
Risultati: Tuttocampo.it (il sito lo cita in basso). Verifica le condizioni d'uso del servizio.
