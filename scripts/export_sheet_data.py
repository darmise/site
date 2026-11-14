#!/usr/bin/env python3
"""Crea i due piccoli file CSV che il foglio Google legge da solo (con IMPORTDATA):
  data/foglio-rosa.csv     id, nome, ruolo, sigla, numero   (giocatori + staff, da players.json e staff.json)
  data/foglio-partite.csv  giornata, partita, stato        (da matches.json: partita con data/ora o risultato; stato giocata / da giocare)
Il sito li pubblica insieme agli altri file; così nel foglio nome, ruolo e partita si compilano da soli.
"""
import csv, json
from datetime import datetime
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
ROLE = {"por": ("POR", "Portiere"), "portiere": ("POR", "Portiere"), "cen": ("CEN", "Centrale"), "centrale": ("CEN", "Centrale"),
        "lat": ("LAT", "Laterale"), "laterale": ("LAT", "Laterale"), "piv": ("PIV", "Pivot"), "pivot": ("PIV", "Pivot"),
        "uni": ("UNI", "Universale"), "universale": ("UNI", "Universale")}
GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]


def load(name, default):
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8-sig"))   # utf-8-sig: regge anche il BOM di Windows
    except OSError:
        return default
    except ValueError as e:
        print(f"ATTENZIONE: {name} non è un JSON valido ({e}): uso un elenco vuoto")
        return default


def write(name, rows):
    import io
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(rows)
    new = buf.getvalue()
    p = DATA / name
    if not p.exists() or p.read_text(encoding="utf-8") != new:   # niente scritture inutili: niente commit inutili
        p.write_text(new, encoding="utf-8")
        print("aggiornato", name)


def when(m):
    try:
        d = datetime.fromisoformat(m["date"])
    except (KeyError, ValueError):
        return ""
    s = f"{GIORNI[d.weekday()]} {d.day:02d}/{d.month:02d}"
    return s + (f" ore {d:%H:%M}" if m.get("timeKnown", True) else "")


def main():
    def num(p):
        try:
            return int(str(p.get("number", "")).strip())
        except ValueError:
            return 9999            # numero mancante o scritto male: in fondo, senza bloccare tutto

    rosa = [["id", "nome", "ruolo", "sigla", "numero"]]
    giocatori = [p for p in load("players.json", []) if p.get("id") and p.get("name")]
    for p in sorted(giocatori, key=num):
        sigla, label = ROLE.get(str(p.get("role", "")).strip().lower(), ("UNI", "Universale"))
        rosa.append([p["id"], p["name"], label, sigla, p.get("number", "")])
    staff = [s for s in load("staff.json", []) if s.get("id") and s.get("name")]
    for s in staff:
        rosa.append([s["id"], s["name"], "Staff - " + str(s.get("role", "")).strip() if s.get("role") else "Staff", "STAFF", ""])
    print(f"rosa: {len(giocatori)} giocatori + {len(staff)} staff")
    write("foglio-rosa.csv", rosa)

    part = [["giornata", "partita", "stato"]]
    tutte = [m for m in sorted(load("matches.json", []), key=lambda m: m.get("round", 0)) if m.get("round")]
    prossima = next((m["round"] for m in tutte if m.get("status") != "played"), None)   # solo la prossima gara, non tutto il calendario
    for m in tutte:
        played = m.get("status") == "played"
        if not played and m["round"] != prossima:
            continue
        if played:
            text = f"{m['home']} {m.get('homeScore')}-{m.get('awayScore')} {m['away']}"
        else:
            text = f"{m['home']} - {m['away']} ({when(m)})".replace(" ()", "")
        part.append([m["round"], text, "giocata" if played else "da giocare"])
    write("foglio-partite.csv", part)


if __name__ == "__main__":
    main()
