(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAV = [
    ['index.html', 'Home', 'home'],
    ['live.html', 'Live', 'live'],
    ['pagelle.html', 'Pagelle', 'pagelle'],
    ['rosa.html', 'Rosa', 'rosa'],
    ['community.html', 'Community', 'community']
  ];
  const page = document.body.dataset.page;

  const getJSON = async url => {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' → ' + r.status);
    return r.json();
  };

  const S = { config: {}, players: [], matches: [], live: { active: false } };

  /* ---------- helper ---------- */
  const fmtDate = d => new Date(d).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtTime = d => new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const voteClass = v => v >= 7.5 ? 'v-top' : v >= 6.5 ? 'v-good' : v >= 6 ? 'v-mid' : 'v-low';
  const fmtVote = v => (Math.round(v * 2) / 2).toString().replace('.', ',');
  const ours = m => (m.home === S.config.teamName ? 'home' : m.away === S.config.teamName ? 'away' : null);
  const outcome = m => {
    const side = ours(m);
    if (!side || m.homeScore == null) return '';
    const a = side === 'home' ? m.homeScore : m.awayScore;
    const b = side === 'home' ? m.awayScore : m.homeScore;
    return a > b ? 'V' : a < b ? 'P' : 'N';
  };
  const playerName = id => (S.players.find(p => p.id === id) || {}).name || 'Giocatore';
  const playerRole = id => (S.players.find(p => p.id === id) || {}).role || '';
  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
  const played = () => S.matches.filter(m => m.status === 'played').sort((a, b) => byDate(b, a));
  const upcoming = () => S.matches.filter(m => m.status === 'scheduled').sort(byDate);
  // I dati delle partite arrivano da Tuttocampo (data/matches.json, aggiornato in automatico);
  // pagelle e articoli scritti a mano stanno in data/pagelle.json, agganciati all'id della partita.
  const mergePagelle = (matches, extra) => matches.map(m => Object.assign({ pagelle: [], title: '', report: '' }, m, (extra || {})[m.id] || {}));
  async function refreshData() {
    const [matches, live, extra] = await Promise.all([
      getJSON('data/matches.json'), getJSON('data/live.json'), getJSON('data/pagelle.json').catch(() => ({}))
    ]);
    S.matches = mergePagelle(matches, extra);
    S.live = live;
  }
  const timeLabel = m => (m.timeKnown === false ? 'orario da definire' : 'ore ' + fmtTime(m.date));

  /* ---------- layout comune ---------- */
  function renderChrome() {
    const links = NAV.map(([href, label, key]) => {
      const dot = key === 'live' && S.live.active ? '<span class="dot" title="In diretta"></span>' : '';
      return `<a href="${href}" class="${key === page ? 'on' : ''}">${label}${dot}</a>`;
    }).join('');
    $('#site-header').innerHTML = `
      <div class="wrap">
        <a class="brand" href="index.html"><img class="logo" src="assets/logo.svg" alt="" width="38" height="44"><b>${esc(S.config.teamName)}</b></a>
        <button class="burger" aria-label="Apri il menu" aria-expanded="false">☰</button>
        <nav class="nav" id="nav">${links}</nav>
      </div>`;
    $('#site-footer').innerHTML = `
      <div class="wrap">
        <span>© ${new Date().getFullYear()} ${esc(S.config.teamName)} · Blog dei tifosi, non ufficiale</span>
        <span>Stagione ${esc(S.config.season || '')} · Risultati: <a href="https://www.tuttocampo.it/Basilicata/CalcioA5Dilettanti/GironeBPotenza/Risultati" target="_blank" rel="noopener">Tuttocampo.it</a></span>
      </div>`;
    const burger = $('.burger'), nav = $('#nav');
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
    });
    if (S.config.accent) document.documentElement.style.setProperty('--accent', S.config.accent);
    if (S.config.accent2) document.documentElement.style.setProperty('--blue', S.config.accent2);
    document.title = (page === 'home' ? '' : document.title.split(' · ')[0] + ' · ') + S.config.teamName;
  }

  /* ---------- HOME ---------- */
  function renderHero() {
    const el = $('#hero-content');
    const lv = S.live;
    if (lv.active) {
      const st = { LIVE: 'Partita in corso', pre: 'Prepartita', '1T': "1° tempo", HT: 'Intervallo', '2T': "2° tempo", ET: 'Supplementari', FT: 'Finale' }[lv.status] || '';
      const min = ['1T', '2T', 'ET'].includes(lv.status) ? ` · ${esc(lv.minute)}'` : '';
      el.innerHTML = `
        <div class="eyebrow"><span class="live-pill">● LIVE</span> ${esc(lv.competition)}</div>
        <div class="scoreboard">
          <div class="t">${esc(lv.home)}</div>
          <div class="s">${esc(lv.homeScore)} – ${esc(lv.awayScore)}</div>
          <div class="t">${esc(lv.away)}</div>
        </div>
        <div class="meta">${st}${min}</div>
        <a class="btn" href="live.html">Segui la diretta</a>`;
      return;
    }
    const last = played()[0];
    if (!last) {
      el.innerHTML = `<h1>${esc(S.config.teamName)}</h1><p>${esc(S.config.tagline)}</p>`;
      return;
    }
    el.innerHTML = `
      <div class="eyebrow">Ultimo risultato · ${esc(last.competition)}${last.round ? ' · ' + last.round + 'ª giornata' : ''} · ${fmtDate(last.date)}</div>
      <div class="scoreboard">
        <div class="t">${esc(last.home)}</div>
        <div class="s">${esc(last.homeScore)} – ${esc(last.awayScore)}</div>
        <div class="t">${esc(last.away)}</div>
      </div>
      ${last.title ? `<p>${esc(last.title)}</p>` : ''}
      <a class="btn" href="pagelle.html">Leggi le pagelle</a>
      <a class="btn ghost" href="live.html">Vai alla diretta</a>`;
  }

  function renderNext() {
    const el = $('#next-match');
    const m = upcoming()[0];
    if (!m) { el.innerHTML = '<p class="empty">Nessuna partita in programma.</p>'; return; }
    const where = m.home === S.config.teamName ? 'In casa' : 'In trasferta';
    el.innerHTML = `
      <div>
        <div class="muted">${esc(m.competition)} · ${where}</div>
        <div class="vs">${esc(m.home)} vs ${esc(m.away)}</div>
        <div class="muted">${m.round ? m.round + 'ª giornata · ' : ''}${fmtDate(m.date)} · ${timeLabel(m)}</div>
      </div>
      <div class="countdown" id="cd"></div>`;
    clearInterval(cdTimer);
    const tick = () => {
      let diff = new Date(m.date) - Date.now();
      const cd = $('#cd');
      if (!cd) return;
      if (diff <= 0) { cd.innerHTML = '<b style="font:700 22px var(--display)">Si gioca!</b>'; return; }
      const d = Math.floor(diff / 864e5); diff -= d * 864e5;
      const h = Math.floor(diff / 36e5); diff -= h * 36e5;
      const mi = Math.floor(diff / 6e4);
      cd.innerHTML = [[d, 'giorni'], [h, 'ore'], [mi, 'min']].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
    };
    tick(); cdTimer = setInterval(tick, 30000);
  }
  let cdTimer;

  function renderAbout() {
    $('#about-text').textContent = S.config.about || '';
    $('#goal-text').textContent = S.config.goal || '';
    $('#goal-list').innerHTML = (S.config.goalPoints || []).map(g =>
      `<li><span class="ico">${esc(g.ico)}</span><span><b>${esc(g.t)}</b><br><small class="muted">${esc(g.d)}</small></span></li>`).join('');
  }

  function renderHome() {
    renderAbout(); renderHero(); renderNext();
    // ogni minuto rilegge risultati e diretta, così la pagina si aggiorna senza ricaricarla
    setInterval(async () => {
      try { await refreshData(); renderHero(); renderNext(); renderChrome(); } catch (e) { /* ignora */ }
    }, 60000);
  }

  /* ---------- avvio ---------- */
  async function init() {
    try {
      const [config, players] = await Promise.all([getJSON('data/config.json'), getJSON('data/players.json')]);
      Object.assign(S, { config, players });
      await refreshData();
    } catch (e) {
      const m = $('#app');
      if (m) m.innerHTML = `<div class="wrap"><div class="card section"><h3>Impossibile caricare i dati</h3>
        <p>Se apri il file direttamente dal disco il browser blocca la lettura dei JSON. Avvia un piccolo server locale: <code>python3 -m http.server</code></p></div></div>`;
      console.error(e);
      return;
    }
    renderChrome();
    if (page === 'home') renderHome();
    window.FC.ready = true;
    document.dispatchEvent(new Event('fc:ready'));
  }
  window.FC = { S, esc, getJSON, fmtDate, fmtTime, voteClass, fmtVote, outcome, playerName, playerRole, played, upcoming };
  init();
})();
