(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAV = [
    ['index.html', 'Home', 'home'],
    ['rosa.html', 'Rosa', 'rosa'],
    ['pagelle.html', 'Pagelle', 'pagelle']
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
  // L'ordine è quello delle giornate (1, 2, 3...): la prossima partita è la prima giornata ancora da giocare.
  const byRound = (a, b) => (a.round || 0) - (b.round || 0);
  const played = () => S.matches.filter(m => m.status === 'played').sort((a, b) => byRound(b, a));
  const upcoming = () => S.matches.filter(m => m.status === 'scheduled').sort(byRound);
  // I dati delle partite arrivano da Tuttocampo (data/matches.json, aggiornato in automatico);
  // pagelle e articoli scritti a mano stanno in data/pagelle.json, agganciati all'id della partita.
  const mergePagelle = (matches, extra) => matches.map(m => Object.assign({ pagelle: [], title: '', report: '' }, m, (extra || {})[m.id] || {}));
  async function refreshData() {
    const [matches, live, extra, manual] = await Promise.all([
      getJSON('data/matches.json'), getJSON('data/live.json'),
      getJSON('data/pagelle.json').catch(() => ({})), getJSON('data/manual.json').catch(() => [])
    ]);
    // data/manual.json (facoltativo): partite scritte a mano, sovrascrivono quelle automatiche con lo stesso id
    const byId = new Map(matches.map(m => [m.id, m]));
    (manual || []).forEach(x => byId.set(x.id, Object.assign({}, byId.get(x.id) || {}, x)));
    S.matches = mergePagelle([...byId.values()].sort(byRound), extra);
    S.live = live;
  }
  const PLACEHOLDER = 'assets/team-placeholder.svg';
  // logo dentro un "badge" tondo bianco; se non si carica, compare uno scudo neutro
  const logo = src => `<span class="badge"><img class="tlogo" src="${esc(src || PLACEHOLDER)}" alt="" width="80" height="80"></span>`;
  document.addEventListener('error', e => {
    const i = e.target;
    if (i && i.tagName === 'IMG' && i.classList.contains('tlogo') && !i.dataset.fb) { i.dataset.fb = '1'; i.src = PLACEHOLDER; }
  }, true);
  const timeLabel = m => (m.timeKnown === false ? 'orario da definire' : 'ore ' + fmtTime(m.date));

  /* ---------- contatori: utenti online e visite del mese (facoltativi) ----------
     Attivi solo se in data/config.json c'è  "analytics": { "counters": { "databaseURL": "https://...firebasedatabase.app" } }.
     Usano un Firebase Realtime Database (vedi README): nessun cookie, nessun dato personale, solo un codice casuale
     per sessione e due numeri. */
  const STATS = { online: null, month: null };
  function paintStats() {
    const f = document.querySelector('#site-footer .wrap');
    if (!f || STATS.online == null) return;
    let el = f.querySelector('.stats-live');
    if (!el) { el = document.createElement('span'); el.className = 'stats-live'; f.appendChild(el); }
    el.innerHTML = `<span class="on-dot"></span>${STATS.online} ${STATS.online === 1 ? 'utente online' : 'utenti online'}<span class="sep">·</span>${STATS.month} ${STATS.month === 1 ? 'visita' : 'visite'} questo mese`;
  }
  function startCounters() {
    const url = (((S.config || {}).analytics || {}).counters || {}).databaseURL;
    if (!url || window.__counters || /^(localhost|127\.|\[::1\])/.test(location.hostname) && !window.__countersLocal) return;
    window.__counters = true;                    // renderChrome gira ogni minuto: si avvia una volta sola
    const base = url.replace(/\/+$/, '');
    const d = new Date(), month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    let id = ''; try { id = sessionStorage.getItem('fc_sid') || ''; } catch (e) { /* ignora */ }
    if (!id) { id = Math.random().toString(36).slice(2, 12).padEnd(8, 'x'); try { sessionStorage.setItem('fc_sid', id); } catch (e) { /* ignora */ } }
    const api = (path, opt) => fetch(`${base}/${path}.json`, opt).then(r => r.ok ? r.json() : Promise.reject(r.status));
    const SV = { '.sv': 'timestamp' };
    const beat = async () => {
      try {
        let counted = false; try { counted = sessionStorage.getItem('fc_m') === month; } catch (e) { /* ignora */ }
        if (!counted) {                          // una visita per sessione del browser
          await api(`visits/${month}`, { method: 'PUT', body: JSON.stringify({ '.sv': { increment: 1 } }) });
          try { sessionStorage.setItem('fc_m', month); } catch (e) { /* ignora */ }
        }
        await api(`online/${id}`, { method: 'PUT', body: JSON.stringify(SV) });
        const [all, m] = await Promise.all([api('online'), api(`visits/${month}`)]);
        const mine = (all || {})[id], list = Object.entries(all || {});
        STATS.online = Math.max(1, list.filter(([, t]) => typeof t === 'number' && t >= mine - 75000).length);
        STATS.month = m || 0;
        paintStats();
        // pulizia: chi è sparito da più di 10 minuti viene tolto (al massimo 5 alla volta)
        list.filter(([, t]) => typeof t === 'number' && t < mine - 600000).slice(0, 5)
          .forEach(([k]) => fetch(`${base}/online/${k}.json`, { method: 'DELETE' }).catch(() => {}));
      } catch (e) { /* i contatori non devono mai rompere il sito */ }
    };
    beat();
    setInterval(() => { if (!document.hidden) beat(); }, 30000);
    addEventListener('pagehide', () => { fetch(`${base}/online/${id}.json`, { method: 'DELETE', keepalive: true }).catch(() => {}); });
  }

  /* ---------- layout comune ---------- */
  function renderChrome() {
    const links = NAV.map(([href, label, key]) => {
      const dot = key === 'live' && (S.live.active || S.matches.some(m => m.status === 'live')) ? '<span class="dot" title="In diretta"></span>' : '';
      return `<a href="${href}" class="${key === page ? 'on' : ''}">${label}${dot}</a>`;
    }).join('');
    $('#site-header').innerHTML = `
      <div class="wrap">
        <a class="brand" href="index.html"><img class="logo" src="assets/logo.png" alt="" width="38" height="44"><b>${esc(S.config.teamName)}</b></a>
        <button class="burger" aria-label="Apri il menu" aria-expanded="false">☰</button>
        <nav class="nav" id="nav">${links}</nav>
      </div>`;
    $('#site-footer').innerHTML = `
      <div class="wrap">
        <span>© ${new Date().getFullYear()} ${esc(S.config.teamName)} · Blog dei tifosi, non ufficiale</span>
        <span>Stagione ${esc(S.config.season || '')} · Risultati: <a href="https://www.tuttocampo.it/Basilicata/CalcioA5Dilettanti/GironeBPotenza/Risultati" target="_blank" rel="noopener">Tuttocampo.it</a></span>
      </div>`;
    paintStats();
    startCounters();
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
  const TWO_DAYS = 48 * 36e5;
  const timers = {};

  // Il contatore è la prima giornata ancora da giocare (o in corso).
  //  - se manca meno di 2 giorni (o è in corso) diventa la partita ATTUALE e la "prossima gara" è la giornata dopo;
  //  - altrimenti l'attuale non c'è: in alto l'ultimo risultato e in "prossima gara" la giornata del contatore.
  function homeState() {
    const pend = S.matches.filter(m => m.status === 'live' || m.status === 'scheduled').sort(byRound);
    const counter = pend[0] || null;
    const soon = counter && (counter.status === 'live' || (counter.date && new Date(counter.date) - Date.now() < TWO_DAYS));
    return { current: soon ? counter : null, next: soon ? (pend[1] || null) : counter, last: played()[0] || null,
      // finito solo se l'ultima giornata (22) risulta giocata: con dati incompleti non lo si può dire
      ended: !pend.length && !!played()[0] && played()[0].round >= (S.config.totalRounds || 22) };
  }

  function startCountdown(key, elId, date) {
    clearInterval(timers[key]);
    const tick = () => {
      const cd = document.getElementById(elId);
      if (!cd) return;
      let diff = new Date(date) - Date.now();
      if (diff <= 0) { cd.innerHTML = `<b class="now">${diff < -4 * 36e5 ? 'In attesa del risultato' : 'Si gioca!'}</b>`; return; }
      const d = Math.floor(diff / 864e5); diff -= d * 864e5;
      const h = Math.floor(diff / 36e5); diff -= h * 36e5;
      const mi = Math.floor(diff / 6e4);
      cd.innerHTML = [[d, 'giorni'], [h, 'ore'], [mi, 'min']].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
    };
    tick(); timers[key] = setInterval(tick, 30000);
  }

  // campo disegnato con il CSS (non con un'immagine che si deforma): bordo, linea di metà campo e due aree
  const COURT = '<div class="court" aria-hidden="true"><i class="pa l"></i><i class="pa r"></i></div>';
  const teamBlock = (m, side) => {
    const name = side === 'home' ? m.home : m.away;
    const us = name === S.config.teamName;
    return `<div class="mc-team${us ? ' is-us' : ''}">
      ${logo(side === 'home' ? m.homeLogo : m.awayLogo)}
      <div class="mc-name">${esc(name)}</div>
      <span class="mc-tag">${side === 'home' ? 'Casa' : 'Trasferta'}</span>
    </div>`;
  };
  const scoreBlock = m => `<div class="mc-score" aria-label="Risultato ${esc(m.homeScore ?? 0)} a ${esc(m.awayScore ?? 0)}">
      <b class="${m.homeScore < m.awayScore ? 'dim' : ''}">${esc(m.homeScore ?? 0)}</b><i>:</i><b class="${m.awayScore < m.homeScore ? 'dim' : ''}">${esc(m.awayScore ?? 0)}</b>
    </div>`;
  const dayLabel = d => {
    const t = new Date(d), n = new Date(); n.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - n) / 864e5);
    return diff === 0 ? 'oggi' : diff === 1 ? 'domani' : t.toLocaleDateString('it-IT', { weekday: 'long' });
  };
  const stage = (m, center) => `<div class="mc-stage">${COURT}<div class="mc-grid">${teamBlock(m, 'home')}<div class="mc-center">${center}</div>${teamBlock(m, 'away')}</div></div>`;
  const RES = { V: 'Vittoria', N: 'Pareggio', P: 'Sconfitta' };
  const sub = m => [esc(m.competition), m.round ? m.round + 'ª giornata' : '', fmtDate(m.date)].filter(Boolean).join(' · ');

  function renderHero() {
    const el = $('#hero-content');
    const { current, last } = homeState();
    clearInterval(timers.hero);

    if (current && current.status === 'live') {
      el.innerHTML = `<div class="mcard">
        <div class="mc-meta"><span class="eyebrow"><span class="live-pill">● LIVE</span> Partita in corso</span><span class="sub">${sub(current)}</span></div>
        ${stage(current, scoreBlock(current))}</div>`;
      return;
    }
    if (current) {
      const time = current.timeKnown === false ? '' : fmtTime(current.date);
      el.innerHTML = `<div class="mcard">
        <div class="mc-meta"><span class="eyebrow">Partita attuale</span><span class="sub">${sub(current)}</span></div>
        ${stage(current, `<div class="mc-vs"><small>${time ? dayLabel(current.date) : 'orario da definire'}</small>${time || 'VS'}</div>`)}
        <div class="mc-foot"><div class="countdown dark" id="cd-hero"></div></div></div>`;
      startCountdown('hero', 'cd-hero', current.date);
      return;
    }
    if (!last) {
      el.innerHTML = `<div class="mcard"><h1>${esc(S.config.teamName)}</h1><p>${esc(S.config.tagline)}</p></div>`;
      return;
    }
    const o = outcome(last);
    el.innerHTML = `<div class="mcard">
      <div class="mc-meta"><span class="eyebrow">Ultimo risultato</span><span class="sub">${sub(last)}</span></div>
      ${stage(last, scoreBlock(last) + (o ? `<span class="res res-${o}">${RES[o]}</span>` : ''))}
      <div class="mc-foot"><a class="btn" href="pagelle.html#${last.id}">Leggi le pagelle</a></div></div>`;
  }

  function renderNext() {
    const el = $('#next-match');
    const { next, ended } = homeState();
    clearInterval(timers.next);
    if (!next) {
      el.innerHTML = `<p class="empty">${ended ? 'Il campionato è terminato: grazie per aver tifato con noi!' :
        'La prossima gara comparirà qui appena il calendario sarà aggiornato.'}</p>`;
      return;
    }
    const home = next.home === S.config.teamName;
    const d = next.date ? new Date(next.date) : null;
    const dateTile = d ? `<div class="nm-date"><span class="d">${d.getDate()}</span>
        <span class="m">${d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')}</span>
        <small>${d.toLocaleDateString('it-IT', { weekday: 'long' })}</small></div>`
      : `<div class="nm-date"><span class="d">?</span><span class="m">data</span><small>da definire</small></div>`;
    const team = (n, src) => `<div class="nm-team${n === S.config.teamName ? ' is-us' : ''}">${logo(src)}<span>${esc(n)}</span></div>`;
    const time = next.date && next.timeKnown !== false ? fmtTime(next.date) : '';
    el.innerHTML = `${dateTile}
      <div class="nm-body">
        <div class="nm-teams">${team(next.home, next.homeLogo)}<span class="nm-vs">vs</span>${team(next.away, next.awayLogo)}</div>
        <ul class="nm-tags">
          <li>${esc(next.competition)}</li>
          ${next.round ? `<li>${next.round}ª giornata</li>` : ''}
          <li class="${home ? 'tag-home' : 'tag-away'}">${home ? 'In casa' : 'In trasferta'}</li>
          <li>${time ? 'Inizio ore ' + time : 'Orario da definire'}</li>
        </ul>
      </div>
      <div class="countdown" id="cd"></div>`;
    if (next.date) startCountdown('next', 'cd', next.date);
  }

  function renderAbout() {
    $('#about-text').textContent = S.config.about || '';
    const note = $('#fun-note');
    if (note) {
      const txt = S.config.disclaimer === undefined
        ? 'Questo sito è fatto solo per divertirci tra tifosi. Pagelle, statistiche, battute e soprannomi sono scherzosi e inventati, e non vogliono offendere nessuno: se qualcosa non ti fa ridere, prendila con spirito. 😄'
        : S.config.disclaimer;
      note.innerHTML = txt ? `<span class="fun-ico" aria-hidden="true">🎭</span><p>${esc(txt)}</p>` : '';
      note.hidden = !txt;
    }
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
