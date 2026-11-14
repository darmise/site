/* Pagina Rosa: schede dei giocatori e dello staff. Toccando una scheda si gira e mostra le statistiche (simpatiche).
   Dati: data/players.json (giocatori) e data/staff.json (staff, facoltativo). */
(function () {
  'use strict';
  const FC = window.FC;
  const PH_PLAYER = 'assets/mascotte-happy.png';              // al posto della foto, finché non c'è quella vera
  const PH_STAFF = 'assets/mascotte-neutral.png';
  const ROLES = [                                            // ruoli del calcio a 5, nell'ordine di visualizzazione
    { key: 'POR', plural: 'Portieri', single: 'Portiere', slug: 'portieri' },
    { key: 'CEN', plural: 'Centrali', single: 'Centrale', slug: 'centrali' },
    { key: 'LAT', plural: 'Laterali', single: 'Laterale', slug: 'laterali' },
    { key: 'PIV', plural: 'Pivot', single: 'Pivot', slug: 'pivot' },
    { key: 'UNI', plural: 'Universali', single: 'Universale', slug: 'universali' }
  ];
  // in players.json il ruolo può essere scritto come codice (POR, CEN, LAT, PIV, UNI) o per esteso (Portiere, Centrale...)
  const ALIAS = { por: 'POR', portiere: 'POR', cen: 'CEN', centrale: 'CEN', lat: 'LAT', laterale: 'LAT', piv: 'PIV', pivot: 'PIV', uni: 'UNI', universale: 'UNI', staff: 'STAFF' };
  const roleOf = p => ALIAS[String(p.role || '').trim().toLowerCase()] || 'UNI';   // ruolo mancante o non riconosciuto: Universale
  const STATUS = { injured: '🩹 Infortunato', suspended: '🟥 Squalificato', doubt: '❓ In dubbio' };
  const esc = s => FC.esc(s);
  const $ = (s, r = document) => r.querySelector(s);
  const num = v => (Number.isFinite(+v) ? +v : 0);
  const pl = (n, one, many) => (n === 1 ? one : many);

  // commenti scherzosi in base al valore
  const tier = (v, steps) => { for (const [max, text] of steps) if (v <= max) return text; return steps[steps.length - 1][1]; };
  const NOTE = {
    camels: v => tier(v, [[0, 'Ancora da valutare: nessuna carovana in vista'], [10, 'Valore da dromedario di provincia'], [30, 'Una piccola carovana, mica male'], [60, 'Carovana di tutto rispetto'], [Infinity, 'Clausola rescissoria in mezzo al deserto']]),
    tunnels: v => tier(v, [[0, 'Mai umiliato: muro di mattoni'], [2, 'Qualche caviglia ancora sotto shock'], [5, 'Il parquet ricorda tutto'], [Infinity, 'Per lui il tunnel è un pedaggio']]),
    goals: v => tier(v, [[0, 'Il pallone lo cerca ancora'], [3, 'Si sblocca quando serve'], [8, 'Fa tremare le reti'], [Infinity, 'Capocannoniere da palazzetto']]),
    saves: v => tier(v, [[0, 'I guantoni sono ancora nel sacchetto'], [20, 'Si scalda, ma bene'], [60, 'Para anche i pensieri'], [Infinity, 'Muro di mattoni: oltre non si passa']]),
    conceded: v => tier(v, [[0, 'Porta blindata: ancora inviolata'], [10, 'Qualche gol, ma con dignità'], [25, 'Il pallone in rete lo conosce bene'], [Infinity, 'La rete ormai fa quasi parte del bagaglio']]),
    bestemmie: v => tier(v, [[0, 'Zen assoluto: monaco in panchina'], [20, 'Si trattiene, ma si vede'], [60, 'Tipico stress da panchina'], [Infinity, 'Record da palazzetto: il cielo trema']])
  };
  // freccia verde in alto (aumento) o rossa in basso (calo); nulla se il valore non è cambiato
  const trend = c => { c = num(c); return c === 0 ? '' :
    `<span class="trend ${c > 0 ? 'up' : 'down'}" title="${c > 0 ? 'In rialzo' : 'In calo'} rispetto alla scorsa giornata"><i aria-hidden="true">${c > 0 ? '▲' : '▼'}</i>${Math.abs(c)}<span class="sr">${c > 0 ? ' in più' : ' in meno'}</span></span>`; };
  const stat = (emoji, label, value, note) =>
    `<div class="st"><span class="st-ico" aria-hidden="true">${emoji}</span>
      <div class="st-txt">${label ? `<span class="st-lab">${label}</span>` : ''}<b class="st-val">${value}</b><span class="st-note">${note}</span></div></div>`;

  const splitName = full => {
    const parts = String(full || '').trim().split(/\s+/);
    return { first: parts.length > 1 ? parts[0] : '', last: parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || '') };
  };

  function card(p, o) {
    // o: { kind: 'player' | 'staff', roleKey, tag }
    const { first, last } = splitName(p.name);
    const staff = o.kind === 'staff';
    const ph = staff ? PH_STAFF : PH_PLAYER;
    // foto: campo "photo" della scheda, altrimenti il file assets/giocatori/<id>.png o .jpg (assets/staff/<id>.* per lo staff);
    // se non esiste nessuno dei due resta la mascotte
    const base = `assets/${staff ? 'staff' : 'giocatori'}/${p.id}`;
    const photo = `<img class="pl-img real" src="${esc(p.photo || base + '.png')}" data-alt="${p.photo ? '' : base + '.jpg'}" data-ph="${ph}" alt="Foto di ${esc(p.name)}" loading="lazy" width="320" height="400">`;
    const big = staff ? '<span class="pl-num staff" aria-label="Staff">STAFF</span>' : `<span class="pl-num" aria-label="Numero ${esc(p.number)}">${esc(p.number)}</span>`;
    const stats = staff
      ? stat('🤬', '', `${num(p.bestemmie)}${trend(p.bestemmieChange)}`, NOTE.bestemmie(num(p.bestemmie)))
      : stat('🐪', 'Valore', `${num(p.camels)} <small>${pl(num(p.camels), 'cammello', 'cammelli')}</small>${trend(p.camelsChange)}`, NOTE.camels(num(p.camels))) +
        (o.roleKey === 'POR'
          ? stat('🧤', 'Parate', num(p.saves), NOTE.saves(num(p.saves))) + stat('🥅', 'Gol subiti', num(p.conceded), NOTE.conceded(num(p.conceded)))
          : stat('🕳️', 'Tunnel subiti', num(p.tunnels), NOTE.tunnels(num(p.tunnels))) + stat('⚽', 'Gol fatti', num(p.goals), NOTE.goals(num(p.goals))));
    const status = STATUS[p.status] ? `<p class="bk-status st-${esc(p.status)}">${STATUS[p.status]}${p.statusNote ? ' · ' + esc(p.statusNote) : ''}</p>` : '';
    return `<article class="pl-card${staff ? ' is-staff' : ''}" data-role="${o.roleKey}">
      <div class="pl-flip" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(p.name)}: tocca per vedere le statistiche">
        <div class="pl-face pl-front">
          <div class="pl-photo">${big}${photo}<span class="pl-tag">${esc(o.tag)}</span></div>
          <div class="pl-info"><h3 class="pl-name">${first ? `<small>${esc(first)}</small>` : ''}${esc(last)}</h3></div>
        </div>
        <div class="pl-face pl-back" aria-hidden="true">
          <div class="bk-head"><b>${esc(p.name)}</b><span>${esc(staff && p.role && roleOf(p) !== 'STAFF' ? p.role : o.tag)}</span></div>
          <div class="bk-stats">${stats}</div>
          ${status}
        </div>
      </div>
    </article>`;
  }


  /* ---------- valori calcolati dal sito ----------
     players.json e staff.json contengono i valori INIZIALI. Giornata dopo giornata (partite giocate, in ordine) il sito
     applica pagelle e risultati e ricava valori attuali e ultima variazione (le frecce). Nessun lavoro automatico deve
     riscrivere quei file: basta che data/pagelle.json e data/matches.json siano aggiornati.
     Giocatori: arrotonda((voto-6)*4) + 2 per gol - 1 per tunnel.  Portieri: arrotonda((voto-6)*4) + parate/3 - gol subiti + 3 se inviolata.
     Staff: vittoria 0, pareggio +2, sconfitta +6, per Allenatore x2, Vice allenatore x1,5 (o campo "peso"). Mai sotto zero. */
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  const roundAway = x => Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
  const STAFF_BASE = { V: 0, N: 2, P: 6 };
  const STAFF_W = { 'allenatore': 2, 'vice allenatore': 1.5 };
  function outcomeOf(m, team) {
    if (m.homeScore == null || m.awayScore == null) return '';
    const h = norm(m.home) === team, a = norm(m.away) === team;
    if (!h && !a) return '';
    const mine = h ? +m.homeScore : +m.awayScore, their = h ? +m.awayScore : +m.homeScore;
    return mine > their ? 'V' : mine < their ? 'P' : 'N';
  }
  function applyValues(players, staff, matches, teamName) {
    const team = norm(teamName);
    const P = players.map(p => ({ ...p, camels: num(p.camels), goals: num(p.goals), tunnels: num(p.tunnels), saves: num(p.saves), conceded: num(p.conceded), camelsChange: 0 }));
    const S = staff.map(s => ({ ...s, bestemmie: num(s.bestemmie), bestemmieChange: 0 }));
    const played = (matches || []).filter(m => m.status === 'played').sort((a, b) => (a.round || 0) - (b.round || 0));
    played.forEach(m => {
      const res = outcomeOf(m, team);
      if (res) S.forEach(s => {
        const w = s.peso != null ? +s.peso : (STAFF_W[norm(s.role)] || 1);
        const d = roundAway(STAFF_BASE[res] * w), nv = Math.max(0, s.bestemmie + d);
        s.bestemmieChange = nv - s.bestemmie; s.bestemmie = nv;
      });
      const votes = Array.isArray(m.pagelle) ? m.pagelle : [];
      if (!votes.length) return;
      const byId = {}; votes.forEach(v => { if (v && v.playerId) byId[v.playerId] = v; });
      P.forEach(p => {
        const v = byId[p.id];
        if (!v || v.vote == null || v.vote === '') { p.camelsChange = 0; return; }
        const base = roundAway((+v.vote - 6) * 4);
        let d, g = 0, t = 0;
        if (roleOf(p) === 'POR') {
          const sv = num(v.saves), cn = num(v.conceded);
          d = base + Math.floor(sv / 3) - cn + (cn === 0 ? 3 : 0);
          p.saves += sv; p.conceded += cn;
        } else { g = num(v.goals); t = num(v.tunnels); d = base + 2 * g - t; }
        const nv = Math.max(0, p.camels + d);
        p.camelsChange = nv - p.camels; p.camels = nv; p.goals += g; p.tunnels += t;
      });
    });
    return { players: P, staff: S };
  }

  async function start() {
    const all = (FC.S.players || []).slice();
    let staff = [];
    try { staff = await FC.getJSON('data/staff.json'); } catch (e) { staff = []; }
    staff = staff.concat(all.filter(p => roleOf(p) === 'STAFF'));   // anche chi in players.json ha ruolo Staff
    const calc = applyValues(all.filter(p => roleOf(p) !== 'STAFF'), staff, FC.S.matches, FC.S.config.teamName);
    staff = calc.staff;
    const players = calc.players;

    const byRole = key => players.filter(p => roleOf(p) === key).sort((a, b) => (a.number || 0) - (b.number || 0));
    const groups = ROLES.map(r => ({ ...r, kind: 'player', list: byRole(r.key) })).filter(g => g.list.length);
        if (staff.length) groups.push({ key: 'STAFF', plural: 'Staff', single: 'Staff', slug: 'staff', kind: 'staff', list: staff });

    $('#rosa-sub').textContent = [FC.S.config.season ? 'Stagione ' + FC.S.config.season : '',
      `${players.length} ${pl(players.length, 'giocatore', 'giocatori')}`, staff.length ? `${staff.length} nello staff` : ''].filter(Boolean).join(' · ');

    if (!players.length && !staff.length) {
      $('#rosa-list').innerHTML = '<p class="empty">La rosa sarà pubblicata a breve.</p>';
      return;
    }

    const filters = [{ slug: 'tutti', label: 'Tutta la squadra', n: players.length + staff.length }, ...groups.map(g => ({ slug: g.slug, label: g.plural, n: g.list.length }))];
    const fromHash = () => { const h = location.hash.replace('#', ''); return filters.some(f => f.slug === h) ? h : 'tutti'; };
    let current = fromHash();

    $('#rosa-filters').innerHTML = filters.map(f =>
      `<button type="button" class="rf" data-f="${f.slug}" aria-pressed="false">${f.label}<span>${f.n}</span></button>`).join('');

    $('#rosa-list').innerHTML = groups.map(g => `
      <section class="rosa-group" data-g="${g.slug}" aria-label="${g.plural}">
        <div class="section-head"><h2>${g.plural}</h2><span class="muted">${g.list.length}</span></div>
        <div class="pl-grid">${g.list.map(p => card(p, { kind: g.kind, roleKey: g.key, tag: g.single })).join('')}</div>
      </section>`).join('');

    function apply() {
      document.querySelectorAll('.rf').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === current)));
      document.querySelectorAll('.rosa-group').forEach(s => { s.hidden = !(current === 'tutti' || s.dataset.g === current); });
      const foot = $('#rosa-foot'); if (foot) foot.hidden = current === 'staff';   // lo staff non ha cammelli
      $('#rosa-list').classList.toggle('single', current !== 'tutti');   // con un ruolo solo il titolo è già nel filtro
    }
    $('#rosa-filters').addEventListener('click', e => {
      const b = e.target.closest('.rf'); if (!b) return;
      current = b.dataset.f;
      try { history.replaceState(null, '', current === 'tutti' ? location.pathname : '#' + current); } catch (err) { /* ignora */ }
      apply();
    });
    addEventListener('hashchange', () => { current = fromHash(); apply(); });

    // tocco / tastiera: gira la scheda
    const flip = el => {
      const on = el.getAttribute('aria-pressed') !== 'true';
      el.setAttribute('aria-pressed', String(on));
      el.querySelector('.pl-back').setAttribute('aria-hidden', String(!on));
      el.querySelector('.pl-front').setAttribute('aria-hidden', String(on));
    };
    const list = $('#rosa-list');
    // foto non trovata: si torna alla mascotte
    list.addEventListener('error', e => {
      const im = e.target;
      if (im.tagName !== 'IMG' || !im.dataset.ph || im.dataset.failed) return;
      if (im.dataset.alt) { const n = im.dataset.alt; im.dataset.alt = ''; im.src = n; return; }   // .png non trovato: prova .jpg
      im.dataset.failed = '1'; im.alt = ''; im.className = 'pl-img ph'; im.src = im.dataset.ph;
    }, true);
    list.addEventListener('click', e => { const f = e.target.closest('.pl-flip'); if (f) flip(f); });
    list.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pl-flip')) { e.preventDefault(); flip(e.target); }
    });
    apply();
  }

  if (FC.ready) start(); else document.addEventListener('fc:ready', start, { once: true });
})();
