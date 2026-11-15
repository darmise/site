/* Moduli Google (Google Forms) per compilare le pagelle dallo smartphone.
   Si aggiunge al progetto Apps Script del foglio, accanto a Sincronizza.gs (File → + → Script, nome "Moduli").

   Crea DUE moduli:
   - "Pagelle · voto di un giocatore o dello staff": giornata, persona, voto, aggettivo, gol/tunnel o parate/gol subiti, commento.
     Una pagella alla volta: dopo l'invio si tocca "Invia un'altra risposta".
   - "Pagelle · commento della partita": giornata, titolo, commento, voto e commento dell'arbitro, pubblicare sì/no.
   Ogni risposta viene scritta da sola nella riga giusta del foglio (le righe le prepara "Aggiorna dal sito").
   Le liste (giornate, giocatori, staff) si aggiornano da sole a ogni sincronizzazione. */

var CODICE_FORM = '';   // facoltativo: se scrivi qui una parola, nei moduli compare "Codice redazione" e le risposte senza quel codice vengono ignorate

var AIUTO_FOTO = 'Facoltativa. Carica la foto su Google Drive, tocca Condividi → "Chiunque abbia il link" → Copia link, e incollalo qui. '
  + 'Vanno bene anche gli indirizzi diretti di un\'immagine (i link di Google Foto no).';
var AIUTO_AGGETTIVO = 'Scrivilo tu, una parola o due. Esempi: Brillante, Solido, Opaco, Spaesato, Evaporato';

function props_() { return PropertiesService.getDocumentProperties(); }

/* 10, 9½, 9+, 9, 9-, 8½ ... 3-, 2, 1  (dal più alto al più basso: + = +0,25, - = -0,25, ½ = +0,5) */
function votiScelta_(conSV) {
  var out = ['10'];
  for (var n = 9; n >= 3; n--) out.push(n + '½', n + '+', String(n), n + '-');
  out.push('2', '1');
  if (conSV) out.push('s.v.');   // senza voto: in campo ma non valutato, il valore non cambia
  return out;
}

function numeri_(max) { var o = []; for (var i = 0; i <= max; i++) o.push(String(i)); return o; }

function nonGiocata_(p) { return p[2] !== 'giocata'; }
function etichettaPartita_(p) { return Number(p[0]) + ' · ' + p[1]; }
function numeroDa_(testo) { var m = /^\s*(\d+)/.exec(String(testo)); return m ? Number(m[1]) : NaN; }

/* ---------- creazione (una volta sola) ---------- */
function creaModuli() {
  var props = props_();
  if (props.getProperty('FORM_PAGELLE_ID') && props.getProperty('FORM_PARTITA_ID')) {
    aggiornaModuli();
    return mostraLinkModuli();
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- modulo 1: pagella di una persona
  var fp = FormApp.create('Pagelle · voto di un giocatore o dello staff');
  fp.setDescription('Una pagella alla volta: scegli giornata e persona, poi il voto. Finito, tocca "Invia un\'altra risposta" per la successiva.');
  fp.setCollectEmail(false).setShowLinkToRespondAgain(true).setAllowResponseEdits(false);
  fp.setConfirmationMessage('Pagella salvata nel foglio ✅  Per la prossima tocca "Invia un\'altra risposta".');
  var ip = {};
  if (CODICE_FORM) ip.codice = fp.addTextItem().setTitle('Codice redazione').setRequired(true).getId();
  ip.giornata = fp.addListItem().setTitle('Giornata').setChoiceValues(['…']).setRequired(true).getId();
  ip.giocatore = fp.addListItem().setTitle('Chi vuoi votare?').setChoiceValues(['…']).setRequired(true).getId();
  ip.voto = fp.addListItem().setTitle('Voto').setHelpText('6+ e 6- contano come 6 per il valore · 6½ = 6,5 · s.v. = senza voto, il valore non cambia')
    .setChoiceValues(votiScelta_(true)).setRequired(true).getId();
  ip.aggettivo = fp.addTextItem().setTitle('Aggettivo della prestazione').setHelpText(AIUTO_AGGETTIVO).getId();
  ip.gol = fp.addListItem().setTitle('Gol fatti').setHelpText('Solo giocatori di movimento. Se non lo scegli resta 0.')
    .setChoiceValues(numeri_(10)).getId();
  ip.tunnel = fp.addListItem().setTitle('Tunnel subiti').setHelpText('Solo giocatori di movimento. Se non lo scegli resta 0.')
    .setChoiceValues(numeri_(10)).getId();
  ip.parate = fp.addListItem().setTitle('Parate').setHelpText('Solo portieri.').setChoiceValues(numeri_(30)).getId();
  ip.subiti = fp.addListItem().setTitle('Gol subiti').setHelpText('Solo portieri: i gol subiti mentre era in porta.')
    .setChoiceValues(numeri_(15)).getId();
  ip.commento = fp.addParagraphTextItem().setTitle('Commento scherzoso').getId();
  props.setProperty('FORM_PAGELLE_ID', fp.getId());
  props.setProperty('ITEMS_PAGELLE', JSON.stringify(ip));
  ScriptApp.newTrigger('rispostaPagella').forForm(fp).onFormSubmit().create();

  // --- modulo 2: commento della partita e arbitro
  var fm = FormApp.create('Pagelle · commento della partita');
  fm.setDescription('Titolo e commento della partita, con il voto all\'arbitro. Si compila una volta per giornata.');
  fm.setCollectEmail(false).setShowLinkToRespondAgain(false).setAllowResponseEdits(false);
  fm.setConfirmationMessage('Partita salvata nel foglio ✅');
  var im = {};
  if (CODICE_FORM) im.codice = fm.addTextItem().setTitle('Codice redazione').setRequired(true).getId();
  im.giornata = fm.addListItem().setTitle('Giornata').setChoiceValues(['…']).setRequired(true).getId();
  im.titolo = fm.addTextItem().setTitle('Titolo').setHelpText('Esempio: Sconfitta di misura ad Abriola').getId();
  im.immagine = fm.addTextItem().setTitle('Foto della partita (link)').setHelpText(AIUTO_FOTO).getId();
  im.commento = fm.addParagraphTextItem().setTitle('Commento della partita').getId();
  im.votoArb = fm.addListItem().setTitle('Voto all\'arbitro').setHelpText('Facoltativo').setChoiceValues(votiScelta_()).getId();
  im.commArb = fm.addParagraphTextItem().setTitle('Commento sull\'arbitro').setHelpText('Facoltativo').getId();
  im.pubblica = fm.addMultipleChoiceItem().setTitle('Pubblicare questa giornata sul sito?')
    .setHelpText('Scegli "Sì" solo quando hai finito anche le pagelle dei giocatori.').setChoiceValues(['Non ancora', 'Sì, pubblica']).getId();
  props.setProperty('FORM_PARTITA_ID', fm.getId());
  props.setProperty('ITEMS_PARTITA', JSON.stringify(im));
  ScriptApp.newTrigger('rispostaPartita').forForm(fm).onFormSubmit().create();

  aggiornaModuli();
  return mostraLinkModuli();
}

/* ---------- liste dei moduli sempre allineate al sito ---------- */
function aggiornaModuli() {
  var props = props_(), idP = props.getProperty('FORM_PAGELLE_ID'), idM = props.getProperty('FORM_PARTITA_ID');
  if (!idP && !idM) return 'Moduli non ancora creati.';
  var rosa = leggiCsv_('foglio-rosa.csv'), partite = leggiCsv_('foglio-partite.csv');
  var piu = function (a, b) { return Number(b[0]) - Number(a[0]); };   // la giornata più recente per prima

  if (idP) {
    var fp = FormApp.openById(idP), ip = JSON.parse(props.getProperty('ITEMS_PAGELLE'));
    // moduli creati con la vecchia versione: l'aggettivo da lista diventa un campo da scrivere (stessa posizione)
    var vecchio = fp.getItemById(ip.aggettivo);
    if (vecchio && vecchio.getType() === FormApp.ItemType.LIST) {
      var pos = vecchio.getIndex();
      var nuovo = fp.addTextItem().setTitle('Aggettivo della prestazione').setHelpText(AIUTO_AGGETTIVO);
      fp.moveItem(nuovo.getIndex(), pos);
      fp.deleteItem(vecchio);
      ip.aggettivo = nuovo.getId();
      props.setProperty('ITEMS_PAGELLE', JSON.stringify(ip));
    }
    var giocate = partite.filter(function (p) { return !nonGiocata_(p); }).sort(piu).map(etichettaPartita_);
    fp.getItemById(ip.voto).asListItem().setChoiceValues(votiScelta_(true)).setHelpText('6+ e 6- contano come 6 per il valore · 6½ = 6,5 · s.v. = senza voto, il valore non cambia');
    fp.getItemById(ip.giornata).asListItem().setChoiceValues(giocate.length ? giocate : ['Nessuna partita ancora giocata']);
    fp.getItemById(ip.giocatore).asListItem().setChoiceValues(rosa.length ? rosa.map(function (r) { return r[1] + ' · ' + r[2]; }) : ['Elenco non disponibile']);
  }
  if (idM) {
    var fm = FormApp.openById(idM), im = JSON.parse(props.getProperty('ITEMS_PARTITA'));
    if (!im.immagine) {   // modulo creato prima della foto: aggiungo la domanda subito dopo il titolo
      var foto = fm.addTextItem().setTitle('Foto della partita (link)').setHelpText(AIUTO_FOTO);
      fm.moveItem(foto.getIndex(), fm.getItemById(im.titolo).getIndex() + 1);
      im.immagine = foto.getId();
      props.setProperty('ITEMS_PARTITA', JSON.stringify(im));
    }
    var tutte = partite.slice().sort(piu).map(etichettaPartita_);
    fm.getItemById(im.giornata).asListItem().setChoiceValues(tutte.length ? tutte : ['Nessuna partita disponibile']);
  }
  return 'Moduli aggiornati: ' + rosa.length + ' persone, ' + partite.length + ' partite.';
}

function mostraLinkModuli() {
  var props = props_(), idP = props.getProperty('FORM_PAGELLE_ID'), idM = props.getProperty('FORM_PARTITA_ID');
  if (!idP || !idM) return 'Moduli non ancora creati: usa Pagelle → Crea i moduli.';
  var fp = FormApp.openById(idP), fm = FormApp.openById(idM);
  var msg = 'MODULO PAGELLE (voto di una persona)\n' + fp.getPublishedUrl()
    + '\n\nMODULO PARTITA (titolo, commento, arbitro)\n' + fm.getPublishedUrl()
    + '\n\nSul telefono: apri il link e aggiungilo alla schermata Home.'
    + '\nPer modificare le domande: ' + fp.getEditUrl()
    + (props.getProperty('ULTIMO_ERRORE') ? '\n\nUltimo errore: ' + props.getProperty('ULTIMO_ERRORE') : '');
  try { SpreadsheetApp.getUi().alert('Link dei moduli', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* senza interfaccia */ }
  return msg;
}

/* ---------- risposte -> foglio ---------- */
function risposte_(response, mappa) {
  var perId = {};
  response.getItemResponses().forEach(function (ir) { perId[ir.getItem().getId()] = ir.getResponse(); });
  var out = {};
  Object.keys(mappa).forEach(function (k) { var v = perId[mappa[k]]; out[k] = (v === undefined || v === null) ? '' : String(v).trim(); });
  return out;
}

function codiceOk_(c) { return !CODICE_FORM || String(c || '') === CODICE_FORM; }

function registraErrore_(e) {
  try { props_().setProperty('ULTIMO_ERRORE', new Date().toISOString() + ' · ' + (e && e.message ? e.message : e)); } catch (x) { /* ignora */ }
  console.error(e);
}

function cercaRiga_(sheet, filtro) {   // numero di riga (da 1) della prima riga che soddisfa il filtro, 0 se non c'è
  var v = sheet.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (filtro(v[i])) return i + 1;
  return 0;
}

function scrivi_(sheet, riga, titolo, valore) {   // scrive solo se la risposta c'è: non cancella mai quello che c'è già
  if (valore === '' || valore === undefined) return;
  var col = colonna_(sheet, titolo);
  if (col) sheet.getRange(riga, col).setValue(valore);
}

function scriviNumero_(sheet, riga, titolo, valore) {   // risposta vuota: 0 se la cella è vuota, altrimenti resta quello che c'era
  var col = colonna_(sheet, titolo);
  if (!col) return;
  if (valore !== '') sheet.getRange(riga, col).setValue(Number(valore));
  else if (sheet.getRange(riga, col).getValue() === '') sheet.getRange(riga, col).setValue(0);
}

function rispostaPagella(e) {
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(30000);
    var p = risposte_(e.response, JSON.parse(props_().getProperty('ITEMS_PAGELLE')));
    if (!codiceOk_(p.codice)) return;
    var n = numeroDa_(p.giornata), nome = String(p.giocatore).split(' · ')[0].trim();
    if (isNaN(n) || !nome) throw new Error('Risposta senza giornata o persona valida: ' + p.giornata + ' / ' + p.giocatore);
    var pg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Pagelle');
    var cG = colonna_(pg, 'Giornata'), cN = colonna_(pg, 'Giocatore');
    var trova = function () { return cercaRiga_(pg, function (r) { return Number(r[cG - 1]) === n && String(r[cN - 1]).trim() === nome; }); };
    var riga = trova();
    if (!riga) { sincronizza(); riga = trova(); }   // la giornata non era ancora nel foglio: la preparo e riprovo
    if (!riga) throw new Error('Non trovo ' + nome + ' nella giornata ' + n + ' del foglio Pagelle');

    var ruolo = String(pg.getRange(riga, colonna_(pg, 'Ruolo')).getValue());
    var staff = /^staff/i.test(ruolo), portiere = /^portiere/i.test(ruolo);
    scrivi_(pg, riga, 'Voto', p.voto);
    scrivi_(pg, riga, 'Aggettivo', p.aggettivo);
    scrivi_(pg, riga, 'Commento', p.commento);
    if (!staff && !portiere) { scriviNumero_(pg, riga, 'Gol', p.gol); scriviNumero_(pg, riga, 'Tunnel subiti', p.tunnel); }
    if (portiere) { scriviNumero_(pg, riga, 'Parate', p.parate); scriviNumero_(pg, riga, 'Gol subiti', p.subiti); }
  } catch (err) {
    registraErrore_(err);
  } finally {
    try { lock.releaseLock(); } catch (x) { /* ignora */ }
  }
}

/* Se nel modulo della partita hai aggiunto a mano la domanda "Caricamento file" (Apps Script non può crearla),
   la foto caricata finisce nel tuo Drive: la rendo visibile a chi ha il link e ne scrivo il link nel foglio. */
function fotoCaricata_(response) {
  try {
    var items = response.getItemResponses();
    for (var i = 0; i < items.length; i++) {
      if (items[i].getItem().getType() !== FormApp.ItemType.FILE_UPLOAD) continue;
      var ids = [].concat(items[i].getResponse() || []);
      if (!ids.length) continue;
      DriveApp.getFileById(ids[0]).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return 'https://drive.google.com/file/d/' + ids[0] + '/view';
    }
  } catch (err) {
    registraErrore_(err);
  }
  return '';
}

function rispostaPartita(e) {
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(30000);
    var p = risposte_(e.response, JSON.parse(props_().getProperty('ITEMS_PARTITA')));
    if (!codiceOk_(p.codice)) return;
    var n = numeroDa_(p.giornata);
    if (isNaN(n)) throw new Error('Risposta senza giornata valida: ' + p.giornata);
    var g = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Giornate');
    var cG = colonna_(g, 'Giornata');
    var riga = cercaRiga_(g, function (r) { return Number(r[cG - 1]) === n; });
    if (!riga) { sincronizza(); riga = cercaRiga_(g, function (r) { return Number(r[cG - 1]) === n; }); }
    if (!riga) throw new Error('Non trovo la giornata ' + n + ' nel foglio Giornate');
    aggiungiColonna_(g, 'Voto arbitro', 110);
    aggiungiColonna_(g, 'Commento arbitro', 320);
    aggiungiColonna_(g, 'Immagine', 260);
    scrivi_(g, riga, 'Titolo', p.titolo);
    scrivi_(g, riga, 'Immagine', p.immagine || fotoCaricata_(e.response));
    scrivi_(g, riga, 'Commento partita', p.commento);
    scrivi_(g, riga, 'Voto arbitro', p.votoArb);
    scrivi_(g, riga, 'Commento arbitro', p.commArb);
    if (p.pubblica) scrivi_(g, riga, 'Pubblica', /^s/i.test(p.pubblica) ? 'SI' : 'NO');
  } catch (err) {
    registraErrore_(err);
  } finally {
    try { lock.releaseLock(); } catch (x) { /* ignora */ }
  }
}
