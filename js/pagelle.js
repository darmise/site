/* Pagina Pagelle: archivio di tutte le giornate. Dati: data/matches.json (risultati, automatici) + data/pagelle.json (a mano). */
(function () {
  'use strict';
  const FC = window.FC;
  const esc = s => FC.esc(s);
  const $ = (s, r = document) => r.querySelector(s);
  const TOTAL = Number(FC.S.config.totalRounds) || 22;
  const RES = { V: 'Vittoria', N: 'Pareggio', P: 'Sconfitta' };
  const PLACEHOLDER = 'assets/team-placeholder.svg';
  const vote = v => (Math.round(v * 100) / 100).toString().replace('.', ',');
  const n0 = v => (Number.isFinite(+v) ? +v : 0);
  const logo = src => `<span class="badge"><img class="tlogo" src="${esc(src || PLACEHOLDER)}" alt="" width="80" height="80"></span>`;
  const byRound = new Map();

  const roleLabel = r => ({ POR: 'Portiere', CEN: 'Centrale', LAT: 'Laterale', PIV: 'Pivot', UNI: 'Universale' })[r] || r || '';

  function chips(current) {
    $('#pg-rounds').innerHTML = Array.from({ length: TOTAL }, (_, i) => {
      const n = i + 1, m = byRound.get(n);
      const o = m && m.status === 'played' ? FC.outcome(m) : '';
      const has = !!(m && m.pagelle && m.pagelle.length);
      const cls = ['rd', o ? 'o-' + o : '', has ? 'has' : '', !m || m.status !== 'played' ? 'future' : ''].filter(Boolean).join(' ');
      const label = !m || m.status !== 'played' ? 'non ancora giocata' : (has ? 'pagelle disponibili' : 'pagelle in arrivo');
      return `<button type="button" class="${cls}" data-r="${n}" aria-pressed="${n === current}" aria-label="Giornata ${n}: ${label}"><b>${n}</b><i>${o || ''}</i></button>`;
    }).join('');
  }

  function head(m, n) {
    if (!m) return `<div class="pg-match soon"><h2>${n}ª giornata</h2><p>Partita non ancora in calendario.</p></div>`;
    const o = FC.outcome(m);
    const played = m.status === 'played';
    const mid = played ? `<div class="pg-score">${n0(m.homeScore)}<span>-</span>${n0(m.awayScore)}</div>` : `<div class="pg-score vs">VS</div>`;
    return `<div class="pg-match">
      <div class="pg-meta"><span>${esc(m.competition || '')} · ${n}ª giornata</span><span>${esc(FC.fmtDate(m.date))}</span></div>
      <div class="pg-teams">
        <div class="pg-team">${logo(m.homeLogo)}<b>${esc(m.home)}</b></div>
        ${mid}
        <div class="pg-team">${logo(m.awayLogo)}<b>${esc(m.away)}</b></div>
      </div>
      ${o ? `<span class="res res-${o}">${RES[o]}</span>` : ''}
      ${!played ? `<p class="pg-note">Non ancora giocata${m.timeKnown === false ? '' : ': ore ' + esc(FC.fmtTime(m.date))}. Le pagelle arrivano a fine partita.</p>` : ''}
    </div>`;
  }

  function card(r, best) {
    const p = FC.S.players.find(x => x.id === r.playerId) || {};
    const name = p.name || r.name || 'Giocatore';
    const v = Number(r.vote);
    const g = n0(r.goals), t = n0(r.tunnels), sv = n0(r.saves), cn = n0(r.conceded);
    const gk = /^(por|portiere)$/i.test(String(p.role || ''));
    return `<article class="pg-card">
      <div class="pg-vote ${Number.isFinite(v) ? FC.voteClass(v) : ''}" aria-label="Voto ${Number.isFinite(v) ? vote(v) : 'non assegnato'}">${Number.isFinite(v) ? vote(v) : 's.v.'}</div>
      <div class="pg-body">
        <div class="pg-top">
          <h3>${p.number != null ? `<span class="pg-n">${esc(p.number)}</span>` : ''}${esc(name)}</h3>
          ${best ? '<span class="pg-best" title="Migliore in campo">⭐ Migliore</span>' : ''}
        </div>
        <div class="pg-tags">
          ${r.label ? `<span class="pg-adj">${esc(r.label)}</span>` : ''}
          ${p.role ? `<span class="pg-role">${esc(roleLabel(p.role))}</span>` : ''}
        </div>
        <div class="pg-stats">${gk
          ? `<span class="${sv ? 'on' : ''}" title="Parate">🧤 <b>${sv}</b> ${sv === 1 ? 'parata' : 'parate'}</span>
             <span class="${cn ? 'on bad' : ''}" title="Gol subiti">🥅 <b>${cn}</b> ${cn === 1 ? 'gol subito' : 'gol subiti'}</span>`
          : `<span class="${g ? 'on' : ''}" title="Gol fatti">⚽ <b>${g}</b> gol</span>
             <span class="${t ? 'on bad' : ''}" title="Tunnel subiti">🕳️ <b>${t}</b> tunnel</span>`}</div>
        ${r.comment ? `<p class="pg-comment">“${esc(r.comment)}”</p>` : ''}
      </div>
    </article>`;
  }

  function detail(n) {
    const m = byRound.get(n);
    const list = (m && m.pagelle ? m.pagelle.slice() : []).sort((a, b) => (Number(b.vote) || 0) - (Number(a.vote) || 0));
    let html = head(m, n);
    if (m && m.title) html += `<h2 class="pg-title">${esc(m.title)}</h2>`;
    if (m && m.report) html += `<p class="pg-report">${esc(m.report)}</p>`;
    if (list.length) {
      const voted = list.filter(r => Number.isFinite(Number(r.vote)));
      const avg = voted.length ? voted.reduce((s, r) => s + Number(r.vote), 0) / voted.length : null;
      const top = voted.length ? Number(voted[0].vote) : null;
      html += `<div class="section-head"><h2>Le pagelle</h2><span class="muted">${avg != null ? 'Media squadra ' + vote(Math.round(avg * 100) / 100) : ''}</span></div>
        <div class="pg-grid">${list.map((r, i) => card(r, top != null && i === 0 && list.filter(x => Number(x.vote) === top).length === 1)).join('')}</div>`;
    } else if (m && m.status === 'played') {
      html += '<p class="empty">Le pagelle di questa partita sono in arrivo. Passa a trovarci dopo il fischio finale!</p>';
    }
    $('#pg-detail').innerHTML = html;
  }

  function start() {
    FC.S.matches.forEach(m => { if (m.round) byRound.set(m.round, m); });
    const withPag = [...byRound.values()].filter(m => m.pagelle && m.pagelle.length).map(m => m.round);
    const pl = FC.played();
    const fromHash = () => { const r = /^#g(\d+)$/.exec(location.hash); const n = r ? +r[1] : 0; return n >= 1 && n <= TOTAL ? n : 0; };
    let current = fromHash() || (withPag.length ? Math.max(...withPag) : (pl[0] ? pl[0].round : 1));

    $('#pg-sub').textContent = `Stagione ${FC.S.config.season || ''} · ${withPag.length} ${withPag.length === 1 ? 'giornata' : 'giornate'} su ${TOTAL} con le pagelle`;
    const show = (n, scroll) => { current = n; chips(n); detail(n); if (scroll) $('#pg-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $('#pg-rounds').addEventListener('click', e => {
      const b = e.target.closest('.rd'); if (!b) return;
      const n = +b.dataset.r;
      try { history.replaceState(null, '', '#g' + n); } catch (err) { /* ignora */ }
      show(n, false);
    });
    addEventListener('hashchange', () => { const n = fromHash(); if (n) show(n, false); });
    show(current, false);
  }

  if (FC.ready) start(); else document.addEventListener('fc:ready', start, { once: true });
})();
