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
  const ALIAS = { por: 'POR', portiere: 'POR', cen: 'CEN', centrale: 'CEN', lat: 'LAT', laterale: 'LAT', piv: 'PIV', pivot: 'PIV', uni: 'UNI', universale: 'UNI' };
  const roleOf = p => ALIAS[String(p.role || '').trim().toLowerCase()] || '';
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
    bestemmie: v => tier(v, [[0, 'Zen assoluto: monaco in panchina'], [20, 'Si trattiene, ma si vede'], [60, 'Tipico stress da panchina'], [Infinity, 'Record da palazzetto: il cielo trema']])
  };
  const stat = (emoji, label, value, note) =>
    `<div class="st"><span class="st-ico" aria-hidden="true">${emoji}</span>
      <div class="st-txt"><span class="st-lab">${label}</span><b class="st-val">${value}</b><span class="st-note">${note}</span></div></div>`;

  const splitName = full => {
    const parts = String(full || '').trim().split(/\s+/);
    return { first: parts.length > 1 ? parts[0] : '', last: parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || '') };
  };

  function card(p, o) {
    // o: { kind: 'player' | 'staff', roleKey, tag }
    const { first, last } = splitName(p.name);
    const staff = o.kind === 'staff';
    const ph = staff ? PH_STAFF : PH_PLAYER;
    const photo = p.photo
      ? `<img class="pl-img real" src="${esc(p.photo)}" alt="Foto di ${esc(p.name)}" loading="lazy" width="320" height="400">`
      : `<img class="pl-img ph" src="${ph}" alt="" loading="lazy" width="320" height="401">`;
    const big = staff ? '<span class="pl-num staff" aria-label="Staff">STAFF</span>' : `<span class="pl-num" aria-label="Numero ${esc(p.number)}">${esc(p.number)}</span>`;
    const stats = staff
      ? stat('🤬', 'Bestemmie', num(p.bestemmie), NOTE.bestemmie(num(p.bestemmie)))
      : stat('🐪', 'Valore', `${num(p.camels)} <small>${pl(num(p.camels), 'cammello', 'cammelli')}</small>`, NOTE.camels(num(p.camels))) +
        stat('🕳️', 'Tunnel subiti', num(p.tunnels), NOTE.tunnels(num(p.tunnels))) +
        stat('⚽', 'Gol fatti', num(p.goals), NOTE.goals(num(p.goals)));
    const status = STATUS[p.status] ? `<p class="bk-status st-${esc(p.status)}">${STATUS[p.status]}${p.statusNote ? ' · ' + esc(p.statusNote) : ''}</p>` : '';
    return `<article class="pl-card${staff ? ' is-staff' : ''}" data-role="${o.roleKey}">
      <div class="pl-flip" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(p.name)}: tocca per vedere le statistiche">
        <div class="pl-face pl-front">
          <div class="pl-photo">${big}${photo}<span class="pl-tag">${esc(o.tag)}</span></div>
          <div class="pl-info"><h3 class="pl-name">${first ? `<small>${esc(first)}</small>` : ''}${esc(last)}</h3></div>
        </div>
        <div class="pl-face pl-back" aria-hidden="true">
          <div class="bk-head"><b>${esc(p.name)}</b><span>${esc(o.tag)}</span></div>
          <div class="bk-stats">${stats}</div>
          ${status}
        </div>
      </div>
    </article>`;
  }

  async function start() {
    const players = (FC.S.players || []).slice();
    let staff = [];
    try { staff = await FC.getJSON('data/staff.json'); } catch (e) { staff = []; }

    const byRole = key => players.filter(p => roleOf(p) === key).sort((a, b) => (a.number || 0) - (b.number || 0));
    const groups = ROLES.map(r => ({ ...r, kind: 'player', list: byRole(r.key) })).filter(g => g.list.length);
    const others = players.filter(p => !roleOf(p));       // ruoli non previsti: finiscono in "Altri"
    if (others.length) groups.push({ key: 'ALT', plural: 'Altri', single: 'Giocatore', slug: 'altri', kind: 'player', list: others });
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
        <div class="pl-grid">${g.list.map(p => card(p, { kind: g.kind, roleKey: g.key, tag: g.kind === 'staff' ? (p.role || 'Staff') : g.single })).join('')}</div>
      </section>`).join('');

    function apply() {
      document.querySelectorAll('.rf').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === current)));
      document.querySelectorAll('.rosa-group').forEach(s => { s.hidden = !(current === 'tutti' || s.dataset.g === current); });
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
    list.addEventListener('click', e => { const f = e.target.closest('.pl-flip'); if (f) flip(f); });
    list.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pl-flip')) { e.preventDefault(); flip(e.target); }
    });
    apply();
  }

  if (FC.ready) start(); else document.addEventListener('fc:ready', start, { once: true });
})();
