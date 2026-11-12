/* Mascotte ufficiale: la torre rossoblù. Tre espressioni (contenta, normale, triste) che dipendono dall'ultimo risultato. */
(function () {
  'use strict';
  const FC = window.FC;
  console.info('[mascotte] versione 5: umore fisso sull\'ultima partita giocata');
  // immagini (PNG con sfondo trasparente) per ogni umore; "wow" usa quella contenta
  const IMG = {
    happy: 'assets/mascotte-happy.png',
    neutral: 'assets/mascotte-neutral.png',
    sad: 'assets/mascotte-sad.png'
  };
  const FACE = { happy: 'happy', wow: 'happy', neutral: 'neutral', sad: 'sad' };

  // frasi: calcio a 5 (5 in campo, pivot, tempo effettivo, falli cumulati, tiri liberi, palazzetto)
  const JOKES = [
    'Il mio modulo preferito? Il 3-1: tre punti e un pivot che la mette dentro! ⚽',
    'Nel calcio a 5 il tempo è effettivo: il cronometro si ferma, il mio appetito mai. 🍕',
    'Il pivot gioca spalle alla porta ed è l\'unico che segna senza guardare dove tira.',
    'Cinque in campo e rotazioni continue: io mi stanco solo a guardarli dalla panchina! 🔄',
    'Sesto fallo di squadra: tiro libero e silenzio in palazzetto. Persino io smetto di cantare. 🤫',
    'Il pallone del futsal rimbalza poco, il mio entusiasmo molto! ⚽',
    'Quattro secondi per rimettere in gioco: io ne impiego cinque solo per scegliere la sciarpa. 🧣',
    'Time-out! Il mister parla ai ragazzi, io approfitto per riprendere fiato. ⏱️',
    'Una torre non crolla mai: al massimo pareggia. 🏰',
    'Il palazzetto è l\'unico stadio dove si sente il fischio delle scarpe sul parquet. 🏟️',
    'L cavadd bun s vern alla fin. 🐎',
    'Racet a pall allu pivot e sciat a calcià. ⚽'  
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } }
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function start() {
    const S = FC.S;
    const name = S.config.mascot || 'la Torre';
    Object.values(IMG).forEach(src => { const i = new Image(); i.src = src; });   // pronte prima di cambiare espressione

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="mascot" id="mascot" role="complementary" aria-label="Mascotte ${name}">
        <div class="m-bubble" id="m-bubble" role="status" aria-live="polite" hidden></div>
        <div class="m-menu" id="m-menu" hidden>
          <button type="button" data-a="joke">😂 Battuta</button>
          <button type="button" data-a="predict">🔮 Pronostico</button>
          <button type="button" data-a="cheer">📣 Coro <span id="m-cnt"></span></button>
          <button type="button" data-a="hide" aria-label="Nascondi la mascotte">✕</button>
        </div>
        <button type="button" class="m-body" id="m-body" aria-label="Parla con ${name}, la mascotte">
          <img id="m-img" src="${IMG.neutral}" alt="" width="320" height="401" decoding="async">
        </button>
      </div>
      <button type="button" class="m-open" id="m-open" aria-label="Mostra la mascotte" hidden><img src="assets/mascotte-icona.png" alt="" width="40" height="40"></button>`;
    document.body.append(...root.children);

    const mascot = $('#mascot'), bubble = $('#m-bubble'), menu = $('#m-menu'), body = $('#m-body'), openBtn = $('#m-open'), img = $('#m-img');
    let timer, clicks = 0, cheers = +store.get('fc_cori') || 0;
    const cnt = $('#m-cnt');
    const showCount = () => { cnt.textContent = cheers ? '(' + cheers + ')' : ''; };
    showCount();

    function setMood(m) {
      const face = FACE[m] || 'neutral';
      const src = IMG[face];
      if (!img.src.endsWith(src)) img.src = src;
      body.dataset.mood = m;
    }
    // umore a riposo = ultimo risultato: vittoria contento, pareggio normale, sconfitta triste
    const moodNow = () => {
      const last = FC.played()[0], o = last ? FC.outcome(last) : '';
      return o === 'V' ? 'happy' : o === 'P' ? 'sad' : 'neutral';
    };
    let baseMood = moodNow();
    setMood(baseMood);
    setInterval(() => {                      // i dati si rileggono ogni minuto: se arriva un nuovo risultato l'umore cambia
      const m = moodNow();
      if (m !== baseMood) { baseMood = m; if (bubble.hidden) setMood(baseMood); }
    }, 60000);

    // L'espressione NON si tocca qui: dipende solo dall'ultima partita giocata (vedi baseMood) e cambia
    // soltanto quando arriva un nuovo risultato. Il parametro "mood" resta solo per compatibilità e viene ignorato.
    function speak(text, mood, link) {
      bubble.textContent = text;
      if (link) {
        const a = document.createElement('a');
        a.href = link.href; a.textContent = link.text; a.className = 'm-link';
        bubble.append(' ', a);
      }
      bubble.hidden = false;
      body.classList.remove('jump'); void body.offsetWidth;
      if (!reduce) body.classList.add('jump');
      clearTimeout(timer);
      timer = setTimeout(() => { bubble.hidden = true; }, 8000);
    }

    /* ---- frasi che dipendono dal sito ---- */
    function contextual() {
      const out = [];
      const lv = S.live;
      if (lv && lv.active) {
        out.push({ t: `Siamo in diretta: ${lv.home} ${lv.homeScore}-${lv.awayScore} ${lv.away}!`, m: 'wow' });
      }
      const last = FC.played()[0];
      if (last) {
        const o = FC.outcome(last);
        const opp = last.home === S.config.teamName ? last.away : last.home;
        const sc = `${last.homeScore}-${last.awayScore}`;
        if (o === 'V') out.push({ t: `Dopo il ${sc} con ${opp} ho cantato fino a tardi! 🎉`, m: 'happy' });
        if (o === 'N') out.push({ t: `Il ${sc} con ${opp} è un punto che vale, ma io volevo i tre! 😤`, m: 'neutral' });
        if (o === 'P') out.push({ t: `Il ${sc} con ${opp} fa male, ma le torri non crollano: si riparte! 💪`, m: 'sad' });
      }
      const next = FC.upcoming()[0];
      if (next && next.date) {
        const days = Math.ceil((new Date(next.date) - Date.now()) / 864e5);
        const opp = next.home === S.config.teamName ? next.away : next.home;
        out.push({ t: days > 0 ? `Mancano ${days} giorni a ${opp}. Intanto preparo la sciarpa! 🧣` : `Oggi si gioca con ${opp}! Forza ragazzi!`, m: 'wow' });
      }
      return out;
    }

    function joke() { speak(pick(JOKES), baseMood); }

    /* Pronostico: calcolato (non a caso) dalla media gol delle nostre partite giocate, con un piccolo vantaggio per chi gioca in casa.
       Una volta fatto per una partita viene ricordato: i click successivi (anche dopo aver ricaricato la pagina) danno sempre lo stesso. */
    function forecast(m) {
      const us = S.config.teamName, homeUs = m.home === us;
      const games = FC.played().filter(g => g.homeScore != null && (g.home === us || g.away === us));
      const PRIOR = 3.5, K = 2;              // media tipica di gol a squadra nel calcio a 5, pesata come 2 partite
      let gf = PRIOR * K, ga = PRIOR * K;
      games.forEach(g => { const h = g.home === us; gf += h ? g.homeScore : g.awayScore; ga += h ? g.awayScore : g.homeScore; });
      gf /= games.length + K; ga /= games.length + K;
      const ours = Math.max(0, Math.round(gf + (homeUs ? .25 : -.25)));
      const theirs = Math.max(0, Math.round(ga + (homeUs ? -.25 : .25)));
      return { ours, theirs, n: games.length };
    }
    function predict() {
      const m = FC.upcoming()[0];
      if (!m) { speak('Non ci sono partite in programma: appena esce il calendario faccio il pronostico.', 'neutral'); return; }
      const key = 'fc_pred_' + m.id;
      let p = null;
      try { p = JSON.parse(store.get(key) || 'null'); } catch (e) { p = null; }
      if (!p) { p = forecast(m); store.set(key, JSON.stringify(p)); }
      const homeUs = m.home === S.config.teamName;
      const h = homeUs ? p.ours : p.theirs, w = homeUs ? p.theirs : p.ours;
      const esito = p.ours > p.theirs ? 'Vedo un successo del ' + S.config.teamName : p.ours < p.theirs ? 'Vedo una gara difficile' : 'Vedo una gara in equilibrio';
      const base = p.n === 0 ? 'Non ci sono ancora partite giocate, quindi uso la media del girone' : p.n === 1 ? 'Si basa sull\'unica partita giocata finora, quindi è molto prudente' : `Si basa sulla media gol delle nostre ${p.n} partite giocate`;
      speak(`Pronostico ${m.home} – ${m.away}: ${h}-${w}. ${esito}. ${base}: è solo un'indicazione, la decide il campo.`, 'neutral');
    }

    function confetti() {
      if (reduce) return;
      const wrap = document.createElement('div');
      wrap.className = 'confetti';
      const cols = ['#d7263d', '#1d4ed8', '#ffffff'];
      for (let i = 0; i < 46; i++) {
        const p = document.createElement('i');
        p.style.left = Math.random() * 100 + 'vw';
        p.style.background = cols[i % 3];
        p.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
        p.style.animationDelay = Math.random() * .4 + 's';
        p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
        wrap.appendChild(p);
      }
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 3800);
    }

    function cheer() {
      cheers++; store.set('fc_cori', cheers); showCount(); confetti();
      let t = pick(['Uuuuh! Rossoblù! 🔴🔵', 'Più forte! Non vi sento! 📣', 'Forza Tricarico! Che coro!']);
      if (cheers === 10) t = 'Dieci cori! Sei ufficialmente un ultrà in prova! 🎖️';
      if (cheers === 50) t = 'Cinquanta cori! Ti nomino tifoso d\'onore della torre! 🏰🏆';
      if (cheers === 100) t = 'CENTO CORI! Sei leggenda. Ti porto io in trasferta! 🚌';
      speak(t, 'happy');
    }

    function hide() { mascot.hidden = true; openBtn.hidden = false; store.set('fc_mascot', 'off'); }
    function show() { mascot.hidden = false; openBtn.hidden = true; store.set('fc_mascot', 'on'); }

    body.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open ? true : false;
      if (open) {
        const ctx = contextual();
        const c = clicks === 0 && ctx.length ? ctx[0] : (Math.random() < .5 && ctx.length ? pick(ctx) : null);
        if (c) speak(c.t, c.m, c.l); else joke();
        clicks++;
      }
    });
    menu.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      ({ joke, predict, cheer, hide })[b.dataset.a]();
    });
    openBtn.addEventListener('click', () => { show(); speak('Rieccomi! Mi eri mancato! 🏰', baseMood); });

    /* la torre si inclina leggermente verso il puntatore (come se ti seguisse con lo sguardo) */
    let raf = 0;
    if (!reduce) document.addEventListener('pointermove', e => {
      if (raf || mascot.hidden) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = body.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const tilt = Math.max(-1, Math.min(1, dx / 400)) * 4;
        body.style.setProperty('--tilt', tilt.toFixed(1) + 'deg');
      });
    }, { passive: true });

    if (store.get('fc_mascot') === 'off') { mascot.hidden = true; openBtn.hidden = false; }
    else {
      let seen = false; try { seen = sessionStorage.getItem('fc_greet'); sessionStorage.setItem('fc_greet', '1'); } catch (e) { /* ignora */ }
      if (!seen) setTimeout(() => {
        const last = FC.played()[0], o = last ? FC.outcome(last) : '';
        const tail = o === 'V' ? 'Dopo l\'ultima vittoria sono carichissimo!' : o === 'P' ? 'L\'ultima è andata male, ma in cinque si può ripartire.' : o === 'N' ? 'Ultimo risultato in parità: ora si cerca il colpo in più.' : 'Pronto per il prossimo fischio d\'inizio!';
        speak(`Ciao! Sono ${name}, la mascotte del palazzetto. ${tail} Toccami, non crollo! 🏰`, baseMood);
      }, 1500);
    }
  }

  if (FC.ready) start(); else document.addEventListener('fc:ready', start, { once: true });
})();
