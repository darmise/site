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


ASSETS = Path(__file__).resolve().parent.parent / "assets" / "partite"
MAX_BYTES = 12 * 1024 * 1024
DRIVE_ID = re.compile(r"(?:drive|docs)\.google\.com/(?:file/d/|open\?id=|uc\?(?:[^#]*&)?id=|thumbnail\?(?:[^#]*&)?id=)([\w-]{20,})")


def direct_url(url):
    """Link di condivisione di Google Drive -> indirizzo di download diretto; gli altri indirizzi restano uguali."""
    m = DRIVE_ID.search(url)
    return f"https://drive.google.com/uc?export=download&id={m.group(1)}" if m else url


def image_kind(data):
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


def fetch_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (pagelle-import)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("l'immagine pesa più di 12 MB")
    return data


def fit_image(data, kind):
    """Con Pillow: ruota come nella foto, riduce a 1600 px e salva in JPEG leggero. Senza Pillow: tiene il file com'è."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return data, kind
    if kind == "gif":
        return data, kind
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    im.thumbnail((1600, 1600))
    if im.mode not in ("RGB", "L"):
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.convert("RGBA").split()[-1])
        im = bg
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=82, optimize=True, progressive=True)
    return buf.getvalue(), "jpg"


def resolve_image(n, source, old):
    """Foto della giornata n: path locale già nel repository, oppure link scaricato in assets/partite/g<n>.jpg.
    Restituisce (campi da aggiungere alla giornata, avviso o None). Mai un errore: senza foto la giornata esce lo stesso."""
    import hashlib
    key = hashlib.sha1(source.encode("utf-8")).hexdigest()[:12]
    if old.get("imageKey") == key and old.get("image") and (ASSETS.parent.parent / old["image"].split("?")[0]).exists():
        return {"image": old["image"], "imageKey": key}, None          # già scaricata: non la riscarico ogni 30 minuti
    if not re.match(r"^https?://", source):
        local = source.lstrip("/")
        if (ASSETS.parent.parent / local).is_file():
            return {"image": local, "imageKey": key}, None
        return {}, f"giornata {n}: immagine «{source}» non trovata (scrivi un link http o un percorso già presente nel sito)"
    try:
        data = fetch_bytes(direct_url(source))
        kind = image_kind(data)
        if not kind:
            return {}, (f"giornata {n}: il link della foto non porta a un'immagine. Se è su Google Drive condividi il file con "
                        f"«Chiunque abbia il link» e incolla il link di condivisione")
        data, kind = fit_image(data, kind)
        ASSETS.mkdir(parents=True, exist_ok=True)
        for old_file in ASSETS.glob(f"g{n}.*"):
            old_file.unlink()
        (ASSETS / f"g{n}.{kind}").write_bytes(data)
        return {"image": f"assets/partite/g{n}.{kind}?v={hashlib.sha1(data).hexdigest()[:8]}", "imageKey": key}, None
    except Exception as e:
        return {}, f"giornata {n}: foto non scaricata ({e}); la giornata viene pubblicata senza foto"


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
    pubbl = [r.get("giornata") for r in giornate if norm(r.get("pubblica")) in YES]
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
        prev = old.get(key, {})
        if src:
            fields, warn = resolve_image(int(key[1:]), src, prev)
            entry.update(fields)
            if warn:
                print("ATTENZIONE:", warn)
                if not fields and prev.get("image"):                    # download fallito: si tiene la foto di prima
                    entry["image"], entry["imageKey"] = prev["image"], prev.get("imageKey", "")
    for key, entry in new.items():   # cella Immagine svuotata nel foglio: la foto sparisce dal sito e il file scaricato viene tolto
        prev_img = (old.get(key) or {}).get("image", "")
        if prev_img and not entry.get("image") and prev_img.startswith("assets/partite/"):
            try:
                (ASSETS.parent.parent / prev_img.split("?")[0]).unlink()
            except OSError:
                pass
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
