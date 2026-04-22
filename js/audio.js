// ============================================================
//  Das Coat — Audio (Howler wrapper with graceful fallback)
//  If asset files are missing, every call is a silent no-op.
// ============================================================
'use strict';

(function () {
  const prefs = JSON.parse(localStorage.getItem('dascoat.audio') || '{}');
  const state = {
    sfxOn:   prefs.sfxOn   !== false,
    musicOn: prefs.musicOn !== false,
    unlocked: false,
    music: null,
  };

  const H = (typeof Howl !== 'undefined') ? Howl : null;

  const SFX_MANIFEST = {
    shuffle:     'assets/sfx/shuffle.mp3',
    deal:        'assets/sfx/deal.mp3',
    flip:        'assets/sfx/flip.mp3',
    play:        'assets/sfx/play.mp3',
    trick_win:   'assets/sfx/trick_win.mp3',
    trick_lose:  'assets/sfx/trick_lose.mp3',
    ten_capture: 'assets/sfx/ten_capture.mp3',
    round_win:   'assets/sfx/round_win.mp3',
    round_lose:  'assets/sfx/round_lose.mp3',
    button:      'assets/sfx/button.mp3',
  };
  const BGM = 'assets/bgm/table_loop.mp3';

  const sounds = {};
  if (H) {
    Object.entries(SFX_MANIFEST).forEach(([k, src]) => {
      sounds[k] = new H({ src:[src], volume:0.55, onloaderror:()=>{}, preload:true });
    });
  }

  function persist() {
    localStorage.setItem('dascoat.audio', JSON.stringify({
      sfxOn: state.sfxOn, musicOn: state.musicOn,
    }));
  }

  function play(key) {
    if (!state.sfxOn || !sounds[key]) return;
    try { sounds[key].play(); } catch (e) {}
  }

  function startMusic() {
    if (!H || !state.musicOn || state.music) return;
    state.music = new H({ src:[BGM], loop:true, volume:0.25, onloaderror:()=>{} });
    try { state.music.play(); } catch (e) {}
  }

  function stopMusic() {
    if (state.music) { try { state.music.stop(); } catch(e){} state.music = null; }
  }

  function unlock() {
    if (state.unlocked) return;
    state.unlocked = true;
    startMusic();
  }

  function setSfx(on)   { state.sfxOn = on; persist(); }
  function setMusic(on) {
    state.musicOn = on; persist();
    if (on) startMusic(); else stopMusic();
  }

  window.DasAudio = {
    play, unlock, setSfx, setMusic,
    get sfxOn()   { return state.sfxOn; },
    get musicOn() { return state.musicOn; },
  };

  // First-tap autoplay unlock (mobile-safe)
  const onFirstTap = () => {
    window.DasAudio.unlock();
    window.removeEventListener('pointerdown', onFirstTap);
    window.removeEventListener('keydown', onFirstTap);
  };
  window.addEventListener('pointerdown', onFirstTap);
  window.addEventListener('keydown', onFirstTap);
})();
