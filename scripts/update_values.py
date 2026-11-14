#!/usr/bin/env python3
"""Aggiorna dopo ogni giornata il valore dei giocatori (cammelli) e le bestemmie dello staff.

Giocatori di movimento (serve la pagella della giornata in data/pagelle.json):
    variazione cammelli = arrotonda((voto - 6) * 4) + 2 per ogni gol - 1 per ogni tunnel subito
    Nella pagella si possono aggiungere i campi facoltativi "goals" e "tunnels" (della sola partita):
    vengono sommati ai totali della scheda.  Chi non ha la pagella in quella giornata non cambia.
Portieri:
    variazione cammelli = arrotonda((voto - 6) * 4) + 1 ogni 3 parate - 1 per ogni gol subito + 3 se porta inviolata
    (campi di pagella "saves" = parate e "conceded" = gol subiti mentre era in porta; sommati ai totali).
Staff (basta il risultato in data/matches.json):
    base: vittoria 0 (non scendono mai), pareggio +2, sconfitta +6, moltiplicata per il ruolo:
    Allenatore x2, Vice allenatore x1,5, tutti gli altri x1 (quindi per l'allenatore: 0 / +4 / +12).
    Su una scheda dello staff si può forzare il peso con il campo facoltativo "peso" (es. "peso": 3).

Ogni giornata viene applicata una volta sola (lo stato è in data/values.json), quindi si può rilanciare quando si vuole.
Le schede ricevono "camelsChange" / "bestemmieChange" (l'ultima variazione), che il sito mostra come freccia.
"""
import json, sys, unicodedata
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
STAFF_DELTA = {"V": 0, "N": 2, "P": 6}   # le bestemmie salgono solo con pareggi e sconfitte, non scendono mai
STAFF_WEIGHT = {"allenatore": 2.0, "vice allenatore": 1.5}   # chi non c'è qui pesa 1


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


def staff_delta(s, base):
    w = float(s["peso"]) if s.get("peso") is not None else STAFF_WEIGHT.get(norm(s.get("role")), 1.0)
    x = base * w
    return int((abs(x) + 0.5) // 1) * (1 if x >= 0 else -1)   # arrotonda per eccesso lontano da zero


def is_keeper(p):
    return norm(p.get("role")) in ("por", "portiere")


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

    for k in pagelle:   # diagnosi: pagelle per cui non c'è una partita giocata (id diverso o risultato non ancora letto)
        if k not in {m["id"] for m in matches}:
            print(f"Nota: ci sono pagelle per {k} ma la partita {k} non risulta ancora giocata in matches.json: i valori aspettano il risultato")
    for m in matches:
        mid = m["id"]
        if mid in done_p and mid in done_s:
            print(f"{mid}: valori già applicati in precedenza (è in data/values.json), niente da fare")
        # staff: basta il risultato
        res = outcome(m, team)
        if mid not in done_s and res:
            d = STAFF_DELTA[res]
            for s in staff:
                new = max(0, int(s.get("bestemmie", 0)) + staff_delta(s, d))
                s["bestemmieChange"] = new - int(s.get("bestemmie", 0))
                s["bestemmie"] = new
            done_s.add(mid); changed = True
            print(f"{mid}: staff {d:+d} bestemmie di base (esito {res}), pesate per ruolo")
        # giocatori: serve la pagella
        votes = (pagelle.get(mid) or {}).get("pagelle") or []
        if mid not in done_p and votes:
            byid = {v.get("playerId"): v for v in votes if any(x["id"] == v.get("playerId") for x in players)}   # le pagelle dello staff non toccano i valori
            for p in players:
                v = byid.get(p["id"])
                if not v or v.get("vote") is None:
                    p["camelsChange"] = 0
                    continue
                base = round((float(v["vote"]) - 6) * 4)
                if is_keeper(p):
                    sv, cn = int(v.get("saves", 0)), int(v.get("conceded", 0))
                    delta = base + sv // 3 - cn + (3 if cn == 0 else 0)
                    p["saves"] = int(p.get("saves", 0)) + sv
                    p["conceded"] = int(p.get("conceded", 0)) + cn
                    g = t = 0
                else:
                    g, t = int(v.get("goals", 0)), int(v.get("tunnels", 0))
                    delta = base + 2 * g - t
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
