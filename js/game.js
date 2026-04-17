// ============================================================
//  10 Coat — Game Logic
//  Rules:
//    • 4 players, 2 teams: [You(0) + Robot2(2)]  vs  [Robot1(1) + Robot3(3)]
//    • Deal clockwise one card at a time; first player to receive 5 cards
//      must declare the trump suit.
//    • Trick-taking: must follow suit; trump beats all other suits.
//    • Objective: capture the most 10-cards (10♠ 10♥ 10♦ 10♣) per round.
//    • Win 2 of 3 rounds to win the match.
// ============================================================

'use strict';

/* ---- Constants ---- */
const SUITS        = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_COLORS  = { spades: 'black', hearts: 'red', diamonds: 'red', clubs: 'black' };
const VALUE_NAMES  = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function valName(v) { return VALUE_NAMES[v] || String(v); }

/* ---- Card class ---- */
class Card {
  constructor(suit, value) {
    this.suit  = suit;   // 'spades' | 'hearts' | 'diamonds' | 'clubs'
    this.value = value;  // 2–14  (11=J 12=Q 13=K 14=A)
  }
  get isTen()   { return this.value === 10; }
  get symbol()  { return SUIT_SYMBOLS[this.suit]; }
  get color()   { return SUIT_COLORS[this.suit]; }
  get display() { return valName(this.value); }
}

/* ---- Main game class ---- */
class TenCoatGame {
  constructor() {
    // Persistent across rounds
    this.playerNames = ['You', 'Robot1', 'Robot2', 'Robot3'];
    // Team 0: players 0 & 2  |  Team 1: players 1 & 3
    this.teamWins    = [0, 0];
    this.currentRound = 0;
    this.maxRounds    = 3;
    this.state        = 'IDLE'; // IDLE | DEALING | TRUMP_DECLARE | PLAYING | ROUND_OVER | GAME_OVER
  }

  /* ==========================================================
     ROUND INITIALISATION
     ========================================================== */
  initRound() {
    this.currentRound++;
    this.deck            = this._makeDeck();
    this.hands           = [[], [], [], []];  // hands[playerIdx] = Card[]
    this.currentTrick    = [];               // { player, card }[]
    this.completedTricks = [];
    this.tricksWon       = [0, 0, 0, 0];
    this.tensWon         = [0, 0];           // per team
    this.trumpTenTeam    = -1;               // which team captured the trump-suit 10
    this.trump           = null;
    this.trumpDeclared   = false;
    this.trumpDeclarer   = -1;
    this.dealingPlayer   = 0;
    this.currentPlayer   = 0;
    this.leadPlayer      = 0;
    this.state           = 'DEALING';
    this._shuffle();
  }

  _makeDeck() {
    const deck = [];
    for (const suit of SUITS)
      for (let v = 2; v <= 14; v++)
        deck.push(new Card(suit, v));
    return deck;
  }

  _shuffle() {
    const d = this.deck;
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
  }

  /* ==========================================================
     DEALING  (called repeatedly by UI until dealing is complete)
     Returns: { needsTrump: true, player } | { needsTrump: false } | { done: true }
     ========================================================== */
  dealOneCard() {
    if (this.deck.length === 0) return { done: true };

    const card = this.deck.pop();
    const p    = this.dealingPlayer;
    this.hands[p].push(card);
    const count = this.hands[p].length;
    this.dealingPlayer = (p + 1) % 4;

    // First player whose hand reaches 5 cards declares trump
    if (count === 5 && !this.trumpDeclared) {
      this.trumpDeclarer = p;
      this.state         = 'TRUMP_DECLARE';
      return { needsTrump: true, player: p };
    }
    return { needsTrump: false };
  }

  isDealingComplete() {
    return this.hands.every(h => h.length === 13);
  }

  declareTrump(suit) {
    this.trump         = suit;
    this.trumpDeclared = true;
    this.state         = 'DEALING';
  }

  /* ==========================================================
     START PLAYING
     ========================================================== */
  startPlaying() {
    this._sortHands();
    this.state         = 'PLAYING';
    this.currentPlayer = 0;
    this.leadPlayer    = 0;
  }

  _sortHands() {
    // Alternating colour order: ♠black → ♥red → ♣black → ♦red
    const suitRank = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
    for (let i = 0; i < 4; i++) {
      this.hands[i].sort((a, b) => {
        const sd = suitRank[a.suit] - suitRank[b.suit];
        return sd !== 0 ? sd : b.value - a.value;
      });
    }
  }

  /* ==========================================================
     PLAYING A CARD
     ========================================================== */

  /** Returns the subset of player's hand that are valid to play. */
  getValidCards(player) {
    const hand = this.hands[player];
    if (this.currentTrick.length === 0) return hand.slice(); // leading — any card
    const ledSuit  = this.currentTrick[0].card.suit;
    const matching = hand.filter(c => c.suit === ledSuit);
    return matching.length > 0 ? matching : hand.slice(); // void — any card
  }

  isValidPlay(player, card) {
    return this.getValidCards(player).includes(card);
  }

  /**
   * Plays `card` for `player`.
   * Returns:
   *   { waiting: true }                               — trick not yet complete
   *   { trickWinner, winnerName, tens }               — trick complete, round continues
   *   { trickWinner, winnerName, tens, roundOver:true }— trick complete, round ends
   */
  playCard(player, card) {
    const idx = this.hands[player].indexOf(card);
    if (idx === -1) return { waiting: true };
    this.hands[player].splice(idx, 1);
    this.currentTrick.push({ player, card });

    if (this.currentTrick.length === 4) return this._resolveTrick();
    this.currentPlayer = (this.currentPlayer + 1) % 4;
    return { waiting: true };
  }

  _resolveTrick() {
    const trick   = this.currentTrick;
    const ledSuit = trick[0].card.suit;
    const winner  = this._findTrickWinner(trick, ledSuit);
    const winTeam = this._teamOf(winner.player);

    const tens = trick.reduce((n, e) => n + (e.card.isTen ? 1 : 0), 0);
    this.tensWon[winTeam]         += tens;
    this.tricksWon[winner.player] += 1;
    this.completedTricks.push({ entries: trick.slice(), winner: winner.player, tens });

    // Track which team captures the trump-suit 10 (tiebreaker)
    if (trick.some(e => e.card.suit === this.trump && e.card.value === 10))
      this.trumpTenTeam = winTeam;

    const result = {
      trickWinner: winner.player,
      winnerName:  this.playerNames[winner.player],
      tens,
    };

    this.currentTrick  = [];
    this.leadPlayer    = winner.player;
    this.currentPlayer = winner.player;

    if (this.hands[0].length === 0) {
      this.state = 'ROUND_OVER';
      return { ...result, roundOver: true };
    }
    return result;
  }

  /* ---------- Trick-winner logic ---------- */
  _findTrickWinner(trick, ledSuit) {
    let best = trick[0];
    for (let i = 1; i < trick.length; i++) {
      if (this._beats(trick[i].card, best.card, ledSuit)) best = trick[i];
    }
    return best;
  }

  /**
   * Returns true if `challenger` beats `current` given the led suit.
   */
  _beats(challenger, current, ledSuit) {
    const cIsTrump  = current.suit     === this.trump;
    const chIsTrump = challenger.suit  === this.trump;

    if (chIsTrump  && !cIsTrump)  return true;                           // trump beats non-trump
    if (!chIsTrump &&  cIsTrump)  return false;                          // non-trump can't beat trump
    if (chIsTrump  &&  cIsTrump)  return challenger.value > current.value; // higher trump wins
    // Neither is trump:
    if (challenger.suit === ledSuit && current.suit !== ledSuit) return true; // led-suit beats off-suit
    if (challenger.suit === ledSuit && current.suit === ledSuit) return challenger.value > current.value;
    return false; // off-suit, non-trump cannot win
  }

  /* ==========================================================
     ROUND & MATCH RESULTS
     ========================================================== */

  /**
   * Returns { tensTeamA, tensTeamB, roundWinner, trumpTiebreak }
   * roundWinner: 0 = team A (You+R2), 1 = team B (R1+R3), -1 = tie
   * If both teams have 2 tens, the team that captured the trump-suit 10 wins.
   */
  getRoundResult() {
    const [tA, tB] = this.tensWon;
    let roundWinner = -1;
    let trumpTiebreak = false;

    if (tA > tB) {
      roundWinner = 0; this.teamWins[0]++;
    } else if (tB > tA) {
      roundWinner = 1; this.teamWins[1]++;
    } else {
      // 2–2 tie: trump 10 holder wins
      trumpTiebreak = true;
      if (this.trumpTenTeam === 0)      { roundWinner = 0; this.teamWins[0]++; }
      else if (this.trumpTenTeam === 1) { roundWinner = 1; this.teamWins[1]++; }
    }

    return { tensTeamA: tA, tensTeamB: tB, roundWinner, trumpTiebreak };
  }

  isMatchOver() {
    return this.teamWins[0] >= 2 || this.teamWins[1] >= 2 || this.currentRound >= this.maxRounds;
  }

  /** Returns 0, 1, or -1 (tie) */
  getMatchWinner() {
    const [wA, wB] = this.teamWins;
    if (wA > wB) return 0;
    if (wB > wA) return 1;
    return -1;
  }

  /* ==========================================================
     HELPERS
     ========================================================== */
  _teamOf(player) { return player % 2; }  // 0,2 → team 0 ; 1,3 → team 1

  /* ==========================================================
     AI — TRUMP SELECTION
     Choose the suit with the most cards in hand (tie-break: highest card).
     ========================================================== */
  aiChooseTrump(player) {
    const hand   = this.hands[player];
    const counts = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
    for (const c of hand) counts[c.suit]++;

    return Object.entries(counts).reduce((best, entry) => {
      if (entry[1] > best[1]) return entry;
      if (entry[1] === best[1]) {
        const bestMax  = Math.max(...hand.filter(c => c.suit === best[0]).map(c => c.value));
        const entryMax = Math.max(...hand.filter(c => c.suit === entry[0]).map(c => c.value));
        return entryMax > bestMax ? entry : best;
      }
      return best;
    })[0];
  }

  /* ==========================================================
     AI — CARD SELECTION
     Strategy:
       • Lead: highest non-trump (unless only trump left)
       • Follow suit: deposit a 10 onto a safe partner win; else lowest card
       • Void: dump a non-trump 10 if partner is winning; else trump/discard
     ========================================================== */
  aiChooseCard(player) {
    const hand  = this.hands[player];
    const trick = this.currentTrick;

    if (trick.length === 0) return this._aiLead(player, hand);

    const ledSuit  = trick[0].card.suit;
    const matching = hand.filter(c => c.suit === ledSuit);
    if (matching.length > 0) return this._aiFollow(player, matching, trick, ledSuit);
    return this._aiVoid(player, hand, trick, ledSuit);
  }

  _aiLead(player, hand) {
    // Prefer leading high non-trump to establish control
    const nonTrump = hand.filter(c => c.suit !== this.trump);
    const pool     = nonTrump.length > 0 ? nonTrump : hand;
    return pool.reduce((best, c) => c.value > best.value ? c : best);
  }

  _aiFollow(player, matching, trick, ledSuit) {
    const winner      = this._findTrickWinner(trick, ledSuit);
    const partnerWins = this._teamOf(winner.player) === this._teamOf(player);

    if (partnerWins) {
      // Partner is winning — deposit a 10 if the win looks safe, else play cheapest
      const tens = matching.filter(c => c.isTen);
      if (tens.length > 0 && this._partnerWinSafe(winner.card, trick)) return tens[0];
      return matching.reduce((lo, c) => c.value < lo.value ? c : lo);
    }

    // Opponent winning — try to beat with minimum effort
    const canBeat = matching.filter(c => this._beats(c, winner.card, ledSuit));
    if (canBeat.length > 0) {
      return canBeat.reduce((lo, c) => c.value < lo.value ? c : lo);
    }
    return matching.reduce((lo, c) => c.value < lo.value ? c : lo);
  }

  _aiVoid(player, hand, trick, ledSuit) {
    const winner      = this._findTrickWinner(trick, ledSuit);
    const partnerWins = this._teamOf(winner.player) === this._teamOf(player);
    const trumpCards  = hand.filter(c => c.suit === this.trump);
    const nonTrump    = hand.filter(c => c.suit !== this.trump);

    if (partnerWins) {
      // Dump a non-trump 10 — it can't win the trick anyway, and partner will capture it
      const dumpTen = nonTrump.filter(c => c.isTen);
      if (dumpTen.length > 0) return dumpTen[0];
      const pool = nonTrump.length > 0 ? nonTrump : hand;
      return pool.reduce((lo, c) => c.value < lo.value ? c : lo);
    }

    // Opponent winning — use lowest trump that beats current winner
    if (trumpCards.length > 0) {
      const winTrumps = winner.card.suit === this.trump
        ? trumpCards.filter(c => c.value > winner.card.value)
        : trumpCards;
      if (winTrumps.length > 0) {
        return winTrumps.reduce((lo, c) => c.value < lo.value ? c : lo);
      }
    }

    const pool = nonTrump.length > 0 ? nonTrump : hand;
    return pool.reduce((lo, c) => c.value < lo.value ? c : lo);
  }

  // True when it's safe for the ally to deposit a 10 onto partner's winning trick.
  // Safe if: we're last to play, partner has an Ace, or partner holds trump Ace/King.
  _partnerWinSafe(winCard, trick) {
    if (trick.length === 3) return true;                                    // we're last — guaranteed
    if (winCard.value === 14) return true;                                  // Ace of any suit
    if (winCard.suit === this.trump && winCard.value >= 13) return true;    // trump K or A
    return false;
  }
}

/* ---- Expose globals ---- */
window.TenCoatGame  = TenCoatGame;
window.SUITS        = SUITS;
window.SUIT_SYMBOLS = SUIT_SYMBOLS;
window.SUIT_COLORS  = SUIT_COLORS;
window.valName      = valName;
