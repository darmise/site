#!/usr/bin/env python3
"""Legge il foglio Google (pubblicato come CSV) e aggiorna data/pagelle.json.

Variabili d'ambiente: SHEET_GIORNATE_URL e SHEET_PAGELLE_URL (gli indirizzi CSV delle due schede).
Prova in locale con due file:   python scripts/import_sheet.py --giornate g.csv --pagelle p.csv

Si importano solo le giornate con Pubblica = SI. Se c'è anche un solo errore non viene scritto niente: l'errore
indica scheda e riga da correggere. Le giornate non pubblicate nel foglio restano come sono in pagelle.json.
Codici di uscita: 0 tutto bene (anche se non c'è niente di nuovo), 1 errori nel foglio.
"""
import argparse, csv, io, json, os, sys, unicodedata, urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
YES = {"si", "s", "yes", "y", "true", "vero", "x", "1", "ok"}
ROLE = {"por": "POR", "portiere": "POR", "cen": "CEN", "centrale": "CEN", "lat": "LAT", "laterale": "LAT",
        "piv": "PIV", "pivot": "PIV", "uni": "UNI", "universale": "UNI"}


def norm(s):
    return " ".join(unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower().split())


def read_csv(src):
    if src.startswith("http"):
        req = urllib.request.Request(src, headers={"User-Agent": "pagelle-import"})
        text = urllib.request.urlopen(req, timeout=60).read().decode("utf-8-sig")
    else:
        text = Path(src).read_text(encoding="utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return []
    head = [norm(h) for h in rows[0]]
    return [{head[i]: (r[i].strip() if i < len(r) else "") for i in range(len(head))} for r in rows[1:] if any(c.strip() for c in r)]


def num(text, lo=None, hi=None, integer=False):
    t = str(text).strip().replace(",", ".")
    try:
        v = float(t)
    except ValueError:
        raise ValueError("deve essere un numero")
    if integer and v != int(v):
        raise ValueError("deve essere un numero intero")
    if lo is not None and not lo <= v <= hi:
        raise ValueError(f"deve essere tra {lo} e {hi}")
    if integer and v < 0:
        raise ValueError("non può essere negativo")
    return int(v) if v == int(v) else v


def build(giornate, pagelle, players, matches, staff=()):
    errors, warnings, out = [], [], {}
    byid = {p["id"]: p for p in players}
    staffid = {s["id"]: s for s in staff}
    published = {}
    for i, r in enumerate(giornate, start=2):
        try:
            n = int(float(r.get("giornata", "")))
        except ValueError:
            errors.append(f"Giornate, riga {i}: numero di giornata non valido «{r.get('giornata', '')}»")
            continue
        if norm(r.get("pubblica")) in YES:
            published[n] = r
    rows_by_round = {}
    for i, r in enumerate(pagelle, start=2):
        try:
            n = int(float(r.get("giornata", "")))
        except ValueError:
            errors.append(f"Pagelle, riga {i}: giornata non valida «{r.get('giornata', '')}»")
            continue
        if n in published and r.get("voto", "") != "":
            rows_by_round.setdefault(n, []).append((i, r))
    played = {m.get("round"): m for m in matches if m.get("status") == "played"}
    for n, g in sorted(published.items()):
        rows = rows_by_round.get(n, [])
        if not rows:
            errors.append(f"Giornata {n} è su Pubblica = SI ma non ha nessun voto nella scheda Pagelle")
            continue
        if n not in played:
            warnings.append(f"Giornata {n}: la partita non risulta ancora giocata, i valori si aggiorneranno dopo il risultato")
        entries, seen = [], set()
        for i, r in rows:
            where = f"Pagelle, riga {i} (giornata {n})"
            pid = r.get("id", "")
            p = byid.get(pid) or staffid.get(pid)
            if not p:
                errors.append(f"{where}: id «{pid}» sconosciuto (non c'è in players.json né in staff.json)")
                continue
            is_staff = pid in staffid and pid not in byid
            if p["id"] in seen:
                errors.append(f"{where}: {p['name']} compare due volte nella stessa giornata")
                continue
            seen.add(p["id"])
            e = {"playerId": p["id"]}
            try:
                e["vote"] = num(r["voto"], 1, 10)
            except ValueError as ex:
                errors.append(f"{where}: voto «{r['voto']}» {ex}")
                continue
            e["label"] = r.get("aggettivo", "")
            if is_staff:   # lo staff ha solo voto, aggettivo e commento
                if any(r.get(c) for c in ("gol", "tunnel subiti", "parate", "gol subiti")):
                    warnings.append(f"{where}: {p['name']} è dello staff, ignoro le statistiche")
                e["label"] = r.get("aggettivo", "")
                e["comment"] = r.get("commento", "")
                entries.append(e)
                continue
            keeper = ROLE.get(norm(p.get("role")), "UNI") == "POR"
            fields = (("saves", "parate"), ("conceded", "gol subiti")) if keeper else (("goals", "gol"), ("tunnels", "tunnel subiti"))
            for key, col in fields:
                try:
                    e[key] = num(r.get(col) or 0, integer=True)
                except ValueError as ex:
                    errors.append(f"{where}: {col} «{r.get(col)}» {ex}")
            other = ("gol", "tunnel subiti") if keeper else ("parate", "gol subiti")
            if any(r.get(c) for c in other):
                warnings.append(f"{where}: {p['name']} è {'un portiere' if keeper else 'un giocatore di movimento'}, ignoro {' e '.join(other)}")
            e["comment"] = r.get("commento", "")
            entries.append(e)
        entry = {"pagelle": entries}
        if g.get("titolo"):
            entry["title"] = g["titolo"]
        if g.get("commento partita"):
            entry["report"] = g["commento partita"]
        out[f"g{n}"] = entry
    return out, errors, warnings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--giornate", default=os.environ.get("SHEET_GIORNATE_URL"))
    ap.add_argument("--pagelle", default=os.environ.get("SHEET_PAGELLE_URL"))
    a = ap.parse_args()
    if not a.giornate or not a.pagelle:
        print("Mancano gli indirizzi del foglio: variabili SHEET_GIORNATE_URL e SHEET_PAGELLE_URL.")
        return 1
    try:
        giornate, pagelle = read_csv(a.giornate), read_csv(a.pagelle)
    except Exception as e:
        print(f"Non riesco a leggere il foglio: {e}")
        return 1
    load = lambda n, d: json.loads((DATA / n).read_text(encoding="utf-8")) if (DATA / n).exists() else d
    new, errors, warnings = build(giornate, pagelle, load("players.json", []), load("matches.json", []), load("staff.json", []))
    for w in warnings:
        print("Nota:", w)
    if errors:
        for e in errors:
            print("ERRORE:", e)
        print(f"Foglio non importato: {len(errors)} errori da correggere.")
        return 1
    old = load("pagelle.json", {})
    merged = dict(old)
    merged.update(new)
    merged = dict(sorted(merged.items(), key=lambda kv: int(kv[0][1:]) if kv[0][1:].isdigit() else 999))
    if merged == old:
        print("Nessuna novità dal foglio.")
        return 0
    (DATA / "pagelle.json").write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"pagelle.json aggiornato: giornate {', '.join(sorted(new, key=lambda k: int(k[1:])))}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
