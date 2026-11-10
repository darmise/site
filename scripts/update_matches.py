#!/usr/bin/env python3
"""
Aggiorna data/matches.json e data/live.json leggendo i risultati da Tuttocampo.

Funzionamento (semplice e lineare):
  contatore n = 1 ... 22
    -> apre  .../Giornata<n>  con un browser (le tabelle si caricano con JavaScript)
    -> cerca la partita della squadra (config.json -> teamName)
    -> salva: giornata, data/ora, squadre, risultato (se già giocata), stato, indirizzi dei logo
La "prossima partita" del sito è la prima giornata non ancora giocata; l'ultimo risultato è
l'ultima giornata giocata. Nulla viene scaricato: i logo restano indirizzi del sito Tuttocampo.

Se una giornata non si riesce a leggere, i dati già salvati per quella giornata restano com'erano
e la pagina letta viene salvata in debug/ per capire cosa è successo.

Uso:
  python scripts/update_matches.py                    # legge le 22 giornate
  python scripts/update_matches.py --rounds 1-3       # solo alcune giornate (prove)
  python scripts/update_matches.py --should-run       # stampa true/false (solo libreria standard)
  python scripts/update_matches.py --from-file tests/giornata1.html --round 1   # prova offline
  python scripts/update_matches.py --base-url http://localhost:8124/Giornata    # prova con server locale
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DEBUG = ROOT / "debug"
TZ = ZoneInfo("Europe/Rome")

BASE_URL = "https://www.tuttocampo.it/Basilicata/CalcioA5Dilettanti/GironeBPotenza/Giornata"
COMPETITION = "Serie D Calcio a 5"
TOTAL_ROUNDS = 22                              # modificabile in config.json -> totalRounds
LIVE_WINDOW_BEFORE = timedelta(minutes=30)     # da mezz'ora prima dell'inizio...
LIVE_WINDOW_AFTER = timedelta(hours=4)         # ...a 4 ore dopo (durata + ritardi del sito)
PAGE_DELAY_S = 2                               # pausa tra una pagina e l'altra, per non pesare sul sito
WAIT_MS = int(os.environ.get("TC_TIMEOUT_MS", "30000"))

MONTHS = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6, "luglio": 7,
          "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12}


# ----------------------------------------------------------------- utilità
def load_json(name, default):
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(name, obj):
    """Scrive solo se il contenuto è cambiato. Ritorna True se ha scritto."""
    text = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    path = DATA / name
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def now_local():
    return datetime.now(TZ).replace(tzinfo=None)


def parse_dt(s):
    try:
        return datetime.fromisoformat(s)
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------- parser
def classify(title):
    """Stato della partita dal testo (title) dello span del punteggio."""
    t = norm(title)
    if "terminata" in t or "finale" in t:
        return "played"
    if "da giocare" in t:
        return "scheduled"
    if any(w in t for w in ("rinviata", "posticipata", "sospesa", "annullata", "sospeso")):
        return "postponed"
    return "live"      # qualunque altra dicitura con un punteggio = partita in corso


def team_logo(td):
    """Indirizzo del logo (versione 80px) e id squadra, dalla cella di una squadra."""
    team_id = td.get("data-team-id") or ""
    # data-src è l'indirizzo originale; src può essere stato sostituito dal sito con un logo di riserva
    img = td.select_one("img[data-src*='/Teams/'], img[src*='/Teams/']")
    url = (img.get("data-src") or img.get("src") or "") if img else ""
    if url and "default_team_logo" not in url:
        return team_id, url.replace("/Teams/40/", "/Teams/80/")
    return team_id, ""


def parse_round(html, round_no, team):
    """Partita della squadra in una pagina giornata (dict) oppure None se non gioca / non trovata."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    # anno e mese di inizio giornata: "6|11|2026 - 11|11|2026"
    start_year, start_month = now_local().year, 1
    el = soup.select_one("#match_date")
    m = re.search(r"(\d{1,2})\|(\d{1,2})\|(\d{4})", el.get_text() if el else "")
    if m:
        start_month, start_year = int(m.group(2)), int(m.group(3))

    day = None
    for tr in soup.select("table.table-results tr"):
        classes = tr.get("class") or []
        if "date" in classes:      # riga con il giorno: "Sab. 7 novembre"
            dm = re.search(r"(\d{1,2})\s+([a-zàèéìòù]+)", norm(tr.get_text(" ")))
            if dm and dm.group(2) in MONTHS:
                month = MONTHS[dm.group(2)]
                year = start_year + (1 if month < start_month else 0)
                day = (year, month, int(dm.group(1)))
            continue
        if "match" not in classes:
            continue

        home_td, away_td = tr.select_one("td.team.home"), tr.select_one("td.team.away")
        if not home_td or not away_td:
            continue
        name_h, name_a = home_td.select_one(".team-name"), away_td.select_one(".team-name")
        if not name_h or not name_a:
            continue
        home, away = name_h.get_text(strip=True), name_a.get_text(strip=True)
        if team not in (norm(home), norm(away)):
            continue

        def goal(td):
            g = td.select_one("span.goal")
            return (g.get_text(strip=True) if g else ""), (g.get("title", "") if g else "")

        (hs, hs_title), (as_, as_title) = goal(home_td), goal(away_td)
        status = classify(hs_title or as_title)
        score = lambda s: int(s) if s.isdigit() else None
        hour = tr.select_one("td.match-time .hour")
        hm = re.search(r"(\d{1,2}):(\d{2})", hour.get_text() if hour else "")

        date = None
        if day:
            time_part = f"{int(hm.group(1)):02d}:{hm.group(2)}" if hm else "00:00"
            date = f"{day[0]:04d}-{day[1]:02d}-{day[2]:02d}T{time_part}"

        home_id, home_logo = team_logo(home_td)
        away_id, away_logo = team_logo(away_td)
        return {
            "id": f"g{round_no}",
            "round": round_no,
            "date": date,
            "timeKnown": bool(hm),
            "competition": COMPETITION,
            "home": home,
            "away": away,
            "homeId": home_id,
            "awayId": away_id,
            "homeLogo": home_logo,
            "awayLogo": away_logo,
            "homeScore": score(hs) if status != "scheduled" else None,
            "awayScore": score(as_) if status != "scheduled" else None,
            "status": status,
            "url": tr.get("data-link") or None,
        }
    return None


# ------------------------------------------------------------ quando girare
def should_run(matches):
    """True se non ci sono ancora dati, o se siamo vicini a una partita (o è in corso)."""
    if not matches:
        return True
    now = now_local()
    for m in matches:
        if m.get("status") == "live":
            return True
        d = parse_dt(m.get("date"))
        if d and d - LIVE_WINDOW_BEFORE <= now <= d + LIVE_WINDOW_AFTER:
            return True
    return False


# ------------------------------------------------------------------ rete
def read_rounds(rounds, base_url, team):
    """
    Legge le giornate indicate, una dopo l'altra.
    Ritorna ({giornata: partita | None}, [giornate non lette]).
    None = pagina letta ma la squadra non gioca (riposo).
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    results, failed = {}, []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(locale="it-IT", timezone_id="Europe/Rome")
        page = ctx.new_page()
        for i, n in enumerate(rounds):
            if i:
                time.sleep(PAGE_DELAY_S)
            url = f"{base_url}{n}"
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_selector("#table_results_content tr.match", timeout=WAIT_MS)
            except PWTimeout:
                print(f"  giornata {n:>2}: NON LETTA (tabella non comparsa) <- {url}", file=sys.stderr)
                save_debug(page, n)
                failed.append(n)
                continue
            html = page.inner_html("#last_match_results")
            match = parse_round(html, n, team)
            results[n] = match
            if match:
                print(f"  giornata {n:>2}: {match['home']} - {match['away']} | {match['status']} | "
                      f"{match['homeScore']}-{match['awayScore']} | {match['date']}")
            else:
                print(f"  giornata {n:>2}: la squadra non compare (riposo?)", file=sys.stderr)
        browser.close()
    return results, failed


def save_debug(page, n):
    """Salva la pagina così com'è, per capire perché la tabella non è comparsa."""
    try:
        DEBUG.mkdir(exist_ok=True)
        (DEBUG / f"giornata{n}.html").write_text(page.content(), encoding="utf-8")
        text = " ".join(page.inner_text("body").split())[:300]
        print(f"      titolo: {page.title()!r} | testo: {text!r}", file=sys.stderr)
    except Exception as e:  # il debug non deve mai bloccare lo script
        print(f"      debug non salvato: {e}", file=sys.stderr)


# ------------------------------------------------------------------ main
def build_live(matches, old_live):
    live_match = next((m for m in matches if m["status"] == "live"), None)
    base = {"active": False, "matchId": None, "competition": COMPETITION, "home": "", "away": "",
            "homeLogo": "", "awayLogo": "", "homeScore": 0, "awayScore": 0, "status": "pre", "minute": 0,
            "streamUrl": old_live.get("streamUrl", ""), "events": []}
    if live_match:
        base.update(active=True, matchId=live_match["id"], competition=live_match["competition"],
                    home=live_match["home"], away=live_match["away"],
                    homeLogo=live_match.get("homeLogo", ""), awayLogo=live_match.get("awayLogo", ""),
                    homeScore=live_match["homeScore"] or 0, awayScore=live_match["awayScore"] or 0,
                    status="LIVE")
    return base


def parse_range(text, total):
    if not text:
        return list(range(1, total + 1))
    a, _, b = text.partition("-")
    return list(range(int(a), int(b or a) + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--should-run", action="store_true")
    ap.add_argument("--rounds", help="es. 1-22 oppure 3")
    ap.add_argument("--from-file")
    ap.add_argument("--round", type=int, default=1)
    ap.add_argument("--base-url", default=BASE_URL)
    args = ap.parse_args()

    config = load_json("config.json", {})
    team = norm(config.get("teamName"))
    total = int(config.get("totalRounds", TOTAL_ROUNDS))
    old = load_json("matches.json", [])

    if args.should_run:
        print("true" if should_run(old) else "false")
        return

    if args.from_file:
        html = Path(args.from_file).read_text(encoding="utf-8")
        results, failed = {args.round: parse_round(html, args.round, team)}, []
    else:
        results, failed = read_rounds(parse_range(args.rounds, total), args.base_url, team)

    read_ok = [n for n, m in results.items() if m]
    if not read_ok:
        print("Nessuna partita letta: i file non vengono modificati.", file=sys.stderr)
        sys.exit(0 if args.from_file else 1)

    # le giornate lette sostituiscono quelle vecchie; quelle non lette restano com'erano
    by_round = {m["round"]: m for m in old}
    for n, m in results.items():
        if m:
            by_round[n] = m
        elif n in by_round and n not in failed:
            del by_round[n]          # la squadra non gioca in quella giornata
    matches = [by_round[n] for n in sorted(by_round)]

    changed = save_json("matches.json", matches)
    changed |= save_json("live.json", build_live(matches, load_json("live.json", {})))

    nxt = next((m for m in matches if m["status"] in ("live", "scheduled")), None)
    print(f"\nLette {len(read_ok)} giornate su {len(results) + len(failed)} richieste"
          f"{' (non lette: ' + ', '.join(map(str, failed)) + ')' if failed else ''}. "
          f"Prossima: {(nxt['home'] + ' - ' + nxt['away'] + ' (' + str(nxt['date']) + ')') if nxt else 'nessuna'}. "
          f"File {'aggiornati' if changed else 'invariati'}.")


if __name__ == "__main__":
    main()
