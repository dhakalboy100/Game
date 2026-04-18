// ============================================================
//  Das Coat — UI Controller (v2 — mobile redesign)
//  All card hands use absolute positioning + CSS transforms
//  for reliable rendering on all screen sizes.
// ============================================================

'use strict';

/* Card dimensions */
const CW = 52;  // card width  px
const CH = 76;  // card height px

const SPEED_PRESETS = {
  slow:   { ai: 1200, trickPause: 2000, deal: 26 },
  normal: { ai: 820,  trickPause: 1600, deal: 16 },
  fast:   { ai: 420,  trickPause: 900,  deal: 8 },
};

class UI {
  constructor() {
    this.game = null;
    const savedSpeed = localStorage.getItem('dascoat.speed') || 'normal';
    this.speed = SPEED_PRESETS[savedSpeed] || SPEED_PRESETS.normal;
    this.speedKey = savedSpeed in SPEED_PRESETS ? savedSpeed : 'normal';
    this.aiDelay = this.speed.ai; // kept for legacy refs
    this._wire();
    this._initSettingsUI();
  }

  /* ==========================================================
     WIRING
     ========================================================== */
  _wire() {
    const click = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => { this._sfx('button'); fn(); });
    };
    click('start-btn',       () => this._newGame());
    click('play-again-btn',  () => this._newGame());
    click('next-round-btn',  () => this._nextRound());
    click('tracker-btn',     () => this._toggleTracker());
    click('settings-btn',    () => this._showOv('settings-modal'));
    click('close-settings',  () => this._hideOv('settings-modal'));

    document.querySelectorAll('.s-btn').forEach(b =>
      b.addEventListener('click', () => { this._sfx('button'); this._onTrump(b.dataset.suit); })
    );
  }

  _initSettingsUI() {
    // Speed segmented control
    document.querySelectorAll('.seg-btn').forEach(b => {
      if (b.dataset.speed === this.speedKey) b.classList.add('on');
      b.addEventListener('click', () => {
        this._sfx('button');
        this.speedKey = b.dataset.speed;
        this.speed = SPEED_PRESETS[this.speedKey];
        this.aiDelay = this.speed.ai;
        localStorage.setItem('dascoat.speed', this.speedKey);
        document.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x === b));
      });
    });

    const bindToggle = (id, initial, onChange) => {
      const el = document.getElementById(id);
      if (!el) return;
      const render = v => { el.textContent = v ? 'On' : 'Off'; el.classList.toggle('off', !v); };
      render(initial);
      el.addEventListener('click', () => {
        this._sfx('button');
        const next = el.textContent !== 'On';
        render(next);
        onChange(next);
      });
    };
    const A = window.DasAudio;
    if (A) {
      bindToggle('tog-sfx',   A.sfxOn,   v => A.setSfx(v));
      bindToggle('tog-music', A.musicOn, v => A.setMusic(v));
    }
  }

  _sfx(key) { if (window.DasAudio) window.DasAudio.play(key); }

  _toggleTracker() {
    const panel = document.getElementById('tracker-panel');
    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      this._updateTracker();
    } else {
      panel.classList.add('hidden');
    }
  }

  _updateTracker() {
    const body = document.getElementById('tracker-body');
    if (!body) return;

    // Collect every card played in completed tricks + current trick
    const played = new Set();
    for (const t of this.game.completedTricks)
      for (const e of t.entries)
        played.add(`${e.card.suit}-${e.card.value}`);
    for (const e of this.game.currentTrick)
      played.add(`${e.card.suit}-${e.card.value}`);

    const suits = [
      { name: 'spades',   sym: '♠', col: 'black' },
      { name: 'hearts',   sym: '♥', col: 'red'   },
      { name: 'clubs',    sym: '♣', col: 'black' },
      { name: 'diamonds', sym: '♦', col: 'red'   },
    ];
    const ORDER = [14,13,12,11,10,9,8,7,6,5,4,3,2];
    const vn = v => ({14:'A',13:'K',12:'Q',11:'J'}[v] || String(v));

    body.innerHTML = suits.map(s => {
      const chips = ORDER.map(v => {
        const gone = played.has(`${s.name}-${v}`);
        return `<span class="tr-chip ${gone ? 'gone' : 'remain ' + s.col}">${vn(v)}</span>`;
      }).join('');
      return `<div class="tr-row">
        <span class="tr-suit-sym ${s.col}">${s.sym}</span>
        <div class="tr-chips">${chips}</div>
      </div>`;
    }).join('');
  }

  /* ==========================================================
     GAME LIFECYCLE
     ========================================================== */
  _newGame() {
    this.game = new DasCoatGame();
    this._showScreen('game-screen');
    this._nextRound();
  }

  _nextRound() {
    this._hideOv('round-modal');
    this._hideOv('gameover-modal');
    this.game.initRound();
    this._updateHUD();
    this._updateDealer();
    this._clearTrick();
    this._hidePill();
    this._status('Shuffling the deck…');
    this._renderAllHands();
    this._sfx('shuffle');
    setTimeout(() => { this._status('Dealing cards…'); this._dealLoop(); }, 550);
  }

  _updateDealer() {
    const el = document.getElementById('dealer-name');
    if (el && this.game) el.textContent = this.game.playerNames[this.game.dealer];
  }

  /* ==========================================================
     DEAL LOOP
     ========================================================== */
  _dealLoop() {
    if (this.game.state === 'TRUMP_DECLARE') {
      this._renderAllHands();
      const d = this.game.trumpDeclarer;
      this._sfx('flip');
      if (d === 0) {
        const suggested = this.game.aiChooseTrump(0);
        const hint = document.getElementById('trump-hint');
        if (hint) hint.innerHTML = `Suggested: <b>${SUIT_SYMBOLS[suggested]}</b>`;
        document.querySelectorAll('.s-btn').forEach(b =>
          b.classList.toggle('suggested', b.dataset.suit === suggested)
        );
        this._showOv('trump-modal');
        this._status('Pick the trump suit!');
      } else {
        this._status(`${this.game.playerNames[d]} is choosing trump…`);
        setTimeout(() => {
          const suit = this.game.aiChooseTrump(d);
          this.game.declareTrump(suit);
          this._updateHUD();
          this._status(`${this.game.playerNames[d]} chose trump: ${SUIT_SYMBOLS[suit]}`);
          setTimeout(() => this._dealLoop(), Math.max(200, this.speed.ai * 0.5));
        }, this.speed.ai);
      }
      return;
    }

    if (this.game.isDealingComplete()) {
      this._renderAllHands();
      this._status('Cards dealt — starting play…');
      setTimeout(() => {
        this.game.startPlaying();
        this._renderAllHands();
        this._turn();
      }, 700);
      return;
    }

    this.game.dealOneCard();
    const dealt = this.game.hands.reduce((n, h) => n + h.length, 0);
    if (dealt % 4 === 0) { this._renderAllHands(); this._sfx('deal'); }
    setTimeout(() => this._dealLoop(), this.speed.deal);
  }

  _onTrump(suit) {
    this._hideOv('trump-modal');
    this.game.declareTrump(suit);
    this._updateHUD();
    this._sfx('flip');
    this._status(`You chose trump: ${SUIT_SYMBOLS[suit]}`);
    setTimeout(() => this._dealLoop(), 300);
  }

  /* ==========================================================
     TURN MANAGEMENT
     ========================================================== */
  _turn() {
    if (this.game.state !== 'PLAYING') return;
    const p = this.game.currentPlayer;
    this._highlight(p);

    if (p === 0) {
      this._status('Your turn — tap a card to play');
      this._renderHumanHand(true);
    } else {
      this._renderHumanHand(false);
      this._status(`${this.game.playerNames[p]} is thinking…`);
      setTimeout(() => this._play(p, this.game.aiChooseCard(p)), this.speed.ai);
    }
  }

  _play(player, card) {
    const result = this.game.playCard(player, card);

    // Refresh the player's hand display
    if (player === 0) this._renderHumanHand(false);
    else              this._renderAIHand(player);

    // Show the played card in the center
    this._showTrickCard(player, card);
    this._sfx('play');

    if (!result || result.waiting) { this._turn(); return; }

    // Trick complete — refresh tracker if open
    const trackerPanel = document.getElementById('tracker-panel');
    if (trackerPanel && !trackerPanel.classList.contains('hidden'))
      this._updateTracker();

    const winTeam = result.trickWinner % 2; // team 0 = you+R2, team 1 = robots
    if (result.tens > 0)       this._sfx('ten_capture');
    else if (winTeam === 0)    this._sfx('trick_win');
    else                       this._sfx('trick_lose');

    this._flashTrickWinner(result.trickWinner, result.tens > 0);

    const msg = result.tens > 0
      ? `${result.winnerName} wins the trick — ${result.tens} ten${result.tens > 1 ? 's' : ''} captured! 🎯`
      : `${result.winnerName} wins the trick.`;
    this._status(msg);
    this._updatePill();

    if (result.roundOver) {
      setTimeout(() => this._roundResult(), this.speed.trickPause);
    } else {
      setTimeout(() => { this._clearTrick(); this._turn(); }, this.speed.trickPause);
    }
  }

  _flashTrickWinner(player, goldBurst) {
    const map = { 0:'zone-bot', 1:'zone-right', 2:'zone-top', 3:'zone-left' };
    const z = document.getElementById(map[player]);
    if (!z) return;
    z.classList.add(goldBurst ? 'flash-gold' : 'flash-win');
    setTimeout(() => z.classList.remove('flash-gold', 'flash-win'), 900);
  }

  /* ==========================================================
     RESULTS
     ========================================================== */
  _roundResult() {
    const r       = this.game.getRoundResult();
    const [tA,tB] = [r.tensTeamA, r.tensTeamB];
    const [wA,wB] = this.game.teamWins;

    let headline, cls, sub = '';
    const tieNote =
      r.trumpTiebreak     ? `<br><small style="color:#aaa">Tie broken by trump 10 ${SUIT_SYMBOLS[this.game.trump]}</small>` :
      r.lastTrickTiebreak ? `<br><small style="color:#aaa">Tie broken by last-trick winner</small>` : '';

    if (r.roundWinner === 0) {
      headline = '🎉 Your team wins the round!';
      cls = 'res-win';
      sub = tieNote;
      this._sfx('round_win');
      this._confettiRound();
    } else if (r.roundWinner === 1) {
      headline = '😔 Robot team wins the round.';
      cls = 'res-lose';
      sub = tieNote;
      this._sfx('round_lose');
    } else {
      headline = "🤝 Tie — no point.";
      cls = 'res-tie';
    }

    document.getElementById('r-title').textContent =
      `Round ${this.game.currentRound} / ${this.game.maxRounds}`;

    document.getElementById('r-body').innerHTML = `
      <div class="${cls}">${headline}${sub}</div><br>
      10s this round:<br>
      👤 Your team: <b>${tA}</b> &nbsp;|&nbsp; 🤖 Robots: <b>${tB}</b><br><br>
      Match score: <b>${wA} – ${wB}</b>
    `;

    const over = this.game.isMatchOver();
    document.getElementById('next-round-btn').style.display = over ? 'none' : '';
    this._showOv('round-modal');
    if (over) setTimeout(() => { this._hideOv('round-modal'); this._matchResult(); }, 2800);
  }

  _matchResult() {
    const w       = this.game.getMatchWinner();
    const [wA,wB] = this.game.teamWins;
    let headline, cls;
    if      (w === 0) { headline = '🏆 Your team wins the match!'; cls = 'res-win';  this._sfx('round_win');  this._confettiMatch(); }
    else if (w === 1) { headline = '🤖 Robots win. Better luck next time!'; cls = 'res-lose'; this._sfx('round_lose'); }
    else              { headline = "🤝 It's a draw!"; cls = 'res-tie'; }

    document.getElementById('go-title').textContent =
      w === 0 ? 'Das Coat Master!' : 'Match Over';
    document.getElementById('go-body').innerHTML =
      `<div class="${cls}">${headline}</div><br>Final: <b>${wA} – ${wB}</b>`;
    this._showOv('gameover-modal');
  }

  _confettiRound() {
    if (typeof confetti !== 'function') return;
    confetti({ particleCount: 80, spread: 65, origin: { y: 0.6 }, colors: ['#ffd700','#ffb300','#fff8cc'] });
  }

  _confettiMatch() {
    if (typeof confetti !== 'function') return;
    const colors = ['#ffd700','#ff5252','#64b5f6','#81c784','#fff'];
    confetti({ particleCount: 140, spread: 70, origin: { x: 0.15, y: 0.8 }, colors });
    confetti({ particleCount: 140, spread: 70, origin: { x: 0.85, y: 0.8 }, colors });
    setTimeout(() => {
      confetti({ particleCount: 100, spread: 100, startVelocity: 40, origin: { y: 0.3 }, colors });
    }, 400);
  }

  /* ==========================================================
     CARD RENDERING  (absolute-positioned, arc-fanned)
     ========================================================== */
  _renderAllHands() {
    this._renderHumanHand(false);
    this._renderAIHand(1);
    this._renderAIHand(2);
    this._renderAIHand(3);
  }

  /* --- Human: face-up arc fan with swipe + 3-D lift --- */
  _renderHumanHand(clickable) {
    const zone = document.getElementById('hand-0');
    zone.innerHTML = '';

    const cards = this.game.hands[0];
    const n     = cards.length;
    if (n === 0) { zone.style.width = '0'; zone.style.height = '0'; return; }

    const valid  = clickable ? this.game.getValidCards(0) : [];
    const avail  = Math.min(window.innerWidth - 16, window.innerWidth * 0.97);
    // Wider spacing: target 46px gap, shrink only if necessary
    const gap    = n > 1 ? Math.min(46, (avail - CW) / (n - 1)) : 0;
    const totalW = (n - 1) * gap + CW;
    const totalH = CH + 32;

    zone.style.width  = totalW + 'px';
    zone.style.height = totalH + 'px';

    cards.forEach((card, i) => {
      const t      = n > 1 ? i / (n - 1) : 0.5;
      const angle  = (t - 0.5) * 26;          // –13° … +13°
      const dip    = Math.pow(t - 0.5, 2) * 22;
      const bottom = 32 - dip;

      const el = this._cardEl(card);
      el.style.left            = (i * gap) + 'px';
      el.style.bottom          = bottom + 'px';
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
          const reject = () => {
            this._status('Must follow suit!');
            el.classList.remove('shake');
            void el.offsetWidth; // restart animation
            el.classList.add('shake');
          };
          el.addEventListener('click', reject);
          el.addEventListener('touchstart', e => { e.preventDefault(); reject(); }, { passive: false });
        }
      }
      zone.appendChild(el);
    });
  }

  /**
   * Attach tap + swipe-up + 3-D lift to a playable card.
   * Tap   (touchstart → touchend, Δy < 12px)  → play
   * Swipe up (Δy > 28px upward)               → play
   * Press  (touchstart)                        → lift bubble
   */
  _addPlayGesture(el, card, angle) {
    let startY = 0, startX = 0, lifted = false;

    const doLift = () => {
      el.classList.remove('snap-back');
      el.classList.add('lifted');
      el.style.setProperty('--rot', `${angle}deg`);
      lifted = true;
    };

    const doSnap = () => {
      el.classList.add('snap-back');
      el.classList.remove('lifted');
      lifted = false;
    };

    const doPlay = () => {
      el.classList.remove('lifted', 'snap-back');
      this._onCardClick(card);
    };

    // Mouse (desktop)
    el.addEventListener('mouseenter', doLift);
    el.addEventListener('mouseleave', doSnap);
    el.addEventListener('click', doPlay);

    // Touch
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      doLift();
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      e.preventDefault();
      // If swiping sideways, cancel lift
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = startY - e.touches[0].clientY;
      if (dx > 30 && dx > Math.abs(dy)) doSnap();
    }, { passive: false });

    el.addEventListener('touchend', e => {
      e.preventDefault();
      const dy = startY - e.changedTouches[0].clientY;
      const dx = Math.abs(e.changedTouches[0].clientX - startX);
      // Play on tap (small move) OR swipe up
      if (dy > 28 || (Math.abs(dy) < 12 && dx < 12)) {
        doPlay();
      } else {
        doSnap();
      }
    }, { passive: false });

    el.addEventListener('touchcancel', doSnap);
  }

  /* --- AI player 2 (top) — horizontal fan of backs --- */
  /* --- AI player 1 & 3 (sides) — vertical fan of backs --- */
  _renderAIHand(player) {
    const zone = document.getElementById(`hand-${player}`);
    zone.innerHTML = '';

    const n = this.game.hands[player].length;
    if (n === 0) { zone.style.width = '0'; zone.style.height = '0'; return; }

    if (player === 2) {
      /* top player — horizontal overlap */
      const gap    = Math.min(30, Math.max(10, (window.innerWidth * 0.5 - CW) / Math.max(n - 1, 1)));
      const totalW = (n - 1) * gap + CW;
      zone.style.width  = totalW + 'px';
      zone.style.height = CH + 'px';

      for (let i = 0; i < n; i++) {
        const el = this._backEl();
        el.style.left   = (i * gap) + 'px';
        el.style.top    = '0';
        el.style.zIndex = i + 1;
        zone.appendChild(el);
      }
    } else {
      /* side players — vertical overlap */
      const avail  = document.getElementById('middle').offsetHeight || 200;
      const gap    = Math.min(22, Math.max(8, (avail * 0.7 - CH) / Math.max(n - 1, 1)));
      const totalH = (n - 1) * gap + CH;
      zone.style.width  = CW + 'px';
      zone.style.height = totalH + 'px';

      for (let i = 0; i < n; i++) {
        const el = this._backEl();
        el.style.top    = (i * gap) + 'px';
        el.style.left   = '0';
        el.style.zIndex = i + 1;
        zone.appendChild(el);
      }
    }
  }

  /* --- Card element constructors --- */
  _cardEl(card) {
    const el = document.createElement('div');
    el.className = `card ${card.color}${card.isTen ? ' ten' : ''}`;
    el.innerHTML =
      `<span class="cv">${card.display}</span>` +
      `<span class="cs">${card.symbol}</span>` +
      `<span class="cvb">${card.display}</span>`;
    return el;
  }

  _backEl() {
    const el = document.createElement('div');
    el.className = 'card-back';
    return el;
  }

  /* ==========================================================
     TRICK AREA
     ========================================================== */
  _showTrickCard(player, card) {
    const spot = document.getElementById(`played-${player}`);
    if (!spot) return;
    spot.innerHTML = '';
    const el = this._cardEl(card);
    // Static position inside the spot
    el.style.position = 'static';
    el.classList.add('deal-in');
    spot.appendChild(el);
  }

  _clearTrick() {
    [0,1,2,3].forEach(p => {
      const s = document.getElementById(`played-${p}`);
      if (s) s.innerHTML = '';
    });
  }

  /* ==========================================================
     HUD / PILLS
     ========================================================== */
  _updateHUD() {
    const g = this.game;
    document.getElementById('round-num').textContent = g.currentRound || '—';
    document.getElementById('wins-a').textContent = g.teamWins[0];
    document.getElementById('wins-b').textContent = g.teamWins[1];

    const span = document.getElementById('trump-sym');
    if (g.trump) {
      span.textContent = SUIT_SYMBOLS[g.trump];
      span.style.color = SUIT_COLORS[g.trump] === 'red' ? '#ff5252' : '#fff';
    } else {
      span.textContent = '—';
      span.style.color = '';
    }
  }

  _updatePill() {
    const [tA] = this.game.tensWon;
    const pill = document.getElementById('tens-pill');
    if (!pill) return;
    pill.textContent = `${tA} ten${tA !== 1 ? 's' : ''}`;
    pill.classList.remove('hidden');
    if (tA === 0) pill.classList.add('hidden');
  }

  _hidePill() {
    const pill = document.getElementById('tens-pill');
    if (pill) pill.classList.add('hidden');
  }

  /* ==========================================================
     PLAYER HIGHLIGHT
     ========================================================== */
  _highlight(p) {
    const map = { 0:'zone-bot', 1:'zone-right', 2:'zone-top', 3:'zone-left' };
    document.querySelectorAll('.zone').forEach(z => z.classList.remove('active'));
    const z = document.getElementById(map[p]);
    if (z) z.classList.add('active');
  }

  /* ==========================================================
     HUMAN CARD CLICK
     ========================================================== */
  _onCardClick(card) {
    if (this.game.state !== 'PLAYING' || this.game.currentPlayer !== 0) return;
    this._renderHumanHand(false); // lock clicks immediately
    this._play(0, card);
  }

  /* ==========================================================
     STATUS
     ========================================================== */
  _status(msg) {
    const el = document.getElementById('status-txt');
    if (el) el.textContent = msg;
  }

  /* ==========================================================
     SCREEN / OVERLAY HELPERS
     ========================================================== */
  _showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }
  _showOv(id) { document.getElementById(id).classList.remove('hidden'); }
  _hideOv(id) { document.getElementById(id).classList.add('hidden'); }
}

window.addEventListener('load', () => { new UI(); });
