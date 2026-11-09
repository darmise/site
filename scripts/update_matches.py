#!/usr/bin/env python3
"""
Aggiorna data/matches.json e data/live.json leggendo i risultati da Tuttocampo.

Le pagine di Tuttocampo caricano i risultati con JavaScript, quindi serve un
browser (Playwright) che le apra e aspetti che la tabella sia comparsa.

Uso:
  python scripts/update_matches.py --should-run     # stampa true/false (solo libreria standard)
  python scripts/update_matches.py                  # aggiorna le giornate che servono
  python scripts/update_matches.py --full           # rilegge tutte le giornate
  python scripts/update_matches.py --from-file tests/giornata1.html --round 1   # prova offline
  python scripts/update_matches.py --base-url http://localhost:8123/Giornata    # prova con server locale
"""
import argparse
import json
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TZ = ZoneInfo("Europe/Rome")

BASE_URL = "https://www.tuttocampo.it/Basilicata/CalcioA5Dilettanti/GironeBPotenza/Giornata"
COMPETITION = "Serie D Calcio a 5"
MAX_ROUNDS = 22            # numero di giornate del girone (letto comunque dalla pagina)
LIVE_WINDOW_BEFORE = timedelta(minutes=30)   # inizio del periodo "attenzione"
LIVE_WINDOW_AFTER = timedelta(hours=4)       # fine: copre durata + ritardi nell'aggiornamento del sito
PAGE_DELAY_S = 2           # pausa tra una pagina e l'altra, per non pesare sul sito

MONTHS = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6, "luglio": 7,
          "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12}


# ----------------------------------------------------------------- file JSON
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


def parse_round(html, round_no, team):
    """Ritorna (partita della squadra | None, totale giornate | None) per una pagina giornata."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    total = len(soup.select("#match_days_selection [data-match-day-id]")) or None

    start_year, start_month = now_local().year, 1
    m = re.search(r"(\d{1,2})\|(\d{1,2})\|(\d{4})", soup.select_one("#match_date").get_text() if soup.select_one("#match_date") else "")
    if m:
        start_month, start_year = int(m.group(2)), int(m.group(3))

    day = None
    for tr in soup.select("table.table-results tr"):
        classes = tr.get("class") or []
        if "date" in classes:
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
        home = home_td.select_one(".team-name").get_text(strip=True)
        away = away_td.select_one(".team-name").get_text(strip=True)
        if team not in (norm(home), norm(away)):
            continue

        def goal(td):
            g = td.select_one("span.goal")
            return (g.get_text(strip=True) if g else ""), (g.get("title", "") if g else "")

        (hs, hs_title), (as_, _) = goal(home_td), goal(away_td)
        status = classify(hs_title)
        score = lambda s: int(s) if s.isdigit() else None
        hour = tr.select_one("td.match-time .hour")
        hm = re.search(r"(\d{1,2}):(\d{2})", hour.get_text() if hour else "")

        if day:
            date = f"{day[0]:04d}-{day[1]:02d}-{day[2]:02d}T{int(hm.group(1)):02d}:{hm.group(2)}" if hm \
                else f"{day[0]:04d}-{day[1]:02d}-{day[2]:02d}T00:00"
        else:
            date = None

        link = tr.get("data-link", "")
        return {
            "id": f"g{round_no}",
            "round": round_no,
            "date": date,
            "timeKnown": bool(hm),
            "competition": COMPETITION,
            "home": home,
            "away": away,
            "homeScore": score(hs) if status != "scheduled" else None,
            "awayScore": score(as_) if status != "scheduled" else None,
            "status": status,
            "url": link or None,
        }, total
    return None, total


# ------------------------------------------------------------ che cosa fare
def should_run(matches):
    """True se siamo vicini a una partita (o in corso) e vale la pena interrogare il sito."""
    now = now_local()
    for m in matches:
        if m.get("status") == "live":
            return True
        d = parse_dt(m.get("date"))
        if d and d - LIVE_WINDOW_BEFORE <= now <= d + LIVE_WINDOW_AFTER:
            return True
    return False


def rounds_to_refresh(matches, total):
    """Giornate da rileggere in modalità normale: in corso, ultima giocata, prossima."""
    now = now_local()
    rounds = set()
    past, future = [], []
    for m in matches:
        d = parse_dt(m.get("date"))
        if m.get("status") == "live":
            rounds.add(m["round"])
        if d:
            (past if d <= now else future).append((d, m["round"]))
    if past:
        rounds.add(max(past)[1])
    if future:
        rounds.add(min(future)[1])
    if not rounds:
        rounds.add(1)
    return sorted(r for r in rounds if r <= (total or MAX_ROUNDS))


# ------------------------------------------------------------------ rete
def fetch_rounds(round_numbers, base_url, team):
    """Apre ogni giornata con un browser e ne estrae la partita della squadra."""
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    found, total = {}, None
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(locale="it-IT", timezone_id="Europe/Rome")
        page = ctx.new_page()
        i = 0
        queue = list(round_numbers)
        while i < len(queue):
            n = queue[i]
            i += 1
            try:
                page.goto(f"{base_url}{n}", wait_until="domcontentloaded", timeout=45000)
                page.wait_for_selector("#table_results_content tr.match", timeout=30000)
            except PWTimeout:
                print(f"  giornata {n}: tabella non comparsa (pagina vuota o bloccata)", file=sys.stderr)
                continue
            html = page.inner_html("#last_match_results")
            match, t = parse_round(html, n, team)
            total = total or t
            if match:
                found[n] = match
            else:
                print(f"  giornata {n}: la squadra non gioca (riposo?)", file=sys.stderr)
            if i < len(queue):
                time.sleep(PAGE_DELAY_S)
        browser.close()
    return found, total


# ------------------------------------------------------------------ main
def build_live(matches, old_live):
    live_match = next((m for m in matches if m["status"] == "live"), None)
    base = {"active": False, "matchId": None, "competition": COMPETITION, "home": "", "away": "",
            "homeScore": 0, "awayScore": 0, "status": "pre", "minute": 0,
            "streamUrl": old_live.get("streamUrl", ""), "events": []}
    if live_match:
        base.update(active=True, matchId=live_match["id"], competition=live_match["competition"],
                    home=live_match["home"], away=live_match["away"],
                    homeScore=live_match["homeScore"] or 0, awayScore=live_match["awayScore"] or 0,
                    status="LIVE")
    return base


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--should-run", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--from-file")
    ap.add_argument("--round", type=int, default=1)
    ap.add_argument("--base-url", default=BASE_URL)
    args = ap.parse_args()

    config = load_json("config.json", {})
    team = norm(config.get("teamName"))
    old = load_json("matches.json", [])

    if args.should_run:
        print("true" if should_run(old) else "false")
        return

    if args.from_file:
        html = Path(args.from_file).read_text(encoding="utf-8")
        m, total = parse_round(html, args.round, team)
        found = {args.round: m} if m else {}
    else:
        if args.full or not old:
            # prima lettura: serve il numero di giornate, quindi si parte dalla 1 e si prosegue
            first, total = fetch_rounds([1], args.base_url, team)
            total = total or MAX_ROUNDS
            rest, _ = fetch_rounds(range(2, total + 1), args.base_url, team) if total > 1 else ({}, None)
            found = {**first, **rest}
        else:
            found, total = fetch_rounds(rounds_to_refresh(old, MAX_ROUNDS), args.base_url, team)

    if not found:
        print("Nessun dato letto: i file non vengono modificati.", file=sys.stderr)
        sys.exit(0 if args.from_file else 1)

    merged = {m["id"]: m for m in old}
    merged.update({m["id"]: m for m in found.values()})
    matches = sorted(merged.values(), key=lambda m: (m.get("date") or "9999", m["round"]))

    changed = save_json("matches.json", matches)
    changed |= save_json("live.json", build_live(matches, load_json("live.json", {})))
    print(f"{len(found)} giornate lette, {len(matches)} partite in archivio. File {'aggiornati' if changed else 'invariati'}.")


if __name__ == "__main__":
    main()
