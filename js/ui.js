// ============================================================
//  10 Coat — UI Controller (v2 — mobile redesign)
//  All card hands use absolute positioning + CSS transforms
//  for reliable rendering on all screen sizes.
// ============================================================

'use strict';

/* Card dimensions */
const CW = 52;  // card width  px
const CH = 76;  // card height px

class UI {
  constructor() {
    this.game    = null;
    this.aiDelay = 820;
    this._wire();
  }

  /* ==========================================================
     WIRING
     ========================================================== */
  _wire() {
    document.getElementById('start-btn')
      .addEventListener('click', () => this._newGame());
    document.getElementById('play-again-btn')
      .addEventListener('click', () => this._newGame());
    document.getElementById('next-round-btn')
      .addEventListener('click', () => this._nextRound());
    document.querySelectorAll('.s-btn').forEach(b =>
      b.addEventListener('click', () => this._onTrump(b.dataset.suit))
    );
  }

  /* ==========================================================
     GAME LIFECYCLE
     ========================================================== */
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
    this._status('Dealing cards…');
    this._renderAllHands();
    setTimeout(() => this._dealLoop(), 120);
  }

  /* ==========================================================
     DEAL LOOP
     ========================================================== */
  _dealLoop() {
    if (this.game.state === 'TRUMP_DECLARE') {
      this._renderAllHands();
      const d = this.game.trumpDeclarer;
      if (d === 0) {
        this._showOv('trump-modal');
        this._status('Pick the trump suit!');
      } else {
        this._status(`${this.game.playerNames[d]} is choosing trump…`);
        setTimeout(() => {
          const suit = this.game.aiChooseTrump(d);
          this.game.declareTrump(suit);
          this._updateHUD();
          this._status(`${this.game.playerNames[d]} chose trump: ${SUIT_SYMBOLS[suit]}`);
          setTimeout(() => this._dealLoop(), 400);
        }, 700);
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
    if (dealt % 6 === 0) this._renderAllHands();
    setTimeout(() => this._dealLoop(), 16);
  }

  _onTrump(suit) {
    this._hideOv('trump-modal');
    this.game.declareTrump(suit);
    this._updateHUD();
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
      setTimeout(() => this._play(p, this.game.aiChooseCard(p)), this.aiDelay);
    }
  }

  _play(player, card) {
    const result = this.game.playCard(player, card);

    // Refresh the player's hand display
    if (player === 0) this._renderHumanHand(false);
    else              this._renderAIHand(player);

    // Show the played card in the center
    this._showTrickCard(player, card);

    if (!result || result.waiting) { this._turn(); return; }

    // Trick complete
    const msg = result.tens > 0
      ? `${result.winnerName} wins the trick — ${result.tens} ten${result.tens > 1 ? 's' : ''} captured! 🎯`
      : `${result.winnerName} wins the trick.`;
    this._status(msg);
    this._updatePill();

    if (result.roundOver) {
      setTimeout(() => this._roundResult(), 1600);
    } else {
      setTimeout(() => { this._clearTrick(); this._turn(); }, 1600);
    }
  }

  /* ==========================================================
     RESULTS
     ========================================================== */
  _roundResult() {
    const r       = this.game.getRoundResult();
    const [tA,tB] = [r.tensTeamA, r.tensTeamB];
    const [wA,wB] = this.game.teamWins;

    let headline, cls;
    if      (r.roundWinner === 0) { headline = '🎉 Your team wins the round!'; cls = 'res-win'; }
    else if (r.roundWinner === 1) { headline = '😔 Robot team wins the round.'; cls = 'res-lose'; }
    else                          { headline = "🤝 Tie — no point."; cls = 'res-tie'; }

    document.getElementById('r-title').textContent =
      `Round ${this.game.currentRound} / ${this.game.maxRounds}`;

    document.getElementById('r-body').innerHTML = `
      <div class="${cls}">${headline}</div><br>
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
    if      (w === 0) { headline = '🏆 Your team wins the match!'; cls = 'res-win'; }
    else if (w === 1) { headline = '🤖 Robots win. Better luck next time!'; cls = 'res-lose'; }
    else              { headline = "🤝 It's a draw!"; cls = 'res-tie'; }

    document.getElementById('go-title').textContent = 'Match Over!';
    document.getElementById('go-body').innerHTML =
      `<div class="${cls}">${headline}</div><br>Final: <b>${wA} – ${wB}</b>`;
    this._showOv('gameover-modal');
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

  /* --- Human: face-up arc fan --- */
  _renderHumanHand(clickable) {
    const zone  = document.getElementById('hand-0');
    const wrap  = document.getElementById('hw-0');
    zone.innerHTML = '';

    const cards = this.game.hands[0];
    const n     = cards.length;
    if (n === 0) {
      zone.style.width  = '0';
      zone.style.height = '0';
      return;
    }

    const valid   = clickable ? this.game.getValidCards(0) : [];
    const avail   = Math.min(window.innerWidth - 24, window.innerWidth * 0.95);
    const gap     = n > 1 ? Math.min(38, (avail - CW) / (n - 1)) : 0;
    const totalW  = (n - 1) * gap + CW;
    const totalH  = CH + 28; // extra for arc rise

    zone.style.width  = totalW + 'px';
    zone.style.height = totalH + 'px';

    cards.forEach((card, i) => {
      const t      = n > 1 ? i / (n - 1) : 0.5;
      const angle  = (t - 0.5) * 28;                        // -14° … +14°
      const rise   = Math.pow(t - 0.5, 2) * 24;             // edges dip, center rises
      const bottom = 28 - rise;

      const el = this._cardEl(card);
      el.style.left   = (i * gap) + 'px';
      el.style.bottom = bottom + 'px';
      el.style.top    = 'auto';
      el.style.transform = `rotate(${angle}deg)`;
      el.style.transformOrigin = 'bottom center';
      el.style.zIndex = i + 1;

      if (clickable) {
        const ok = valid.includes(card);
        if (ok) {
          el.classList.add('playable');
          el.addEventListener('click', () => this._onCardClick(card));
          el.addEventListener('touchend', e => { e.preventDefault(); this._onCardClick(card); });
        } else {
          el.classList.add('dim');
          el.addEventListener('click', () => this._status('Follow suit — must play a matching suit!'));
          el.addEventListener('touchend', e => { e.preventDefault(); this._status('Follow suit!'); });
        }
      }
      zone.appendChild(el);
    });
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
