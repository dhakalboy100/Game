// ============================================================
//  10 Coat — UI Controller
//  Manages all DOM updates, event binding, deal loop, and
//  turn sequencing.  Relies on game.js (TenCoatGame) for logic.
// ============================================================

'use strict';

class UI {
  constructor() {
    this.game    = null;
    this.aiDelay = 850; // ms between AI card plays

    this._wireButtons();
  }

  /* ==========================================================
     BUTTON / INPUT WIRING
     ========================================================== */
  _wireButtons() {
    document.getElementById('start-btn')
      .addEventListener('click', () => this._newGame());

    document.getElementById('play-again-btn')
      .addEventListener('click', () => this._newGame());

    document.getElementById('next-round-btn')
      .addEventListener('click', () => this._startNextRound());

    // Trump suit buttons
    document.querySelectorAll('.suit-btn').forEach(btn => {
      btn.addEventListener('click', () => this._onTrumpChosen(btn.dataset.suit));
    });
  }

  /* ==========================================================
     GAME LIFECYCLE
     ========================================================== */
  _newGame() {
    this.game = new TenCoatGame();
    this._showScreen('game-screen');
    this._startNextRound();
  }

  _startNextRound() {
    this._hideOverlay('round-modal');
    this._hideOverlay('gameover-modal');
    this.game.initRound();
    this._updateHUD();
    this._clearTrickArea();
    this._clearTensBadges();
    this._status('Dealing cards…');
    // Small delay so the modal fade is visible before dealing begins
    setTimeout(() => this._dealLoop(), 180);
  }

  /* ==========================================================
     DEAL LOOP
     ========================================================== */
  _dealLoop() {
    // Pause for trump declaration
    if (this.game.state === 'TRUMP_DECLARE') {
      this._renderAllHands();
      const declarer = this.game.trumpDeclarer;

      if (declarer === 0) {
        // Human picks trump
        this._showOverlay('trump-modal');
        this._status('Choose a trump suit for this round!');
      } else {
        // AI picks trump after a short think
        this._status(`${this.game.playerNames[declarer]} is choosing trump…`);
        setTimeout(() => {
          const suit = this.game.aiChooseTrump(declarer);
          this.game.declareTrump(suit);
          this._updateHUD();
          this._status(`${this.game.playerNames[declarer]} chose trump: ${SUIT_SYMBOLS[suit]}`);
          setTimeout(() => this._dealLoop(), 450);
        }, 700);
      }
      return;
    }

    // Dealing complete — start play
    if (this.game.isDealingComplete()) {
      this._renderAllHands();
      this._status('All cards dealt. Starting play…');
      setTimeout(() => {
        this.game.startPlaying();
        this._renderAllHands();
        this._nextTurn();
      }, 700);
      return;
    }

    // Deal one card and schedule the next
    this.game.dealOneCard();

    // Refresh hand display every 8 cards to reduce DOM thrashing
    const totalDealt = this.game.hands.reduce((n, h) => n + h.length, 0);
    if (totalDealt % 8 === 0) this._renderAllHands();

    setTimeout(() => this._dealLoop(), 18);
  }

  _onTrumpChosen(suit) {
    this._hideOverlay('trump-modal');
    this.game.declareTrump(suit);
    this._updateHUD();
    this._status(`You chose trump: ${SUIT_SYMBOLS[suit]}`);
    setTimeout(() => this._dealLoop(), 350);
  }

  /* ==========================================================
     TURN MANAGEMENT
     ========================================================== */
  _nextTurn() {
    if (this.game.state !== 'PLAYING') return;

    const p = this.game.currentPlayer;
    this._highlightPlayer(p);

    if (p === 0) {
      // Human's turn — enable card clicks
      this._status('Your turn — click a card to play');
      this._renderHumanHand(true);
    } else {
      // AI turn
      this._renderHumanHand(false);
      this._status(`${this.game.playerNames[p]} is thinking…`);
      setTimeout(() => {
        const card = this.game.aiChooseCard(p);
        this._executePlay(p, card);
      }, this.aiDelay);
    }
  }

  _executePlay(player, card) {
    const result = this.game.playCard(player, card);

    // Update hand display (remove played card)
    if (player === 0) this._renderHumanHand(false);
    else              this._renderAIHand(player);

    // Animate the played card into the trick area
    this._showPlayedCard(player, card);

    if (!result || result.waiting) {
      // Trick not yet complete — next player
      this._nextTurn();
      return;
    }

    // Trick complete
    if (result.roundOver) {
      const msg = result.tens > 0
        ? `${result.winnerName} wins the last trick and captures ${result.tens} ten${result.tens > 1 ? 's' : ''}! 🎯`
        : `${result.winnerName} wins the last trick.`;
      this._status(msg);
      this._updateTensBadges();
      setTimeout(() => this._showRoundResult(), 1600);
    } else {
      const msg = result.tens > 0
        ? `${result.winnerName} wins the trick — captures ${result.tens} ten${result.tens > 1 ? 's' : ''}! 🎯`
        : `${result.winnerName} wins the trick.`;
      this._status(msg);
      this._updateTensBadges();
      setTimeout(() => {
        this._clearTrickArea();
        this._nextTurn();
      }, 1500);
    }
  }

  /* ==========================================================
     ROUND & MATCH RESULTS
     ========================================================== */
  _showRoundResult() {
    const result = this.game.getRoundResult();
    const [tA, tB] = [result.tensTeamA, result.tensTeamB];
    const [wA, wB] = this.game.teamWins;

    let headline, cls;
    if (result.roundWinner === 0) {
      headline = '🎉 Your team wins the round!';
      cls = 'result-win';
    } else if (result.roundWinner === 1) {
      headline = '😔 Opponent team wins the round.';
      cls = 'result-lose';
    } else {
      headline = "🤝 It's a tie — no point awarded.";
      cls = 'result-tie';
    }

    document.getElementById('round-title').textContent =
      `Round ${this.game.currentRound} of ${this.game.maxRounds} — Over`;

    document.getElementById('round-body').innerHTML = `
      <div class="${cls}">${headline}</div>
      <br>
      <b>10s captured this round:</b><br>
      👤 Your team (You + Robot2): <b>${tA}</b>&nbsp; tens<br>
      🤖 Robot team (R1 + R3): <b>${tB}</b>&nbsp; tens<br>
      <br>
      <b>Match score:</b> You team <b>${wA}</b> – <b>${wB}</b> Robot team
    `;

    const isOver = this.game.isMatchOver();
    document.getElementById('next-round-btn').style.display = isOver ? 'none' : '';

    this._showOverlay('round-modal');

    if (isOver) {
      setTimeout(() => {
        this._hideOverlay('round-modal');
        this._showMatchResult();
      }, 2800);
    }
  }

  _showMatchResult() {
    const winner  = this.game.getMatchWinner();
    const [wA, wB] = this.game.teamWins;

    let headline, cls;
    if (winner === 0) {
      headline = '🏆 Your team wins the match! Well played!';
      cls = 'result-win';
    } else if (winner === 1) {
      headline = '🤖 Robots win the match. Better luck next time!';
      cls = 'result-lose';
    } else {
      headline = "🤝 It's a draw!";
      cls = 'result-tie';
    }

    document.getElementById('gameover-title').textContent = 'Match Over!';
    document.getElementById('gameover-body').innerHTML = `
      <div class="${cls}">${headline}</div>
      <br>
      Final score: Your team <b>${wA}</b> – <b>${wB}</b> Robot team
    `;
    this._showOverlay('gameover-modal');
  }

  /* ==========================================================
     RENDERING — HANDS
     ========================================================== */
  _renderAllHands() {
    for (let p = 0; p < 4; p++) {
      if (p === 0) this._renderHumanHand(false);
      else         this._renderAIHand(p);
    }
  }

  /** Render the human player's hand (face-up). */
  _renderHumanHand(clickable) {
    const container = document.getElementById('hand-0');
    container.innerHTML = '';
    const validCards = clickable ? this.game.getValidCards(0) : [];

    for (const card of this.game.hands[0]) {
      const el      = this._makeCardEl(card);
      const isValid = validCards.includes(card);

      if (clickable) {
        if (isValid) {
          el.classList.add('playable');
          el.addEventListener('click', () => this._onHumanCardClick(card));
        } else {
          el.classList.add('dim');
          el.addEventListener('click', () => this._status('You must follow suit!'));
        }
      }
      container.appendChild(el);
    }
  }

  /** Render an AI player's hand as card backs. */
  _renderAIHand(player) {
    const container = document.getElementById(`hand-${player}`);
    container.innerHTML = '';
    for (let i = 0; i < this.game.hands[player].length; i++) {
      const back = document.createElement('div');
      back.className = 'card-back';
      back.textContent = '⊞';
      container.appendChild(back);
    }
  }

  /** Create a DOM element for a face-up card. */
  _makeCardEl(card) {
    const el = document.createElement('div');
    el.className = `card ${card.color}${card.isTen ? ' ten-card' : ''}`;
    el.innerHTML =
      `<span class="cv">${card.display}</span>` +
      `<span class="cs">${card.symbol}</span>` +
      `<span class="cvb">${card.display}</span>`;
    return el;
  }

  /* ==========================================================
     RENDERING — TRICK AREA
     ========================================================== */
  _showPlayedCard(player, card) {
    const cell = document.getElementById(`played-${player}`);
    if (!cell) return;
    cell.innerHTML = '';
    const el = this._makeCardEl(card);
    el.classList.add('deal-anim');
    cell.appendChild(el);
  }

  _clearTrickArea() {
    for (let p = 0; p < 4; p++) {
      const cell = document.getElementById(`played-${p}`);
      if (cell) cell.innerHTML = '';
    }
  }

  /* ==========================================================
     RENDERING — TENS BADGES (live score hints)
     ========================================================== */
  _updateTensBadges() {
    const [tA, tB] = this.game.tensWon;
    this._setBadge('tens-0', tA, 'Your team');
    this._setBadge('tens-2', tA, 'Your team');
  }

  _setBadge(id, value, label) {
    const el = document.getElementById(id);
    if (!el) return;
    if (value > 0) {
      el.textContent  = `${value} ten${value > 1 ? 's' : ''}`;
      el.classList.add('visible');
    } else {
      el.classList.remove('visible');
    }
  }

  _clearTensBadges() {
    ['tens-0', 'tens-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = ''; el.classList.remove('visible'); }
    });
  }

  /* ==========================================================
     HUD UPDATE
     ========================================================== */
  _updateHUD() {
    const g = this.game;
    document.getElementById('round-num').textContent = g.currentRound || '—';
    document.getElementById('wins-a').textContent    = g.teamWins[0];
    document.getElementById('wins-b').textContent    = g.teamWins[1];

    const span = document.getElementById('trump-suit');
    if (g.trump) {
      span.textContent = SUIT_SYMBOLS[g.trump];
      span.style.color = SUIT_COLORS[g.trump] === 'red' ? '#ff5252' : '#fff';
    } else {
      span.textContent = '—';
      span.style.color = '';
    }
  }

  /* ==========================================================
     PLAYER HIGHLIGHT
     ========================================================== */
  _highlightPlayer(activePlayer) {
    const areaMap = { 0: 'area-bottom', 1: 'area-right', 2: 'area-top', 3: 'area-left' };
    document.querySelectorAll('.player-area').forEach(a => a.classList.remove('active'));
    const area = document.getElementById(areaMap[activePlayer]);
    if (area) area.classList.add('active');
  }

  /* ==========================================================
     HUMAN CARD CLICK
     ========================================================== */
  _onHumanCardClick(card) {
    if (this.game.state !== 'PLAYING') return;
    if (this.game.currentPlayer !== 0)  return;
    // Render without clicks immediately to prevent double-play
    this._renderHumanHand(false);
    this._executePlay(0, card);
  }

  /* ==========================================================
     STATUS BAR
     ========================================================== */
  _status(msg) {
    document.getElementById('status-text').textContent = msg;
  }

  /* ==========================================================
     SCREEN / OVERLAY HELPERS
     ========================================================== */
  _showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }

  _showOverlay(id) { document.getElementById(id).classList.remove('hidden'); }
  _hideOverlay(id) { document.getElementById(id).classList.add('hidden'); }
}

/* Boot */
window.addEventListener('load', () => { new UI(); });
