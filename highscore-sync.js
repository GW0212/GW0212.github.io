
/**
 * High Score Cloud Sync (Global per-game)
 * Requires window.__FIREBASE_CONFIG__ to be defined (see firebase-config.js).
 * Falls back to local-only if missing.
 */
(function(){
  const LOG_PREFIX = "[HS-SYNC]";
  const GAME_IDS = ["aim","reaction","typing","whack","dodge"];
  const COLLECTION = "minigame_highscores_global";
  const toNum = (v) => {
    const n = Number(String(v).replace(/[^0-9.\-]/g,""));
    return Number.isFinite(n) ? n : 0;
  };
  const CONFIG = (typeof window.__FIREBASE_CONFIG__ !== "undefined") ? window.__FIREBASE_CONFIG__ : null;
  let fb = null;

  async function initFirebase(){
    if (!CONFIG) { console.info(LOG_PREFIX, "No Firebase config; cloud sync disabled."); return null; }
    try {
      const [{ initializeApp }, { getFirestore, doc, getDoc, setDoc, serverTimestamp }]
        = await Promise.all([
            import("https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js"),
            import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js"),
          ]);
      const app = initializeApp(CONFIG);
      const db = getFirestore(app);
      return { db, doc, getDoc, setDoc, serverTimestamp };
    } catch(e){ console.warn(LOG_PREFIX, "Init failed:", e); return null; }
  }

  function getLocalHigh(gameId){
    const candidates = [
      `highscore_${gameId}`, `${gameId}_highscore`, `${gameId}HighScore`, `${gameId}Best`, `best_${gameId}`
    ];
    for (const k of candidates){
      const v = localStorage.getItem(k);
      if (v != null) return toNum(v);
    }
    let best = 0;
    for (let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i) || "";
      const val = localStorage.getItem(key);
      const k = key.toLowerCase();
      if ((k.includes("high") && k.includes("score")) || k.includes("best")){
        best = Math.max(best, toNum(val));
      }
    }
    return best;
  }
  function setLocalHigh(gameId, score){
    const key = `highscore_${gameId}`;
    const prev = toNum(localStorage.getItem(key));
    if (score > prev) localStorage.setItem(key, String(score));
  }

  async function getCloudHigh(gameId){
    if (!fb) return 0;
    const { db, doc, getDoc } = fb;
    try {
      const ref = doc(db, COLLECTION, gameId);
      const snap = await getDoc(ref);
      return snap.exists() ? toNum(snap.data().score) : 0;
    } catch(e){ console.warn(LOG_PREFIX, "getCloudHigh:", e); return 0; }
  }
  async function setCloudHigh(gameId, score){
    if (!fb) return false;
    const { db, doc, setDoc, serverTimestamp } = fb;
    try {
      const ref = doc(db, COLLECTION, gameId);
      await setDoc(ref, { score: Number(score), updatedAt: serverTimestamp() }, { merge: true });
      console.info(LOG_PREFIX, `Cloud updated: ${gameId} -> ${score}`);
      return true;
    } catch(e){ console.warn(LOG_PREFIX, "setCloudHigh:", e); return false; }
  }

  window.updateHighScore = async function(gameId, newScore){
    try {
      const merged = Math.max(getLocalHigh(gameId), toNum(newScore));
      setLocalHigh(gameId, merged);
      const cloudBest = await getCloudHigh(gameId);
      if (merged > cloudBest) await setCloudHigh(gameId, merged);
    } catch(e){ console.warn(LOG_PREFIX, "updateHighScore:", e); }
  };

  const _setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value){
    _setItem(key, value);
    try{
      const k = String(key).toLowerCase();
      if ((k.includes("high") && k.includes("score")) || k.includes("best")){
        const gameId = GAME_IDS.find(id => k.includes(id)) || GAME_IDS[0];
        window.updateHighScore(gameId, toNum(value));
      }
    } catch(e){ console.warn(LOG_PREFIX, "intercept:", e); }
  };

  (async function boot(){
    fb = await initFirebase(); // may be null for local-only
    for (const gameId of GAME_IDS){
      const localBest = getLocalHigh(gameId);
      const cloudBest = await getCloudHigh(gameId);
      const merged = Math.max(localBest, cloudBest);
      if (merged > localBest) setLocalHigh(gameId, merged);
      if (merged > cloudBest) await setCloudHigh(gameId, merged);
      console.info(LOG_PREFIX, `Ready: ${gameId} local=${localBest} cloud=${cloudBest} merged=${merged}`);
    }
  })();
})();
