#!/usr/bin/env python3
"""Crea il file Excel da importare su Google Sheets (una volta sola): 'pagelle-foglio.xlsx'.

Il file è quasi vuoto: ha solo le intestazioni, le tendine e la formattazione. Le righe le aggiunge da solo lo script del foglio
(foglio/Sincronizza.gs) man mano che le partite vengono giocate: giornata, id, nome e ruolo di giocatori e staff.

Uso:   pip install openpyxl     poi     python scripts/build_sheet_template.py
"""
import sys
from pathlib import Path

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation
except ImportError:
    sys.exit("Serve openpyxl:  pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
ROWS = 2000    # le tendine valgono fino a questa riga: bastano per tutta la stagione
ADJ = ["Devastante", "Straordinario", "Imprendibile", "Brillante", "Concreto", "Incisivo", "Ordinato", "Solido",
       "Affidabile", "Reattivo", "Insuperabile", "Spaesato", "Opaco", "Distratto", "Fuori fase", "Naufragato", "Evaporato"]


def main():
    head_fill = PatternFill("solid", fgColor="0C2670")
    wb = Workbook()
    ws = wb.active
    ws.title = "Giornate"
    ws.append(["Giornata", "Partita", "Titolo", "Commento partita", "Pubblica"])
    for col, w in zip("ABCDE", (10, 52, 38, 80, 11)):
        ws.column_dimensions[col].width = w
    dv = DataValidation(type="list", formula1='"SI,NO"', allow_blank=True)
    dv.error, dv.errorTitle = "Scegli SI oppure NO", "Pubblica"
    ws.add_data_validation(dv)
    dv.add(f"E2:E{ROWS}")

    wp = wb.create_sheet("Pagelle")
    wp.append(["Giornata", "ID", "Giocatore", "Ruolo", "Voto", "Aggettivo", "Gol", "Tunnel subiti", "Parate", "Gol subiti", "Commento"])
    for col, w in zip("ABCDEFGHIJK", (10, 7, 24, 22, 7, 16, 6, 13, 8, 11, 70)):
        wp.column_dimensions[col].width = w
    v = DataValidation(type="decimal", operator="between", formula1="1", formula2="10", allow_blank=True)
    v.error, v.errorTitle = "Il voto va da 1 a 10 (anche 6,5)", "Voto"
    n = DataValidation(type="whole", operator="greaterThanOrEqual", formula1="0", allow_blank=True)
    n.error, n.errorTitle = "Scrivi un numero intero, 0 o più", "Numero"
    a = DataValidation(type="list", formula1='"' + ",".join(ADJ) + '"', allow_blank=True, errorStyle="warning")
    a.promptTitle, a.prompt, a.showInputMessage = "Aggettivo", "Scegli dalla lista o scrivine uno tuo", True
    for d in (v, n, a):
        wp.add_data_validation(d)
    v.add(f"E2:E{ROWS}"); a.add(f"F2:F{ROWS}"); n.add(f"G2:J{ROWS}")
    wp.auto_filter.ref = f"A1:K{ROWS}"
    for s in (ws, wp):
        for c in s[1]:
            c.font, c.fill = Font(bold=True, color="FFFFFF"), head_fill
    ws.freeze_panes = "A2"
    wp.freeze_panes = "D2"
    out = ROOT / "pagelle-foglio.xlsx"
    wb.save(out)
    print(f"Creato {out.name}: ora incollaci dentro foglio/Sincronizza.gs (vedi README).")


if __name__ == "__main__":
    main()
