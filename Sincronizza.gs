/* Script del foglio Google "Pagelle": tiene il foglio allineato al sito, partita dopo partita.
   - scheda Giornate: aggiunge la riga di ogni partita (anche la prossima, con data e ora) e aggiorna il risultato
   - scheda Pagelle: quando una partita risulta giocata, aggiunge le righe di quella giornata con TUTTI gli id di
     giocatori e staff (già con nome e ruolo). Tu scrivi il voto solo a chi ha giocato.
   Legge i file pubblici del sito (data/foglio-rosa.csv e data/foglio-partite.csv). Nessun token, nessuna password.
   Istruzioni: README del sito, sezione "Pagelle dal foglio Google". */

var SITO = 'https://darmise.github.io/site';   // <-- indirizzo del tuo sito, senza / alla fine

var COL_LOCK = '#f3f3f3', COL_GREY = '#e3e3e3', COL_WHITE = '#ffffff';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Pagelle')
    .addItem('Aggiorna dal sito', 'sincronizza')
    .addItem('Ripulisci righe non valide (dati di prova)', 'ripulisci')
    .addItem('Attiva aggiornamento automatico (ogni ora)', 'creaTrigger')
    .addToUi();
}

function leggiCsv_(nome) {
  var r = UrlFetchApp.fetch(SITO + '/data/' + nome + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) {
    throw new Error('Non riesco a leggere ' + nome + ' (codice ' + r.getResponseCode() + '). Controlla SITO in cima allo script e che il sito sia pubblicato.');
  }
  return Utilities.parseCsv(r.getContentText()).slice(1).filter(function (x) { return x.length > 1 && x[0] !== ''; });
}

function sincronizza() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rosa = leggiCsv_('foglio-rosa.csv');          // id, nome, ruolo, sigla, numero
  var partite = leggiCsv_('foglio-partite.csv');    // giornata, partita, stato
  var nuoveGiornate = 0, nuoveRighe = 0;

  // ---- Giornate: una riga per partita, il testo della partita sempre aggiornato
  var g = ss.getSheetByName('Giornate');
  var gv = g.getDataRange().getValues();
  var riga = {};
  for (var i = 1; i < gv.length; i++) if (gv[i][0] !== '') riga[Number(gv[i][0])] = i + 1;
  partite.forEach(function (p) {
    var n = Number(p[0]);
    if (riga[n]) {
      if (g.getRange(riga[n], 2).getValue() !== p[1]) g.getRange(riga[n], 2).setValue(p[1]);
    } else {
      g.getRange(g.getLastRow() + 1, 1, 1, 5).setValues([[n, p[1], '', '', 'NO']]);
      nuoveGiornate++;
    }
  });

  // ---- Pagelle: per ogni partita giocata, una riga per ogni id (giocatori e staff) che non c'è ancora
  var pg = ss.getSheetByName('Pagelle');
  var pv = pg.getDataRange().getValues();
  var esiste = {};
  for (var j = 1; j < pv.length; j++) if (pv[j][0] !== '') esiste[Number(pv[j][0]) + '|' + pv[j][1]] = true;
  var righe = [], colori = [];
  partite.filter(function (p) { return p[2] === 'giocata'; })
    .sort(function (a, b) { return Number(a[0]) - Number(b[0]); })
    .forEach(function (p) {
      rosa.forEach(function (r) {
        if (esiste[Number(p[0]) + '|' + r[0]]) return;
        righe.push([Number(p[0]), r[0], r[1], r[2], '', '', '', '', '', '', '']);
        var sigla = r[3];   // portieri: niente gol/tunnel; staff: nessuna statistica; altri: niente parate/gol subiti
        var stat = sigla === 'POR' ? [COL_GREY, COL_GREY, COL_WHITE, COL_WHITE]
          : sigla === 'STAFF' ? [COL_GREY, COL_GREY, COL_GREY, COL_GREY]
          : [COL_WHITE, COL_WHITE, COL_GREY, COL_GREY];
        colori.push([COL_LOCK, COL_LOCK, COL_LOCK, COL_LOCK, COL_WHITE, COL_WHITE].concat(stat, [COL_WHITE]));
        nuoveRighe++;
      });
    });
  if (righe.length) {
    var start = pg.getLastRow() + 1;
    pg.getRange(start, 1, righe.length, 11).setValues(righe);
    pg.getRange(start, 1, righe.length, 11).setBackgrounds(colori);
  }

  var msg = 'Aggiornato: ' + nuoveGiornate + ' nuove giornate, ' + nuoveRighe + ' nuove righe nelle pagelle. '
    + 'Letti dal sito: ' + partite.length + ' partite, ' + rosa.length + ' persone (la prima: ' + (rosa[0] ? rosa[0][1] : '-') + ').';
  try { ss.toast(msg, 'Pagelle', 8); } catch (e) { /* trigger senza interfaccia */ }
  console.log(msg);
  return msg;
}

/* Toglie dal foglio le righe che il sito non conosce (per esempio quelle create con i dati di prova)
   ma SOLO se sono ancora vuote: una riga con voto, titolo o commento non viene mai toccata. */
function ripulisci() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rosa = leggiCsv_('foglio-rosa.csv'), partite = leggiCsv_('foglio-partite.csv');
  var ids = {}, giornate = {}, giocate = {};
  rosa.forEach(function (r) { ids[r[0]] = true; });
  partite.forEach(function (p) { giornate[Number(p[0])] = true; if (p[2] === 'giocata') giocate[Number(p[0])] = true; });
  var tolte = 0;

  var pg = ss.getSheetByName('Pagelle'), pv = pg.getDataRange().getValues();
  for (var i = pv.length - 1; i >= 1; i--) {
    if (pv[i][0] === '') continue;
    var vuota = pv.length && [4, 5, 6, 7, 8, 9, 10].every(function (k) { return pv[i][k] === ''; });
    if (vuota && (!ids[pv[i][1]] || !giocate[Number(pv[i][0])])) { pg.deleteRow(i + 1); tolte++; }
  }
  var g = ss.getSheetByName('Giornate'), gv = g.getDataRange().getValues();
  for (var k = gv.length - 1; k >= 1; k--) {
    if (gv[k][0] === '') continue;
    var libera = gv[k][2] === '' && gv[k][3] === '' && String(gv[k][4]).toUpperCase() !== 'SI';
    if (libera && !giornate[Number(gv[k][0])]) { g.deleteRow(k + 1); tolte++; }
  }
  var msg = 'Ripulito: ' + tolte + ' righe vuote non più presenti nel sito.';
  try { ss.toast(msg, 'Pagelle', 8); } catch (e) { /* ignora */ }
  return msg;
}

/* da lanciare UNA volta: aggiorna il foglio da solo ogni ora */
function creaTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sincronizza') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincronizza').timeBased().everyHours(1).create();
  try { SpreadsheetApp.getActiveSpreadsheet().toast('Aggiornamento automatico attivo: ogni ora.', 'Pagelle', 6); } catch (e) { /* ignora */ }
}
