#!/usr/bin/env python3
"""Legge il foglio Google (pubblicato come CSV) e aggiorna data/pagelle.json.

Variabili d'ambiente: SHEET_GIORNATE_URL e SHEET_PAGELLE_URL (gli indirizzi CSV delle due schede).
Prova in locale con due file:   python scripts/import_sheet.py --giornate g.csv --pagelle p.csv

Si importano solo le giornate con Pubblica = SI. Se c'è anche un solo errore non viene scritto niente: l'errore
indica scheda e riga da correggere. Le giornate non pubblicate nel foglio restano come sono in pagelle.json.
Codici di uscita: 0 tutto bene (anche se non c'è niente di nuovo), 1 errori nel foglio.
"""
import argparse, csv, io, json, os, re, sys, unicodedata, urllib.request
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


VOTO = re.compile(r"^(\d{1,2}(?:[.,]\d+)?)\s*([+\-\u2212\u2013\u00bd]?)$")
STEP = {"+": 0.25, "-": -0.25, "\u2212": -0.25, "\u2013": -0.25, "\u00bd": 0.5}


SV = {"sv", "s.v.", "s.v", "senza voto"}


def parse_vote(text):
    """Voto del foglio -> (valore numerico, etichetta da mostrare o None).
    Accetta 6, 6.5, 6,5, 6+ (6,25), 6- (5,75), 6½ (6,5). Il valore deve restare tra 1 e 10."""
    t = str(text).strip().replace(" ", "")
    if t.lower() in SV or str(text).strip().lower() in SV:
        return None, "s.v."          # senza voto: in campo ma non valutato
    m = VOTO.match(t)
    if not m:
        raise ValueError("non è un voto valido: scrivi un numero (6, 6,5) o con + / - (6+, 6-)")
    base = float(m.group(1).replace(",", "."))
    mark = m.group(2)
    v = base + STEP.get(mark, 0)
    if not 1 <= v <= 10:
        raise ValueError("deve essere tra 1 e 10")
    v = int(v) if v == int(v) else round(v, 2)
    label = None
    if mark:
        shown = m.group(1).replace(".", ",")
        label = shown + ("+" if mark == "+" else "\u00bd" if mark == "\u00bd" else "\u2212")
    return v, label


ROOT = Path(__file__).resolve().parent.parent
FOTO_DIR = "assets/partite"
FOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def resolve_image(n, text):
    """Foto della giornata n dal percorso scritto nel foglio (colonna Immagine). Niente scarica: il file deve essere nel sito.
    «g1.jpg» -> assets/partite/g1.jpg; «assets/partite/g1.jpg» resta così; un indirizzo https viene usato com'è.
    Restituisce (percorso da mostrare oppure None, avviso oppure None)."""
    import hashlib
    src = text.strip().replace("\\", "/")
    if re.match(r"^https?://", src, re.I):
        return src, None
    rel = src.lstrip("/")
    while rel.startswith("./"):
        rel = rel[2:]
    if ".." in rel.split("/"):
        return None, f"giornata {n}: percorso «{text}» non valido (niente «..»)"
    if "/" not in rel:
        rel = f"{FOTO_DIR}/{rel}"
    if Path(rel.split("?")[0]).suffix.lower() not in FOTO_EXT:
        return None, f"giornata {n}: «{text}» non sembra un'immagine (usa .jpg, .png, .webp o .gif)"
    f = ROOT / rel.split("?")[0]
    if not f.is_file():
        # il percorso viene comunque scritto: se carichi il file dopo, la foto compare da sola
        return rel, f"giornata {n}: il file «{rel}» non è ancora nel sito: caricalo su GitHub in {FOTO_DIR}/ (finché manca la foto non si vede)"
    return f"{rel}?v={hashlib.sha1(f.read_bytes()).hexdigest()[:8]}", None


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
            r["_riga"] = i
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
                e["vote"], label = parse_vote(r["voto"])
                if label:
                    e["voteLabel"] = label
            except ValueError as ex:
                errors.append(f"{where}: voto «{r['voto']}» {ex}")
                continue
            e["label"] = r.get("aggettivo", "")
            if is_staff:   # lo staff ha solo voto, aggettivo e commento
                if any(r.get(c) not in (None, "", "0") for c in ("gol", "tunnel subiti", "parate", "gol subiti")):
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
            if any(r.get(c) not in (None, "", "0") for c in other):
                warnings.append(f"{where}: {p['name']} è {'un portiere' if keeper else 'un giocatore di movimento'}, ignoro {' e '.join(other)}")
            e["comment"] = r.get("commento", "")
            entries.append(e)
        entry = {"pagelle": entries}
        if g.get("titolo"):
            entry["title"] = g["titolo"]
        if g.get("commento partita"):
            entry["report"] = g["commento partita"]
        ref = {}
        if g.get("voto arbitro"):
            try:
                rv, label = parse_vote(g["voto arbitro"])
                if rv is not None:
                    ref["vote"] = rv
                    if label:
                        ref["voteLabel"] = label
            except ValueError as ex:
                errors.append(f"Giornate, riga {g.get('_riga')} (giornata {n}): voto arbitro «{g['voto arbitro']}» {ex}")
        if g.get("commento arbitro"):
            ref["comment"] = g["commento arbitro"]
        if ref:
            entry["referee"] = ref
        if g.get("immagine"):
            entry["_immagine"] = g["immagine"].strip()   # risolta da main(): scaricata e salvata in assets/partite
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
    # diagnosi: cosa è stato letto davvero (utile se «tutto verde ma niente pubblicato»)
    def heads(url):
        try:
            return [norm(h) for h in next(csv.reader(io.StringIO((urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "pagelle-import"}), timeout=60) if url.startswith("http") else open(url, "rb")).read().decode("utf-8-sig"))))]
        except Exception:
            return []
    hg, hp = heads(a.giornate), heads(a.pagelle)
    bad = []
    if not {"giornata", "pubblica"} <= set(hg):
        bad.append(f"SHEET_GIORNATE_URL non porta alla scheda Giornate (colonne trovate: {', '.join(hg) or 'nessuna'}). Pubblica sul web la scheda Giornate, non l'intero documento.")
    if not {"giornata", "id", "voto"} <= set(hp):
        bad.append(f"SHEET_PAGELLE_URL non porta alla scheda Pagelle (colonne trovate: {', '.join(hp) or 'nessuna'}). Pubblica sul web la scheda Pagelle.")
    if bad:
        for b in bad:
            print("ERRORE:", b)
        return 1
    print("Colonne lette in Giornate:", ", ".join(hg))
    pubbl = [r.get("giornata") for r in giornate if norm(r.get("pubblica")) in YES]
    for r in giornate:
        if norm(r.get("pubblica")) in YES:
            print(f"  giornata {r.get('giornata')}: cella Immagine {'compilata' if (r.get('immagine') or '').strip() else 'VUOTA (nessuna foto)'}")
    if "immagine" not in hg:
        print("Nota: nella scheda Giornate non c'è la colonna «Immagine» (intestazione esatta): le foto non vengono lette")
    print(f"Letto il foglio: {len(giornate)} righe in Giornate ({len(pubbl)} con Pubblica = SI: {', '.join(pubbl) or 'nessuna'}), "
          f"{len(pagelle)} righe in Pagelle ({sum(1 for r in pagelle if r.get('voto'))} con un voto).")
    def load(n, d):   # file mancante, vuoto o con il BOM di Windows: si riparte dal valore di default
        try:
            t = (DATA / n).read_text(encoding="utf-8-sig").strip()
            return json.loads(t) if t else d
        except OSError:
            return d
        except ValueError:
            print(f"Nota: {n} non è un JSON valido, lo considero vuoto")
            return d
    new, errors, warnings = build(giornate, pagelle, load("players.json", []), load("matches.json", []), load("staff.json", []))
    for w in warnings:
        print("Nota:", w)
    if errors:
        for e in errors:
            print("ERRORE:", e)
        print(f"Foglio non importato: {len(errors)} errori da correggere.")
        return 1
    old = load("pagelle.json", {})
    for key, entry in new.items():
        src = entry.pop("_immagine", None)
        if src:
            path, warn = resolve_image(int(key[1:]), src)
            if path:
                entry["image"] = path
                print(f"Foto {key}: {path.split('?')[0]}")
            if warn:
                print("ATTENZIONE:", warn)
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
