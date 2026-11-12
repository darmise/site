#!/usr/bin/env python3
"""Aggiorna dopo ogni giornata il valore dei giocatori (cammelli) e le bestemmie dello staff.

Giocatori (serve la pagella della giornata in data/pagelle.json):
    variazione cammelli = arrotonda((voto - 6) * 4) + 2 per ogni gol - 1 per ogni tunnel subito
    Nella pagella si possono aggiungere i campi facoltativi "goals" e "tunnels" (della sola partita):
    vengono sommati ai totali della scheda.  Chi non ha la pagella in quella giornata non cambia.
Staff (basta il risultato in data/matches.json):
    vittoria -3 bestemmie, pareggio +2, sconfitta +6.

Ogni giornata viene applicata una volta sola (lo stato è in data/values.json), quindi si può rilanciare quando si vuole.
Le schede ricevono "camelsChange" / "bestemmieChange" (l'ultima variazione), che il sito mostra come freccia.
"""
import json, sys, unicodedata
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
STAFF_DELTA = {"V": -3, "N": 2, "P": 6}


def load(name, default):
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save(name, obj, rows=False):
    if rows:   # una scheda per riga, come i file originali
        text = "[\n" + ",\n".join("  " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in obj) + "\n]\n"
    else:
        text = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    (DATA / name).write_text(text, encoding="utf-8")


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def outcome(m, team):
    if m.get("homeScore") is None or m.get("awayScore") is None:
        return ""
    if norm(m.get("home")) == team:
        a, b = m["homeScore"], m["awayScore"]
    elif norm(m.get("away")) == team:
        a, b = m["awayScore"], m["homeScore"]
    else:
        return ""
    return "V" if a > b else "P" if a < b else "N"


def main():
    team = norm(load("config.json", {}).get("teamName"))
    matches = sorted((m for m in load("matches.json", []) if m.get("status") == "played"), key=lambda m: m.get("round", 0))
    pagelle = load("pagelle.json", {})
    players, staff = load("players.json", []), load("staff.json", [])
    state = load("values.json", {})
    done_p, done_s = set(state.get("players", [])), set(state.get("staff", []))
    changed = False

    for m in matches:
        mid = m["id"]
        # staff: basta il risultato
        res = outcome(m, team)
        if mid not in done_s and res:
            d = STAFF_DELTA[res]
            for s in staff:
                new = max(0, int(s.get("bestemmie", 0)) + d)
                s["bestemmieChange"] = new - int(s.get("bestemmie", 0))
                s["bestemmie"] = new
            done_s.add(mid); changed = True
            print(f"{mid}: staff {d:+d} bestemmie (esito {res})")
        # giocatori: serve la pagella
        votes = (pagelle.get(mid) or {}).get("pagelle") or []
        if mid not in done_p and votes:
            byid = {v.get("playerId"): v for v in votes}
            for p in players:
                v = byid.get(p["id"])
                if not v or v.get("vote") is None:
                    p["camelsChange"] = 0
                    continue
                g, t = int(v.get("goals", 0)), int(v.get("tunnels", 0))
                delta = round((float(v["vote"]) - 6) * 4) + 2 * g - t
                new = max(0, int(p.get("camels", 0)) + delta)
                p["camelsChange"] = new - int(p.get("camels", 0))
                p["camels"] = new
                p["goals"] = int(p.get("goals", 0)) + g
                p["tunnels"] = int(p.get("tunnels", 0)) + t
            done_p.add(mid); changed = True
            print(f"{mid}: valori di {len(byid)} giocatori aggiornati")

    if changed:
        save("players.json", players, rows=True)
        save("staff.json", staff, rows=True)
        save("values.json", {"players": sorted(done_p), "staff": sorted(done_s)})
    else:
        print("Nessuna giornata nuova da applicare.")


if __name__ == "__main__":
    sys.exit(main())
