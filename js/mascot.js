/* Mascotte di prova: il lupo "Ringhio". Interattiva, tutta in SVG inline. */
(function () {
  'use strict';
  const FC = window.FC;
  const MOODS = {
    neutral: { d: 'M90 126Q100 132 110 126', fill: 'none', tongue: false },
    happy: { d: 'M84 123Q100 147 116 123Z', fill: '#5a1224', tongue: true },
    sad: { d: 'M90 134Q100 124 110 134', fill: 'none', tongue: false },
    wow: { d: 'M94 124a6 8 0 1 0 12 0a6 8 0 1 0 -12 0Z', fill: '#5a1224', tongue: false }
  };
  const FUR = '#9aa3b5', FUR2 = '#e9edf5';
  const SVG = `
<svg viewBox="0 0 200 230" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs><clipPath id="jc"><path d="M50 228Q50 162 100 156Q150 162 150 228Z"/></clipPath></defs>
  <g class="m-art">
    <g clip-path="url(#jc)">
      <rect x="40" y="150" width="60" height="80" fill="#d7263d"/><rect x="100" y="150" width="60" height="80" fill="#1d4ed8"/>
    </g>
    <text x="100" y="205" text-anchor="middle" font-family="Barlow Condensed,Impact,sans-serif" font-weight="700" font-size="34" fill="#fff">10</text>
    <circle cx="50" cy="196" r="11" fill="${FUR}"/>
    <g class="m-arm"><path d="M148 178L172 148" stroke="${FUR}" stroke-width="16" stroke-linecap="round"/><circle cx="173" cy="146" r="11" fill="${FUR}"/></g>
    <path d="M62 150Q100 172 138 150L136 166Q100 188 64 166Z" fill="#d7263d"/>
    <path d="M66 160Q100 181 134 160L133 166Q100 188 67 166Z" fill="#1d4ed8"/>
    <rect x="118" y="164" width="14" height="30" rx="4" fill="#d7263d"/><rect x="118" y="182" width="14" height="6" fill="#1d4ed8"/>
    <polygon points="52,72 60,16 94,52" fill="${FUR}"/><polygon points="62,62 64,34 82,52" fill="#f4a6b0"/>
    <polygon points="148,72 140,16 106,52" fill="${FUR}"/><polygon points="138,62 136,34 118,52" fill="#f4a6b0"/>
    <ellipse cx="100" cy="98" rx="53" ry="48" fill="${FUR}"/>
    <ellipse cx="100" cy="118" rx="29" ry="22" fill="${FUR2}"/>
    <g class="m-eye"><circle cx="78" cy="92" r="12" fill="#fff"/></g>
    <g class="m-eye"><circle cx="122" cy="92" r="12" fill="#fff"/></g>
    <g id="m-pupils"><circle cx="78" cy="93" r="5.5" fill="#10131a"/><circle cx="122" cy="93" r="5.5" fill="#10131a"/>
      <circle cx="76" cy="90.5" r="1.8" fill="#fff"/><circle cx="120" cy="90.5" r="1.8" fill="#fff"/></g>
    <ellipse cx="100" cy="108" rx="8.5" ry="6" fill="#1a1d26"/>
    <path d="M100 114V124" stroke="#1a1d26" stroke-width="2.4" stroke-linecap="round"/>
    <path id="m-mouth" d="" stroke="#1a1d26" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse id="m-tongue" cx="100" cy="135" rx="7" ry="4" fill="#f27a8c"/>
  </g>
</svg>`;

  const JOKES = [
    'Il mio modulo preferito? Il 4-4-2... pizze, ovviamente! 🍕',
    'Ho chiesto al VAR se sono bello. Sta ancora controllando. 📺',
    'Sai qual è il colmo per un arbitro? Vedere tutto... tranne il fuorigioco!',
    'Un lupo non perde mai: al massimo pareggia con la luna. 🌕',
    'Oggi ho fatto 11 flessioni: una per ogni titolare! 💪',
    'Il calcio è questione di centimetri. Io sono questione di croccantini.',
    'Perché il centravanti è dal dentista? Deve sistemare il tiro a... denti! 🦷'
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
    const name = S.config.mascot || 'Ringhio';
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
        <button type="button" class="m-body" id="m-body" aria-label="Parla con ${name}, la mascotte">${SVG}</button>
      </div>
      <button type="button" class="m-open" id="m-open" aria-label="Mostra la mascotte" hidden>🐺</button>`;
    document.body.append(...root.children);

    const mascot = $('#mascot'), bubble = $('#m-bubble'), menu = $('#m-menu'), body = $('#m-body'), openBtn = $('#m-open');
    const mouth = $('#m-mouth'), tongue = $('#m-tongue'), pupils = $('#m-pupils');
    let timer, clicks = 0, cheers = +store.get('fc_cori') || 0;
    const cnt = $('#m-cnt');
    const showCount = () => { cnt.textContent = cheers ? '(' + cheers + ')' : ''; };
    showCount();

    function setMood(m) {
      const d = MOODS[m] || MOODS.neutral;
      mouth.setAttribute('d', d.d); mouth.setAttribute('fill', d.fill);
      tongue.style.display = d.tongue ? '' : 'none';
    }
    setMood('happy');

    function speak(text, mood, link) {
      setMood(mood || 'happy');
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
      timer = setTimeout(() => { bubble.hidden = true; setMood('happy'); }, 8000);
    }

    /* ---- frasi che dipendono dal sito ---- */
    function contextual() {
      const out = [];
      const lv = S.live;
      if (lv && lv.active) {
        out.push({ t: `Siamo in diretta: ${lv.home} ${lv.homeScore}-${lv.awayScore} ${lv.away}! Corri!`, m: 'wow', l: { text: 'Vai alla diretta →', href: 'live.html' } });
      }
      const last = FC.played()[0];
      if (last) {
        const o = FC.outcome(last);
        const opp = last.home === S.config.teamName ? last.away : last.home;
        const sc = `${last.homeScore}-${last.awayScore}`;
        if (o === 'V') out.push({ t: `Dopo il ${sc} con ${opp} ho ululato fino a mezzanotte! 🎉`, m: 'happy' });
        if (o === 'N') out.push({ t: `Il ${sc} con ${opp} è un punto d'oro... ma io volevo i tre! 😤`, m: 'neutral' });
        if (o === 'P') out.push({ t: `Il ${sc} con ${opp} fa male, ma i lupi si rialzano sempre. 💪`, m: 'sad' });
      }
      const next = FC.upcoming()[0];
      if (next) {
        const days = Math.ceil((new Date(next.date) - Date.now()) / 864e5);
        const opp = next.home === S.config.teamName ? next.away : next.home;
        out.push({ t: days > 0 ? `Mancano ${days} giorni a ${opp}. Intanto preparo la sciarpa! 🧣` : `Oggi si gioca con ${opp}! Forza ragazzi!`, m: 'wow' });
      }
      return out;
    }

    function joke() { speak(pick(JOKES), 'happy'); }

    function predict() {
      const m = FC.upcoming()[0];
      if (!m) { speak('Non ci sono partite in programma: la mia sfera di cristallo è in ferie. 🔮', 'neutral'); return; }
      const [a, b] = pick([[2, 0], [2, 1], [1, 0], [3, 1], [1, 1], [3, 0], [0, 0]]);
      const homeUs = m.home === S.config.teamName;
      const h = homeUs ? a : b, w = homeUs ? b : a;
      speak(`Il mio pronostico per ${m.home} – ${m.away}: ${h}-${w}! (Il lupo non sbaglia mai... quasi mai.)`, 'wow');
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
      let t = pick(['Uuuuh! Rossoblù! 🔴🔵', 'Più forte! Non ti sento! 📣', 'Ahhh-uuuu! Che coro!']);
      if (cheers === 10) t = 'Dieci cori! Sei ufficialmente un ultrà in prova! 🎖️';
      if (cheers === 50) t = 'Cinquanta cori! Ti nomino tifoso d\'onore del branco! 🐺🏆';
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
    openBtn.addEventListener('click', () => { show(); speak('Rieccomi! Mi eri mancato! 🐺', 'happy'); });

    /* occhi che seguono il puntatore */
    let raf = 0;
    document.addEventListener('pointermove', e => {
      if (raf || mascot.hidden) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = body.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * .45);
        const dist = Math.hypot(dx, dy) || 1, k = Math.min(1, dist / 160);
        pupils.setAttribute('transform', `translate(${(dx / dist * 4.5 * k).toFixed(1)} ${(dy / dist * 4 * k).toFixed(1)})`);
      });
    }, { passive: true });

    if (store.get('fc_mascot') === 'off') { mascot.hidden = true; openBtn.hidden = false; }
    else {
      let seen = false; try { seen = sessionStorage.getItem('fc_greet'); sessionStorage.setItem('fc_greet', '1'); } catch (e) { /* ignora */ }
      if (!seen) setTimeout(() => speak(`Ciao tifoso! Sono ${name}, la mascotte. Toccami, non mordo! 🐺`, 'happy'), 1500);
    }
  }

  if (FC.ready) start(); else document.addEventListener('fc:ready', start, { once: true });
})();
