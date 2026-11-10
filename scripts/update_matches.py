#!/usr/bin/env python3
"""
Aggiorna data/matches.json e data/live.json leggendo i risultati da Tuttocampo.

Due modi di lettura (--mode):
  requests  (predefinito)  solo chiamate HTTP, nessun browser: leggero e adatto a un runner senza schermo.
  browser                  apre Chromium con Playwright (serve `pip install playwright` + `playwright install chromium`).

Come funziona la lettura con requests, per ogni giornata n = 1 ... 22:
  1. GET  .../Giornata<n>        -> pagina (e cookie). Se la tabella è già nell'HTML la legge subito.
  2. altrimenti, chiamata dei risultati (la pagina li carica con JavaScript): indirizzo in
     data/config.json -> tuttocampo.resultsUrl, con i segnaposto {round} {tckk} {roundID} {regionID}
     (tckk, roundID e regionID vengono letti dalla pagina del punto 1)
  3. cerca la partita della squadra (config.json -> teamName) e salva giornata, data/ora, squadre, risultato,
     stato e indirizzi dei logo (non scarica nulla).

Se il sito risponde 401/403/429 lo script SI FERMA subito, senza insistere.
Se una giornata non si riesce a leggere, quella già salvata resta com'era.

Uso:
  python scripts/update_matches.py                         # requests, tutte le 22 giornate
  python scripts/update_matches.py --rounds 1-3            # solo alcune giornate (prove)
  python scripts/update_matches.py --mode browser          # con Chromium (come la versione precedente)
  python scripts/update_matches.py --mode browser --headless --smart   # senza finestra, solo giornata attuale + successiva
  python scripts/update_matches.py --should-run            # stampa true/false (solo libreria standard)
  python scripts/update_matches.py --from-file tests/giornata1.html --round 1   # prova offline
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DEBUG = ROOT / "debug"
TZ = ZoneInfo("Europe/Rome")

BASE_URL = "https://www.tuttocampo.it/Basilicata/CalcioA5Dilettanti/GironeBPotenza/Giornata"
COMPETITION = "Serie D Calcio a 5"
TOTAL_ROUNDS = 22
LIVE_WINDOW_BEFORE = timedelta(minutes=30)     # da mezz'ora prima dell'inizio...
LIVE_WINDOW_AFTER = timedelta(hours=4)         # ...a 4 ore dopo (durata + ritardi del sito)
PAGE_DELAY_S = 2                               # pausa tra una giornata e l'altra
HTTP_TIMEOUT = 30
WAIT_MS = int(os.environ.get("TC_TIMEOUT_MS", "30000"))

MONTHS = {"gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6, "luglio": 7,
          "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12}


class SiteBlocked(Exception):
    """Il sito ha rifiutato la richiesta (401/403/429): non bisogna insistere."""


class EndpointMissing(Exception):
    """La pagina non contiene i risultati e in config.json manca l'indirizzo per chiederli."""


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


def save_debug_text(n, text, note=""):
    """Salva la risposta ricevuta, per capire cosa è successo."""
    try:
        DEBUG.mkdir(exist_ok=True)
        (DEBUG / f"giornata{n}.html").write_text(text, encoding="utf-8")
        snippet = " ".join(re.sub(r"<[^>]+>", " ", text).split())[:300]
        print(f"      {note}testo ricevuto: {snippet!r}", file=sys.stderr)
    except Exception as e:  # il debug non deve mai bloccare lo script
        print(f"      debug non salvato: {e}", file=sys.stderr)


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


def has_results(html):
    return "table-results" in html and 'class="match' in html


def parse_round(html, round_no, team):
    """Partita della squadra in una pagina/frammento giornata (dict) oppure None."""
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


# ------------------------------------------------- lettura con requests
def make_session():
    import requests
    s = requests.Session()
    s.headers.update({"Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
                      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"})
    ua = os.environ.get("TC_USER_AGENT")   # facoltativo; di norma non serve
    if ua:
        s.headers["User-Agent"] = ua
    return s


def http(session, method, url, **kw):
    """Richiesta con 3 tentativi per errori di rete/5xx. 401/403/429 fermano tutto (SiteBlocked)."""
    import requests
    last = None
    for attempt in range(3):
        try:
            r = session.request(method, url, timeout=HTTP_TIMEOUT, **kw)
        except requests.RequestException as e:
            last = f"{type(e).__name__}: {e}"
            time.sleep(3 * (attempt + 1))
            continue
        if r.status_code in (401, 403, 429):
            raise SiteBlocked(f"HTTP {r.status_code} da {url}")
        if r.status_code >= 500:
            last = f"HTTP {r.status_code}"
            time.sleep(3 * (attempt + 1))
            continue
        return r
    raise RuntimeError(last or "errore sconosciuto")


def extract_html(resp):
    """La risposta dei risultati può essere un frammento HTML oppure JSON che contiene l'HTML."""
    text = resp.text
    if text.lstrip().startswith(("{", "[")):
        try:
            found = []

            def walk(o):
                if isinstance(o, str):
                    if "table-results" in o:
                        found.append(o)
                elif isinstance(o, dict):
                    [walk(v) for v in o.values()]
                elif isinstance(o, list):
                    [walk(v) for v in o]
            walk(resp.json())
            if found:
                return found[0]
        except ValueError:
            pass
    return text


def page_vars(html):
    def grab(name):
        m = re.search(rf"\b{name}\s*=\s*['\"]([^'\"]+)['\"]", html)
        return m.group(1) if m else ""
    return {"tckk": grab("tckk"), "roundID": grab("roundID"), "regionID": grab("regionID")}


def fetch_round_requests(session, n, base_url, tc_cfg):
    """Ritorna l'HTML con la tabella della giornata n (o il testo ricevuto, se non c'è)."""
    page_url = f"{base_url}{n}"
    page = http(session, "GET", page_url)
    if has_results(page.text):
        return page.text                     # tabella già presente nell'HTML

    template = (tc_cfg or {}).get("resultsUrl", "")
    if not template:
        save_debug_text(n, page.text, "la pagina non contiene i risultati; ")
        raise EndpointMissing(
            "La pagina non contiene i risultati (li carica con JavaScript) e in data/config.json manca "
            "tuttocampo.resultsUrl. Vedi README: sezione 'Indirizzo dei risultati'.")

    v = {"round": n, **page_vars(page.text)}
    url = urljoin(page_url, template.format(**v))
    headers = {"X-Requested-With": "XMLHttpRequest", "Referer": page_url, "Accept": "*/*"}
    method = (tc_cfg.get("resultsMethod") or "GET").upper()
    data = {k: str(val).format(**v) for k, val in (tc_cfg.get("resultsData") or {}).items()} or None
    resp = http(session, method, url, headers=headers, data=data)
    return extract_html(resp)


def read_rounds_requests(rounds, base_url, team, tc_cfg):
    """Ritorna ({giornata: partita | None}, [giornate non lette])."""
    session = make_session()
    results, failed = {}, []
    for i, n in enumerate(rounds):
        if i:
            time.sleep(PAGE_DELAY_S)
        try:
            html = fetch_round_requests(session, n, base_url, tc_cfg)
        except SiteBlocked as e:
            print(f"  giornata {n:>2}: ACCESSO NEGATO ({e}). Mi fermo: non riprovo le altre giornate.", file=sys.stderr)
            failed.extend(rounds[i:])
            break
        except EndpointMissing:
            raise
        except Exception as e:
            print(f"  giornata {n:>2}: NON LETTA ({type(e).__name__}: {e})", file=sys.stderr)
            failed.append(n)
            continue
        if not has_results(html):
            print(f"  giornata {n:>2}: NON LETTA (risposta senza tabella)", file=sys.stderr)
            save_debug_text(n, html)
            failed.append(n)
            continue
        report(results, n, parse_round(html, n, team))
    return results, failed


def report(results, n, match):
    results[n] = match
    if match:
        print(f"  giornata {n:>2}: {match['home']} - {match['away']} | {match['status']} | "
              f"{match['homeScore']}-{match['awayScore']} | {match['date']}")
    else:
        print(f"  giornata {n:>2}: la squadra non compare (riposo?)", file=sys.stderr)


# ------------------------------------------------- lettura con il browser
def read_rounds_browser(rounds, base_url, team, headless):
    """Come la versione precedente: Chromium con Playwright."""
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    results, failed = {}, []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(locale="it-IT", timezone_id="Europe/Rome", viewport={"width": 1365, "height": 900})
        page = ctx.new_page()
        for i, n in enumerate(rounds):
            if i:
                time.sleep(PAGE_DELAY_S)
            url = f"{base_url}{n}"
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
                status = resp.status if resp else None
                if status in (401, 403, 429):
                    print(f"  giornata {n:>2}: ACCESSO NEGATO HTTP {status}. Mi fermo.", file=sys.stderr)
                    save_debug_text(n, page.content())
                    failed.extend(rounds[i:])
                    break
                page.wait_for_selector("#table_results_content tr.match", timeout=WAIT_MS)
            except PWTimeout:
                print(f"  giornata {n:>2}: NON LETTA (tabella non comparsa)", file=sys.stderr)
                save_debug_text(n, page.content())
                failed.append(n)
                continue
            report(results, n, parse_round(page.inner_html("#last_match_results"), n, team))
        ctx.close()
        browser.close()
    return results, failed


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


def smart_rounds(old, total):
    """Solo le giornate che servono alla home: quella del contatore (prima non ancora giocata) e la successiva."""
    pending = [m["round"] for m in old if m.get("status") in ("live", "scheduled", "postponed")]
    played = [m["round"] for m in old if m.get("status") == "played"]
    counter = min(pending) if pending else (max(played) + 1 if played else 1)
    return [n for n in (counter, counter + 1) if 1 <= n <= total]


def main():
    for stream in (sys.stdout, sys.stderr):      # console di Windows: niente errori con accenti e simboli
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--should-run", action="store_true")
    ap.add_argument("--mode", choices=["requests", "browser"], default="requests")
    ap.add_argument("--headless", action="store_true", help="solo con --mode browser (predefinito: finestra visibile)")
    ap.add_argument("--rounds", help="es. 1-22 oppure 3")
    ap.add_argument("--smart", action="store_true",
                    help="legge solo la giornata del contatore e la successiva (poche richieste)")
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
        rounds = smart_rounds(old, total) if args.smart and not args.rounds else parse_range(args.rounds, total)
        print(f"Giornate da leggere: {', '.join(map(str, rounds))}")
        try:
            if args.mode == "browser":
                results, failed = read_rounds_browser(rounds, args.base_url, team, args.headless)
            else:
                results, failed = read_rounds_requests(rounds, args.base_url, team, config.get("tuttocampo"))
        except EndpointMissing as e:
            print(f"\nSTOP: {e}", file=sys.stderr)
            sys.exit(3)

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
    sys.exit(0)


if __name__ == "__main__":
    main()