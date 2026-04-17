'use strict';

const CW = 62, CH = 90;

class UI {
  constructor() {
    this.game    = null;
    this.aiDelay = 780;
    this._wire();
  }

  _wire() {
    document.getElementById('start-btn')     .addEventListener('click', () => this._newGame());
    document.getElementById('play-again-btn').addEventListener('click', () => this._newGame());
    document.getElementById('next-round-btn').addEventListener('click', () => this._nextRound());
    document.querySelectorAll('.s-btn').forEach(b =>
      b.addEventListener('click', () => this._onTrump(b.dataset.suit)));
    document.getElementById('tracker-btn')
      .addEventListener('click', () => this._toggleTracker());
  }

  /* ── Tracker ──────────────────────────────────────────── */
  _toggleTracker() {
    const p = document.getElementById('tracker-panel');
    if (p.classList.toggle('hidden') === false) this._updateTracker();
  }

  _updateTracker() {
    const played = new Set();
    for (const t of this.game.completedTricks)
      for (const e of t.entries) played.add(`${e.card.suit}-${e.card.value}`);
    for (const e of this.game.currentTrick)
      played.add(`${e.card.suit}-${e.card.value}`);

    const suits = [
      { name:'spades',   sym:'♠', col:'black' },
      { name:'hearts',   sym:'♥', col:'red'   },
      { name:'clubs',    sym:'♣', col:'black' },
      { name:'diamonds', sym:'♦', col:'red'   },
    ];
    const ORDER = [14,13,12,11,10,9,8,7,6,5,4,3,2];
    const vn = v => ({14:'A',13:'K',12:'Q',11:'J'}[v] || String(v));

    document.getElementById('tracker-body').innerHTML = suits.map(s =>
      `<div class="tr-row">
        <span class="tr-suit-sym ${s.col}">${s.sym}</span>
        <div class="tr-chips">${ORDER.map(v => {
          const gone = played.has(`${s.name}-${v}`);
          return `<span class="tr-chip ${gone ? 'gone' : 'remain ' + s.col}">${vn(v)}</span>`;
        }).join('')}</div>
      </div>`
    ).join('');
  }

  /* ── Game lifecycle ───────────────────────────────────── */
  _newGame() {
    this.game = new TenCoatGame();
    this._showScreen('game-screen');
    this._nextRound();
  }

  _nextRound() {
    this._hideOv('round-modal');
    this._hideOv('gameover-modal');
    this.game.initRound();
    this._updateHUD();
    this._clearTrick();
    this._hidePill();
    this._status('Dealing…');
    this._renderAllHands();
    setTimeout(() => this._dealLoop(), 120);
  }

  /* ── Deal loop ────────────────────────────────────────── */
  _dealLoop() {
    if (this.game.state === 'TRUMP_DECLARE') {
      this._renderAllHands();
      const d = this.game.trumpDeclarer;
      if (d === 0) {
        this._showOv('trump-modal');
        this._status('Choose the trump suit');
      } else {
        this._status(`${this.game.playerNames[d]} is choosing trump…`);
        setTimeout(() => {
          this.game.declareTrump(this.game.aiChooseTrump(d));
          this._updateHUD();
          this._status(`${this.game.playerNames[d]} chose trump: ${SUIT_SYMBOLS[this.game.trump]}`);
          setTimeout(() => this._dealLoop(), 400);
        }, 700);
      }
      return;
    }
    if (this.game.isDealingComplete()) {
      this._renderAllHands();
      this._status('Starting play…');
      setTimeout(() => { this.game.startPlaying(); this._renderAllHands(); this._turn(); }, 700);
      return;
    }
    this.game.dealOneCard();
    const dealt = this.game.hands.reduce((n, h) => n + h.length, 0);
    if (dealt % 6 === 0) this._renderAllHands();
    setTimeout(() => this._dealLoop(), 16);
  }

  _onTrump(suit) {
    this._hideOv('trump-modal');
    this.game.declareTrump(suit);
    this._updateHUD();
    this._status(`Trump: ${SUIT_SYMBOLS[suit]}`);
    setTimeout(() => this._dealLoop(), 300);
  }

  /* ── Turn management ──────────────────────────────────── */
  _turn() {
    if (this.game.state !== 'PLAYING') return;
    const p = this.game.currentPlayer;
    this._highlight(p);
    if (p === 0) {
      this._status('Your turn — tap a card');
      this._renderHumanHand(true);
    } else {
      this._renderHumanHand(false);
      this._status(`${this.game.playerNames[p]} is thinking…`);
      setTimeout(() => this._play(p, this.game.aiChooseCard(p)), this.aiDelay);
    }
  }

  _play(player, card) {
    const result = this.game.playCard(player, card);
    if (player === 0) this._renderHumanHand(false);
    else              this._renderAIHand(player);
    this._showTrickCard(player, card);

    if (!result || result.waiting) { this._turn(); return; }

    const panel = document.getElementById('tracker-panel');
    if (!panel.classList.contains('hidden')) this._updateTracker();

    const msg = result.tens > 0
      ? `${result.winnerName} wins — ${result.tens} ten${result.tens > 1 ? 's' : ''} captured`
      : `${result.winnerName} wins the trick`;
    this._status(msg);
    this._updatePill();

    if (result.roundOver) {
      setTimeout(() => this._roundResult(), 1600);
    } else {
      setTimeout(() => { this._clearTrick(); this._turn(); }, 1600);
    }
  }

  /* ── Results ──────────────────────────────────────────── */
  _roundResult() {
    const r       = this.game.getRoundResult();
    const [tA,tB] = [r.tensTeamA, r.tensTeamB];
    const [wA,wB] = this.game.teamWins;
    let headline, cls, sub = '';

    if (r.roundWinner === 0) {
      headline = 'Your team wins the round!'; cls = 'res-win';
      if (r.trumpTiebreak) sub = `<br><small style="color:rgba(255,255,255,.4)">2–2 tie broken by trump 10 ${SUIT_SYMBOLS[this.game.trump]}</small>`;
    } else if (r.roundWinner === 1) {
      headline = 'Robot team wins the round.'; cls = 'res-lose';
      if (r.trumpTiebreak) sub = `<br><small style="color:rgba(255,255,255,.4)">2–2 tie broken by trump 10 ${SUIT_SYMBOLS[this.game.trump]}</small>`;
    } else {
      headline = 'Tie — no point awarded.'; cls = 'res-tie';
    }

    document.getElementById('r-title').textContent = `Round ${this.game.currentRound} / ${this.game.maxRounds}`;
    document.getElementById('r-body').innerHTML =
      `<div class="${cls}">${headline}${sub}</div><br>
       10s this round:<br>
       Your team: <b>${tA}</b> &nbsp;|&nbsp; Robots: <b>${tB}</b><br><br>
       Match score: <b>${wA} – ${wB}</b>`;

    const over = this.game.isMatchOver();
    document.getElementById('next-round-btn').style.display = over ? 'none' : '';
    this._showOv('round-modal');
    if (over) setTimeout(() => { this._hideOv('round-modal'); this._matchResult(); }, 2800);
  }

  _matchResult() {
    const w       = this.game.getMatchWinner();
    const [wA,wB] = this.game.teamWins;
    const [headline, cls] = w === 0
      ? ['Your team wins the match!',        'res-win' ]
      : w === 1
      ? ['Robots win. Better luck next time!','res-lose']
      : ["It's a draw!",                     'res-tie' ];

    document.getElementById('go-body').innerHTML =
      `<div class="${cls}">${headline}</div><br>Final: <b>${wA} – ${wB}</b>`;
    this._showOv('gameover-modal');
  }

  /* ── Card rendering ───────────────────────────────────── */
  _renderAllHands() {
    this._renderHumanHand(false);
    [1, 2, 3].forEach(p => this._renderAIHand(p));
  }

  _renderHumanHand(clickable) {
    const zone  = document.getElementById('hand-0');
    zone.innerHTML = '';
    const cards = this.game.hands[0];
    const n     = cards.length;
    if (!n) { zone.style.width = zone.style.height = '0'; return; }

    const valid  = clickable ? this.game.getValidCards(0) : [];
    const avail  = Math.min(window.innerWidth - 16, window.innerWidth * 0.97);
    const gap    = n > 1 ? Math.min(52, (avail - CW) / (n - 1)) : 0;
    const totalW = (n - 1) * gap + CW;

    zone.style.width  = totalW + 'px';
    zone.style.height = (CH + 36) + 'px';

    cards.forEach((card, i) => {
      const t      = n > 1 ? i / (n - 1) : 0.5;
      const angle  = (t - 0.5) * 30;
      const dip    = Math.pow(t - 0.5, 2) * 26;
      const el     = this._cardEl(card);

      el.style.left            = (i * gap) + 'px';
      el.style.bottom          = (36 - dip) + 'px';
      el.style.top             = 'auto';
      el.style.setProperty('--rot', `${angle}deg`);
      el.style.transform       = `rotate(${angle}deg)`;
      el.style.transformOrigin = 'bottom center';
      el.style.zIndex          = i + 1;

      if (clickable) {
        const ok = valid.includes(card);
        if (ok) {
          el.classList.add('playable');
          this._addPlayGesture(el, card, angle);
        } else {
          el.classList.add('dim');
          const deny = () => this._status('Must follow suit!');
          el.addEventListener('click', deny);
          el.addEventListener('touchstart', e => { e.preventDefault(); deny(); }, { passive: false });
        }
      }
      zone.appendChild(el);
    });
  }

  _addPlayGesture(el, card, angle) {
    let startX = 0, startY = 0;

    const doLift = () => {
      el.classList.remove('snap-back');
      el.classList.add('lifted');
      el.style.setProperty('--rot', `${angle}deg`);
    };
    const doSnap = () => { el.classList.add('snap-back'); el.classList.remove('lifted'); };
    const doPlay = () => { el.classList.remove('lifted', 'snap-back'); this._onCardClick(card); };

    // Mouse
    el.addEventListener('mouseenter', doLift);
    el.addEventListener('mouseleave', doSnap);
    el.addEventListener('click', doPlay);

    // Touch
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      ({ clientX: startX, clientY: startY } = e.touches[0]);
      doLift();
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      e.preventDefault();
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = startY - e.touches[0].clientY;
      if (dx > 30 && dx > Math.abs(dy)) doSnap();
    }, { passive: false });

    el.addEventListener('touchend', e => {
      e.preventDefault();
      const dy = startY - e.changedTouches[0].clientY;
      const dx = Math.abs(e.changedTouches[0].clientX - startX);
      (dy > 28 || (Math.abs(dy) < 12 && dx < 12)) ? doPlay() : doSnap();
    }, { passive: false });

    el.addEventListener('touchcancel', doSnap);
  }

  _renderAIHand(player) {
    const zone = document.getElementById(`hand-${player}`);
    zone.innerHTML = '';
    const n = this.game.hands[player].length;
    if (!n) { zone.style.width = zone.style.height = '0'; return; }

    if (player === 2) {
      const gap    = Math.min(28, Math.max(10, (window.innerWidth * 0.5 - CW) / Math.max(n - 1, 1)));
      const totalW = (n - 1) * gap + CW;
      zone.style.width = totalW + 'px';
      zone.style.height = CH + 'px';
      for (let i = 0; i < n; i++) {
        const el = this._backEl();
        el.style.cssText = `left:${i * gap}px;top:0;z-index:${i + 1}`;
        zone.appendChild(el);
      }
    } else {
      const avail  = document.getElementById('middle').offsetHeight || 200;
      const gap    = Math.min(20, Math.max(8, (avail * 0.7 - CH) / Math.max(n - 1, 1)));
      const totalH = (n - 1) * gap + CH;
      zone.style.width = CW + 'px';
      zone.style.height = totalH + 'px';
      for (let i = 0; i < n; i++) {
        const el = this._backEl();
        el.style.cssText = `top:${i * gap}px;left:0;z-index:${i + 1}`;
        zone.appendChild(el);
      }
    }
  }

  /* ── Card element builders ────────────────────────────── */
  _cardEl(card) {
    const el = document.createElement('div');
    el.className = `card ${card.color}${card.isTen ? ' ten' : ''}`;
    el.innerHTML =
      `<b class="pip top">${card.display}<small>${card.symbol}</small></b>` +
      `<span class="cs">${card.symbol}</span>` +
      `<b class="pip bot">${card.display}<small>${card.symbol}</small></b>`;
    return el;
  }

  _backEl() {
    const el = document.createElement('div');
    el.className = 'card-back';
    return el;
  }

  /* ── Trick area ───────────────────────────────────────── */
  _showTrickCard(player, card) {
    const spot = document.getElementById(`played-${player}`);
    if (!spot) return;
    spot.innerHTML = '';
    const el = this._cardEl(card);
    el.style.position = 'static';
    el.classList.add('fly-in');
    spot.appendChild(el);
  }

  _clearTrick() {
    [0,1,2,3].forEach(p => {
      const s = document.getElementById(`played-${p}`);
      if (s) s.innerHTML = '';
    });
  }

  /* ── HUD ──────────────────────────────────────────────── */
  _updateHUD() {
    const g = this.game;
    document.getElementById('round-num').textContent = g.currentRound || '—';
    document.getElementById('wins-a').textContent    = g.teamWins[0];
    document.getElementById('wins-b').textContent    = g.teamWins[1];
    const span = document.getElementById('trump-sym');
    if (g.trump) {
      span.textContent = SUIT_SYMBOLS[g.trump];
      span.style.color = SUIT_COLORS[g.trump] === 'red' ? '#ff453a' : '#fff';
    } else {
      span.textContent = '—'; span.style.color = '';
    }
  }

  _updatePill() {
    const [tA]  = this.game.tensWon;
    const pill  = document.getElementById('tens-pill');
    pill.textContent = `${tA} ten${tA !== 1 ? 's' : ''}`;
    pill.classList.toggle('hidden', tA === 0);
  }

  _hidePill() { document.getElementById('tens-pill').classList.add('hidden'); }

  /* ── Player highlight ─────────────────────────────────── */
  _highlight(p) {
    const map = { 0:'zone-bot', 1:'zone-right', 2:'zone-top', 3:'zone-left' };
    document.querySelectorAll('.zone').forEach(z => z.classList.remove('active'));
    document.getElementById(map[p])?.classList.add('active');
  }

  /* ── Card click ───────────────────────────────────────── */
  _onCardClick(card) {
    if (this.game.state !== 'PLAYING' || this.game.currentPlayer !== 0) return;
    this._renderHumanHand(false);
    this._play(0, card);
  }

  /* ── Status pill ──────────────────────────────────────── */
  _status(msg) {
    const el = document.getElementById('status-pill');
    if (el) el.textContent = msg;
  }

  /* ── Screen / overlay helpers ─────────────────────────── */
  _showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }
  _showOv(id) { document.getElementById(id).classList.remove('hidden'); }
  _hideOv(id) { document.getElementById(id).classList.add('hidden'); }
}

window.addEventListener('load', () => { new UI(); });
