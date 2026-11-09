# Blog Football Tricarico

Sito statico (HTML/CSS/JS) pensato per GitHub Pages.

## Risultati automatici

I risultati vengono letti da Tuttocampo (girone Serie D Calcio a 5 Potenza) da uno script che gira su
GitHub Actions e riscrive `data/matches.json` e `data/live.json`. **Non modificare a mano questi due file**:
vengono sovrascritti.

- `scripts/update_matches.py` – legge le giornate con un browser automatico (le pagine di Tuttocampo
  caricano i risultati con JavaScript) e salva solo le partite della squadra indicata in `data/config.json` → `teamName`.
- `.github/workflows/update-data.yml` – lo lancia ogni 10 minuti, ma lo script si ferma subito se non c'è una
  partita tra 30 minuti prima e 4 ore dopo l'orario d'inizio. Una volta al giorno rilegge tutte le giornate.
- Stati: `scheduled` (da giocare), `live` (in corso), `played` (terminata), `postponed` (rinviata).

### Attivazione (una volta sola)
1. Carica **tutto** il contenuto della cartella in un repository GitHub, compresa la cartella nascosta `.github`.
2. *Settings → Pages*: sorgente "Deploy from a branch", branch `main`, cartella `/ (root)`.
3. *Settings → Actions → General → Workflow permissions*: scegli **Read and write permissions**.
4. Tab *Actions* → "Aggiorna risultati" → *Run workflow*: il primo avvio legge tutte le 22 giornate.

### Prove in locale
```
pip install -r scripts/requirements.txt && playwright install chromium
python scripts/update_matches.py --from-file tests/giornata1.html --round 1   # prova sul file salvato
python scripts/update_matches.py --should-run                                  # true/false
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
