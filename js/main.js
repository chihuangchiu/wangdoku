/*
 * Pupdoku 主程式：關卡進度、UI 綁定與畫面繪製
 */

(function () {
  'use strict';

  const { Game, DOG, MARK, EMPTY } = window.PupdokuGame;
  const t = (k, p) => window.I18N.t(k, p);
  // 難度等級（UI）：入門用小盤面 6×6 + 最基本技巧；其餘 8×8，只由推理難度決定
  const LEVELS = [
    { label: 'diffBeginner', n: 6, bucket: 0 },
    { label: 'diffEasy', n: 8, bucket: 0 },
    { label: 'diffMedium', n: 8, bucket: 1 },
    { label: 'diffHard', n: 10, bucket: 2 },
  ];
  const DIFF_NAME = ['beginner', 'easy', 'medium', 'hard']; // GA 事件用固定英文名
  const diffLabel = (lvl) => t(LEVELS[lvl].label);
  // 由題目推回 UI 難度等級（給分享載入用）：6×6=入門；8×8 依技巧桶 +1
  const levelOf = (p) => (p.n <= 6 ? 0 : (p.difficulty || 0) + 1);
  const track = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  };

  const el = {
    board: document.getElementById('board'),
    status: document.getElementById('status'),
    statTimer: document.getElementById('stat-timer'),
    statToday: document.getElementById('stat-today'),
    statTotal: document.getElementById('stat-total'),
    diffBadge: document.getElementById('diff-badge'),
    diffBtns: [...document.querySelectorAll('.diff-btn')],
    newBtn: document.getElementById('new-btn'),
    hintBtn: document.getElementById('hint-btn'),
    clearBtn: document.getElementById('clear-btn'),
    undoBtn: document.getElementById('undo-btn'),
    shareBtn: document.getElementById('share-btn'),
    win: document.getElementById('win-overlay'),
    winNext: document.getElementById('win-next'),
    winText: document.getElementById('win-text'),
    shareX: document.getElementById('share-x'),
    shareFb: document.getElementById('share-fb'),
    shareCopy: document.getElementById('share-copy'),
    brand: document.getElementById('brand'),
    aboutOverlay: document.getElementById('about-overlay'),
    aboutBody: document.getElementById('about-body'),
    aboutDots: document.getElementById('about-dots'),
    aboutPrev: document.getElementById('about-prev'),
    aboutNext: document.getElementById('about-next'),
    aboutClose: document.getElementById('about-close'),
  };

  let game = null;
  let revealAnim = false; // 開新局時，格子逐格彈出換色的波浪動畫
  let difficulty = 1;    // 目前選的難度等級（UI）0=入門 1=簡單 2=中等 3=困難
  let currentLevel = 1;  // 目前這題實際的難度等級（給徽章/分享用）
  let hintsUsed = 0;
  let startTime = 0;
  let timerId = null;
  let lastElapsed = 0; // 最近一次過關的用時（給社群分享文字用）

  // === 1 vs 1 對戰模式 ===
  const VS_TARGET = 4;                     // 先放對幾隻狗算贏
  const AI_TICK_MS = 3000;                 // 電腦每步間隔（每 3 秒一個動作）
  const AI_THINK_MIN = 2, AI_THINK_MAX = 4; // 放每隻狗前「暗中思考/畫叉」的 tick 數
  const AI_N = 7, AI_BUCKET = 2;           // 7×7 困難
  let mode = 'single';                     // 'single' | 'vs'
  let ownerAt = null;                      // Map "r,c" -> 'me' | 'ai'（誰放的狗）
  let aiSolver = null;                     // 電腦私有大腦（js/ai.js）
  let aiTimer = null;
  let myScore = 0, aiScore = 0;
  let vsOver = false;
  let aiPending = null, aiThinkBudget = 0; // 電腦決定好、正在「思考」還沒放到盤上的狗

  // === 統計（存 localStorage，依難度分開）===
  const STATS_KEY = 'pupdoku_stats_v1';
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveStats(s) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) { /* 忽略 */ }
  }
  let stats = loadStats();
  const diffStats = (d) => (stats[d] = stats[d] || { solved: 0, todayCount: 0, todayDate: todayStr() });

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  // 若已跨日，把今日計數歸零
  function refreshToday(st) {
    const t = todayStr();
    if (st.todayDate !== t) { st.todayDate = t; st.todayCount = 0; }
  }

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function startTimer() {
    stopTimer();
    startTime = Date.now();
    el.statTimer.textContent = '00:00';
    timerId = setInterval(() => {
      el.statTimer.textContent = fmt(Date.now() - startTime);
    }, 500);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  // 出新題時只歸零、不起跑；等第一個動作才開始計時
  function resetTimer() { stopTimer(); startTime = 0; el.statTimer.textContent = '00:00'; }
  function ensureTimer() { if (startTime === 0) startTimer(); }

  function renderStats() {
    const st = diffStats(difficulty);
    refreshToday(st);
    el.statToday.textContent = st.todayCount;
    el.statTotal.textContent = st.solved;
  }

  // 開始一局（產生的或分享載入的）
  function startPuzzle(puzzle, opts) {
    opts = opts || {};
    game = new Game(puzzle);
    hintsUsed = 0;
    currentLevel = (opts.level != null) ? opts.level : levelOf(puzzle);
    updateBadge(currentLevel);
    revealAnim = true; // 每次開新局都跑一次波浪揭示
    render();
    renderStats();
    resetTimer(); // 計時等第一個動作才開始
    setStatus(() => (opts.shared ? t('statusShared') : t('statusStart')), opts.shared ? 'hint' : undefined);
  }

  // 是否有「未完成的進度」（放了狗或標了 ❌，且尚未過關）
  function hasProgress() {
    if (!game || game.won) return false;
    for (let r = 0; r < game.n; r++) for (let c = 0; c < game.n; c++)
      if (game.grid[r][c] !== EMPTY) return true;
    return false;
  }

  function newGame() {
    stopTimer();
    setStatus(() => t('statusGenerating'));
    el.board.innerHTML = '<div class="board-loading">🎲</div>'; // 生成中畫面（困難題較久時特別有感）
    clearShareParam(); // 產生新題就把網址上的分享參數清掉
    setTimeout(() => {
      const L = LEVELS[difficulty];
      const puzzle = window.PupdokuGenerator.generateByDifficulty(L.n, L.bucket);
      startPuzzle(puzzle, { level: difficulty });
    }, 20);
  }

  // === 分享：把題目壓縮進網址參數 ?p= ===
  // 每格顏色 id 只需 ceil(log2(n)) bits，全部位元打包後轉 base64url；
  // 難度不存（載入時即時重算），網址更短。8×8 約 33 字。
  const bitsPerCell = (n) => Math.max(1, Math.ceil(Math.log2(n)));

  function b64url(bytes) {
    let bin = '';
    for (const x of bytes) bin += String.fromCharCode(x);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // 把區塊重新用「首次出現順序」編號（0,1,2,…），與實際 id 標號無關
  function canonRegions(regions, n) {
    const map = new Map(); let next = 0;
    const g = Array.from({ length: n }, () => new Array(n));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const id = regions[r][c];
      if (!map.has(id)) map.set(id, next++);
      g[r][c] = map.get(id);
    }
    return g;
  }

  // 預測式編碼：色塊連續，多數格跟「左/上」同色
  //   0        = 跟左邊同色
  //   10       = 跟上面同色
  //   110      = 新的顏色
  //   111+id   = 其他既有顏色（罕見）
  function encodePuzzle(pz) {
    const n = pz.n, bpc = bitsPerCell(n), g = canonRegions(pz.regions, n);
    const bits = [];
    const w1 = (b) => bits.push(b & 1);
    const wN = (v, k) => { for (let i = k - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    let seen = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = g[r][c], left = c > 0 ? g[r][c - 1] : -1, up = r > 0 ? g[r - 1][c] : -1;
      if (v === left) w1(0);
      else if (v === up) { w1(1); w1(0); }
      else if (v === seen) { w1(1); w1(1); w1(0); seen++; }
      else { w1(1); w1(1); w1(1); wN(v, bpc); }
    }
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    bits.forEach((b, i) => { if (b) bytes[i >> 3] |= (128 >> (i & 7)); });
    return n.toString(36) + b64url(bytes);
  }
  function decodePuzzle(code) {
    try {
      const n = parseInt(code[0], 36);
      if (!(n >= 4 && n <= 12)) return null;
      const bpc = bitsPerCell(n);
      const bytes = unb64url(code.slice(1)), total = bytes.length * 8;
      let pos = 0;
      const r1 = () => { if (pos >= total) throw 0; const b = (bytes[pos >> 3] >> (7 - (pos & 7))) & 1; pos++; return b; };
      const rN = (k) => { let v = 0; for (let i = 0; i < k; i++) v = (v << 1) | r1(); return v; };
      const g = Array.from({ length: n }, () => new Array(n));
      let seen = 0;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        let v;
        if (r1() === 0) { if (c === 0) return null; v = g[r][c - 1]; }
        else if (r1() === 0) { if (r === 0) return null; v = g[r - 1][c]; }
        else if (r1() === 0) { v = seen++; }
        else { v = rN(bpc); if (v >= seen) return null; }
        if (v < 0 || v >= n) return null;
        g[r][c] = v;
      }
      if (seen !== n) return null; // 必須剛好 n 個顏色
      const solution = window.PupdokuSolver.solve(n, g);
      if (!solution) return null;
      const diff = window.PupdokuDifficulty.rate(g).bucket;
      return { n, regions: g, solution, difficulty: diff };
    } catch (e) { return null; }
  }
  function clearShareParam() {
    if (new URLSearchParams(location.search).has('p'))
      history.replaceState(null, '', location.pathname);
  }
  function loadFromURL() {
    const code = new URLSearchParams(location.search).get('p');
    if (!code) return false;
    const puzzle = decodePuzzle(code);
    if (!puzzle) { setStatus(() => t('statusInvalidShare')); return false; }
    const level = levelOf(puzzle);
    difficulty = level;
    el.diffBtns.forEach((b) => b.classList.toggle('is-active', +b.dataset.diff === level));
    stopTimer();
    startPuzzle(puzzle, { shared: true, level });
    return true;
  }

  function updateBadge(level) {
    el.diffBadge.textContent = diffLabel(level);
    el.diffBadge.className = 'diff-badge diff-' + level;
  }

  function setDifficulty(d) {
    difficulty = d;
    el.diffBtns.forEach((b) => b.classList.toggle('is-active', +b.dataset.diff === d));
    track('select_difficulty', { difficulty: DIFF_NAME[d] });
    newGame();
  }

  // msg 可以是字串，或「回傳字串的函式」（後者可在切語言時重新繪製）
  let statusRender = null;
  function setStatus(msg, kind) {
    statusRender = (typeof msg === 'function') ? msg : null;
    el.status.textContent = (typeof msg === 'function') ? msg() : msg;
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }
  function refreshStatus() { if (statusRender) el.status.textContent = statusRender(); }

  function render() {
    const n = game.n;
    el.board.style.setProperty('--n', n);
    el.board.innerHTML = '';
    const conflicts = game.conflicts();

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.style.background = game.palette[game.regions[r][c]];
        cell.dataset.r = r;
        cell.dataset.c = c;

        // 區塊邊界：與鄰格不同色時加粗邊線
        const reg = game.regions[r][c];
        if (r === 0 || game.regions[r - 1][c] !== reg) cell.classList.add('b-top');
        if (r === n - 1 || game.regions[r + 1][c] !== reg) cell.classList.add('b-bottom');
        if (c === 0 || game.regions[r][c - 1] !== reg) cell.classList.add('b-left');
        if (c === n - 1 || game.regions[r][c + 1] !== reg) cell.classList.add('b-right');

        const v = game.grid[r][c];
        if (v === DOG) {
          cell.textContent = '🐶';
          if (mode === 'vs' && ownerAt) {
            const who = ownerAt.get(`${r},${c}`);
            if (who === 'ai') cell.classList.add('dog-ai');
            else if (who === 'me') cell.classList.add('dog-me');
          } else if (conflicts.has(`${r},${c}`)) cell.classList.add('conflict');
        } else if (v === MARK) {
          cell.textContent = '❌';
          cell.classList.add('mark');
        }
        // 開新局：由左上往右下逐格彈出（對角波浪）
        if (revealAnim) {
          cell.classList.add('reveal');
          cell.style.animationDelay = (r + c) * 32 + 'ms';
        }
        el.board.appendChild(cell);
      }
    }
    if (revealAnim) {
      revealAnim = false;
      const total = (2 * (n - 1)) * 32 + 420; // 動畫全部結束後清掉 class，恢復一般行為
      setTimeout(() => el.board.querySelectorAll('.cell.reveal').forEach((c) => {
        c.classList.remove('reveal'); c.style.animationDelay = '';
      }), total);
    }
  }

  function onCellClick(r, c, right) {
    if (mode === 'vs') { onVsClick(r, c, right); return; }
    if (!game.won) ensureTimer(); // 第一個動作開始計時
    if (right) game.setDog(r, c);
    else game.cycle(r, c);

    if (game.checkWin()) {
      render();
      onWin();
    } else {
      render();
    }
  }

  function onWin() {
    stopTimer();
    const elapsed = startTime ? Date.now() - startTime : 0;
    lastElapsed = elapsed;
    const st = diffStats(difficulty);
    refreshToday(st);
    st.solved += 1;
    st.todayCount += 1;
    saveStats(stats);
    renderStats();
    track('puzzle_solved', {
      difficulty: DIFF_NAME[currentLevel],
      seconds: Math.round(elapsed / 1000),
      hints_used: hintsUsed,
    });

    setStatus(() => t('statusWin', { time: fmt(elapsed) }), 'good');
    const dogEl = document.querySelector('.win-dog');
    if (dogEl) dogEl.textContent = '🎉🐶'; // 從 1v1 回來後可能被改過，復原
    el.winText.innerHTML =
      `${t('winTitle', { time: fmt(elapsed) })}<br><small>${t('winSubtitle', { today: st.todayCount, total: st.solved })}</small>`;
    el.winNext.textContent = t('winNext');
    celebrate(); // 狗狗蹦跳 + 彩帶
    setTimeout(() => {
      el.win.classList.add('show');
      maybeShowInstall(); // 首次過關順勢邀請加到主畫面
    }, 1300); // 先讓玩家看到盤上加長的慶祝，再滑出結算卡片
  }

  // 過關慶祝：盤上狗狗一起蹦跳，畫面灑彩帶
  function celebrate() {
    const dogs = [...el.board.querySelectorAll('.cell')].filter((c) => c.textContent === '🐶');
    dogs.forEach((c, i) => {
      c.style.setProperty('--cheer-delay', i * 55 + 'ms');
      c.classList.add('cheer');
    });
    setTimeout(() => dogs.forEach((c) => {
      c.classList.remove('cheer'); c.style.removeProperty('--cheer-delay');
    }), 2900); // 蹦跳 4 回合，時間比原本加倍

    const colors = ['#ff5d73', '#ffd166', '#06d6a0', '#4d9de0', '#c77dff', '#ff9f1c'];
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.5 + 's';
      p.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3800);
  }

  function nextPuzzle() {
    el.win.classList.remove('show');
    if (mode === 'vs') startVsMatch(); else newGame();
  }

  // ===== 1 vs 1 對戰 =====
  function setVsUI(on) { document.body.classList.toggle('vs-mode', on); }
  function updateVsScore() {
    const me = document.getElementById('vs-me-score');
    const ai = document.getElementById('vs-ai-score');
    if (me) me.textContent = myScore;
    if (ai) ai.textContent = aiScore;
  }
  function stopAiTimer() { if (aiTimer) { clearInterval(aiTimer); aiTimer = null; } }
  function startAiTimer() { stopAiTimer(); aiTimer = setInterval(aiStep, AI_TICK_MS); }

  function startVsMatch() {
    mode = 'vs';
    stopTimer(); stopAiTimer();
    vsOver = false; myScore = 0; aiScore = 0;
    ownerAt = new Map(); aiPending = null; aiThinkBudget = 0;
    el.win.classList.remove('show');
    clearShareParam();
    setVsUI(true);
    document.querySelectorAll('.mode-tab').forEach((x) => x.classList.toggle('is-active', x.dataset.mode === 'vs'));
    updateVsScore();
    el.board.innerHTML = '<div class="board-loading">🎲</div>';
    setStatus(() => t('vsStart'), 'hint');
    setTimeout(() => {
      const puzzle = window.PupdokuGenerator.generateByDifficulty(AI_N, AI_BUCKET);
      game = new Game(puzzle);
      aiSolver = new window.PupdokuAI.AiSolver(puzzle);
      revealAnim = true;
      render();
      startAiTimer();
      track('vs_start', {});
    }, 20);
  }

  function exitVs() {
    stopAiTimer();
    mode = 'single'; vsOver = false; ownerAt = null; aiSolver = null; aiPending = null;
    el.win.classList.remove('show');
    setVsUI(false);
    document.querySelectorAll('.mode-tab').forEach((x) => x.classList.toggle('is-active', x.dataset.mode === 'single'));
    newGame(); // 回到單人：開一局新的
  }

  // 玩家在 1v1 點格：單點循環 空→❌→🐶；右鍵/長按直接放狗。放下 🐶 即判定對錯。
  function onVsClick(r, c, right) {
    if (vsOver || !game) return;
    if (game.grid[r][c] === DOG) return; // 已占的狗格不可再動
    const before = game.grid[r][c];
    if (right) game.grid[r][c] = DOG;
    else game.grid[r][c] = before === EMPTY ? MARK : before === MARK ? DOG : EMPTY;
    if (game.grid[r][c] === DOG) {
      if (game.solution[r] === c) { // 放對
        ownerAt.set(`${r},${c}`, 'me');
        aiSolver.commitExternal(r, c); // 同步給電腦大腦：這格被你占了
        myScore++;
        render(); updateVsScore();
        if (myScore >= VS_TARGET) { endVs('you'); return; }
        setStatus(() => t('vsGood', { you: myScore, ai: aiScore }), 'good');
      } else { // 放錯 → 立刻輸
        render();
        endVs('wrong', { r, c });
      }
    } else {
      render(); // ❌ 或清空（你自己的輔助標記）
    }
  }

  function placeAiDog(r, c) {
    game.grid[r][c] = DOG;
    ownerAt.set(`${r},${c}`, 'ai');
    aiScore++;
    render(); updateVsScore();
    const cell = el.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (cell) { void cell.offsetWidth; cell.classList.add('dog-pop'); }
    if (aiScore >= VS_TARGET) endVs('ai');
    else setStatus(() => t('vsGood', { you: myScore, ai: aiScore }), 'hint');
  }

  // 每 3 秒一步：先「暗中思考(私有畫叉)」幾個 tick，再把想好的狗放到共享盤
  function aiStep() {
    if (mode !== 'vs' || vsOver || !aiSolver) return;
    if (aiPending) {
      if (aiThinkBudget > 0) { aiThinkBudget--; return; }
      const { r, c } = aiPending; aiPending = null;
      if (game.grid[r][c] !== DOG) placeAiDog(r, c); // 若你已先占，就放棄這隻、下一步再算
      return;
    }
    const mv = aiSolver.step();
    if (!mv) return;
    if (mv.type === 'place') { // 決定好一隻狗：先思考幾個 tick 再放
      aiPending = { r: mv.r, c: mv.c };
      aiThinkBudget = AI_THINK_MIN + Math.floor(Math.random() * (AI_THINK_MAX - AI_THINK_MIN + 1));
    }
    // mv.type === 'mark'：私有畫叉，畫面上不動
  }

  function endVs(result, info) {
    vsOver = true;
    stopAiTimer();
    if (result === 'wrong' && info) {
      const cell = el.board.querySelector(`.cell[data-r="${info.r}"][data-c="${info.c}"]`);
      if (cell) cell.classList.add('dog-wrong');
    }
    const titleKey = result === 'you' ? 'vsYouWin' : result === 'ai' ? 'vsAiWin' : 'vsWrongDog';
    const emoji = result === 'you' ? '🎉🐶' : result === 'ai' ? '🤖' : '🙈';
    const dogEl = document.querySelector('.win-dog');
    if (dogEl) dogEl.textContent = emoji;
    el.winText.innerHTML = `${t(titleKey)}<br><small>${t('vsScoreLine', { you: myScore, ai: aiScore })}</small>`;
    el.winNext.textContent = t('vsRematch');
    track('vs_end', { result: result, my_score: myScore, ai_score: aiScore });
    if (result === 'you') celebrate();
    setTimeout(() => el.win.classList.add('show'), result === 'you' ? 900 : 350);
  }

  // 事件綁定
  el.board.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    onCellClick(+cell.dataset.r, +cell.dataset.c, false);
  });
  el.board.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    e.preventDefault();
    onCellClick(+cell.dataset.r, +cell.dataset.c, true);
  });

  // 手機長按 = 直接放/收狗（滑動只取消長按，讓頁面正常捲動）
  let pressTimer = null, longPressed = false;
  el.board.addEventListener('touchstart', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      onCellClick(+cell.dataset.r, +cell.dataset.c, true);
    }, 420);
  }, { passive: true });
  el.board.addEventListener('touchmove', () => { clearTimeout(pressTimer); }, { passive: true });
  el.board.addEventListener('touchend', (e) => {
    clearTimeout(pressTimer);
    if (longPressed) { e.preventDefault(); longPressed = false; }
  });

  el.newBtn.addEventListener('click', () => {
    if (hasProgress() && !window.confirm(t('confirmDiscard'))) return;
    newGame();
  });
  el.clearBtn.addEventListener('click', () => {
    if (hasProgress() && !window.confirm(t('confirmDiscard'))) return;
    game.clear(); render(); setStatus(() => t('statusCleared'));
  });
  el.undoBtn.addEventListener('click', () => { game.undo(); render(); });
  el.hintBtn.addEventListener('click', () => {
    if (game.won) return;
    const h = game.hint();
    if (!h) { setStatus(() => t('statusAllPlaced'), 'good'); return; }
    hintsUsed++;
    track('hint_used', { difficulty: DIFF_NAME[currentLevel] });
    ensureTimer(); // 用提示也算開始動作
    const rkey = 'reason' + h.reasonKey.charAt(0).toUpperCase() + h.reasonKey.slice(1);
    const reasonFn = () => '💡 ' + t(rkey, { n: h.n });
    if (h.type === 'remove') {
      game.setDog(h.r, h.c); // 目前是狗 → 收回
      render(); highlight(h.r, h.c);
      setStatus(reasonFn, 'hint');
      return;
    }
    if (h.type === 'unmark') { // 取消標錯的 ❌
      game.clearCell(h.r, h.c);
      render(); highlight(h.r, h.c);
      setStatus(reasonFn, 'hint');
      return;
    }
    if (h.type === 'mark') { // 幫忙畫 ❌
      game.markCells(h.cells);
      render();
      flashCells(h.cells); // 新畫的 ❌ 閃一下
      if (h.flag) flagTarget(h.flag); // 高亮「會沒地方放」的顏色/行/列
      setStatus(reasonFn, 'hint');
      return;
    }
    // place：不直接放狗，只「閃閃」＋淡淡狗影指出位置，讓玩家自己放
    highlight(h.r, h.c, true);
    if (h.flag) flagTarget(h.flag);
    setStatus(reasonFn, 'hint');
  });

  // 新畫的 ❌ 閃一下
  function flashCells(cells) {
    cells.forEach(([r, c]) => {
      const cell = el.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
      if (cell) { cell.classList.add('mark-flash'); setTimeout(() => cell.classList.remove('mark-flash'), 850); }
    });
  }

  function highlight(r, c, ghost) {
    // 先清掉舊的高亮（一次只留一個）
    el.board.querySelectorAll('.pulse, .pulse-ghost').forEach((x) => x.classList.remove('pulse', 'pulse-ghost'));
    const cell = el.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (cell) {
      void cell.offsetWidth; // 重觸動畫
      cell.classList.add('pulse');
      if (ghost) cell.classList.add('pulse-ghost'); // 淡淡狗影（放狗提示才有）
      // 不自動移除：提示會一直留著，直到玩家動手（render 重繪）或按下一個提示
    }
  }

  // 把某個顏色整塊在盤面上標示出來（例如「這個顏色會沒地方放」）
  function flagRegion(regId, ms = 2800) {
    el.board.querySelectorAll('.cell').forEach((cell) => {
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (game.regions[r][c] === regId) {
        cell.classList.add('region-flag');
        setTimeout(() => cell.classList.remove('region-flag'), ms);
      }
    });
  }
  // 高亮整行或整列
  function flagLine(kind, index, ms = 2800) {
    el.board.querySelectorAll('.cell').forEach((cell) => {
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if ((kind === 'row' && r === index) || (kind === 'col' && c === index)) {
        cell.classList.add('region-flag');
        setTimeout(() => cell.classList.remove('region-flag'), ms);
      }
    });
  }
  // 依提示的 flag 高亮「會沒地方放」的目標
  function flagTarget(flag) {
    if (!flag) return;
    if (flag.kind === 'region') flagRegion(flag.id);
    else flagLine(flag.kind, flag.id);
  }
  // === About / 一頁一頁的規則教學 ===
  function mini(dogs, bad) {
    bad = bad || [];
    const colors = ['#f4c9b6', '#c6e6bb', '#c3d9f4', '#e4cef1']; // 左上/右上/左下/右下
    let h = '<div class="mini">';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const q = (r < 2 ? 0 : 2) + (c < 2 ? 0 : 1);
      const dog = dogs.includes(r + ',' + c);
      const isBad = bad.includes(r + ',' + c);
      h += `<div class="${isBad ? 'mbad' : ''}" style="background:${colors[q]}">${dog ? '🐶' : ''}</div>`;
    }
    return h + '</div>';
  }
  const SOLVED = ['0,1', '1,3', '2,0', '3,2']; // 一個同時滿足三規則的 4×4 範例
  const TOUCH = ['1,1', '2,2'];                 // 斜角相鄰的錯誤示範
  // 教學頁資料（文字用 i18n key，切語言時會即時重繪）
  const ABOUT = [
    { hero: '🐶', brand: true, body: 'aboutIntro' },
    { mini: SOLVED, title: 'aboutRule1Title', body: 'aboutRule1' },
    { mini: SOLVED, title: 'aboutRule2Title', body: 'aboutRule2' },
    { mini: TOUCH, bad: TOUCH, title: 'aboutRule3Title', body: 'aboutRule3' },
    { hero: '👆', title: 'aboutHowtoTitle', body: 'aboutHowto' },
    { hero: '💡', title: 'aboutHintTitle', body: 'aboutHint' },
    { hero: '🐾', title: 'aboutCreditsTitle', body: 'aboutCredits' },
  ];
  let aboutPage = 0;
  function renderAbout() {
    const p = ABOUT[aboutPage];
    const head = p.mini ? mini(p.mini, p.bad) : `<div class="about-hero">${p.hero}</div>`;
    const title = p.brand ? 'WangDoKu' : t(p.title);
    el.aboutBody.innerHTML = `${head}<h2>${title}</h2><p>${t(p.body)}</p>`;
    el.aboutDots.innerHTML = ABOUT.map((_, i) => `<span class="dot${i === aboutPage ? ' on' : ''}"></span>`).join('');
    el.aboutPrev.style.visibility = aboutPage === 0 ? 'hidden' : 'visible';
    el.aboutNext.textContent = aboutPage === ABOUT.length - 1 ? '✓' : '›';
  }
  function openAbout(page) { aboutPage = page || 0; renderAbout(); el.aboutOverlay.classList.add('show'); updateConsentFooter(); }
  function closeAbout() { el.aboutOverlay.classList.remove('show'); }
  el.brand.addEventListener('click', () => openAbout(0));
  el.brand.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAbout(0); }
  });
  // 三張規則卡：點了直接跳到教學裡對應的那一頁
  document.querySelectorAll('.rule[data-page]').forEach((card) => {
    const page = +card.dataset.page;
    card.addEventListener('click', () => openAbout(page));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAbout(page); }
    });
  });
  // 底部使用說明：點一下開啟教學的「怎麼玩」頁（ABOUT 索引 4）
  const howtoEl = document.getElementById('howto-text');
  if (howtoEl) {
    howtoEl.addEventListener('click', () => openAbout(4));
    howtoEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAbout(4); }
    });
  }

  el.aboutClose.addEventListener('click', closeAbout);
  el.aboutPrev.addEventListener('click', () => { if (aboutPage > 0) { aboutPage--; renderAbout(); } });
  el.aboutNext.addEventListener('click', () => {
    if (aboutPage < ABOUT.length - 1) { aboutPage++; renderAbout(); } else closeAbout();
  });
  el.aboutOverlay.addEventListener('click', (e) => { if (e.target === el.aboutOverlay) closeAbout(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAbout(); });

  // 鎖定手機縮放：iOS Safari 會忽略 viewport 的 user-scalable=no，
  // 所以額外攔截 pinch 手勢。只擋「雙指」，單指點擊/捲動不受影響。
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })
  );
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  el.diffBtns.forEach((b) => {
    b.addEventListener('click', () => setDifficulty(+b.dataset.diff));
  });
  // 標題附近的模式切換：單人 ⇄ 1 vs 1
  document.querySelectorAll('.mode-tab').forEach((b) => {
    b.addEventListener('click', () => {
      const m = b.dataset.mode;
      if (m === mode) return;
      if (m === 'vs') startVsMatch(); else exitVs();
    });
  });
  el.winNext.addEventListener('click', nextPuzzle);

  el.shareBtn.addEventListener('click', async () => {
    if (!game) return;
    const code = encodePuzzle(game);
    const url = location.origin + location.pathname + '?p=' + code;
    history.replaceState(null, '', '?p=' + code); // 網址列同步這題，重整也回得來
    track('share', { method: 'copy_link' });
    try {
      await navigator.clipboard.writeText(url);
      setStatus('🔗 ✓', 'hint');
    } catch (e) {
      setStatus(url);
    }
  });

  // 過關卡片：分享到 X / Facebook / 複製
  function shareData() {
    const url = location.origin + location.pathname + '?p=' + encodePuzzle(game);
    const text = t('socialText', { time: fmt(lastElapsed), difficulty: diffLabel(currentLevel) });
    return { url, text };
  }
  el.shareX.addEventListener('click', () => {
    const { url, text } = shareData();
    track('share', { method: 'twitter' });
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) +
      '&url=' + encodeURIComponent(url), '_blank', 'noopener');
  });
  el.shareFb.addEventListener('click', () => {
    const { url, text } = shareData();
    track('share', { method: 'facebook' });
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url) +
      '&quote=' + encodeURIComponent(text), '_blank', 'noopener');
  });
  el.shareCopy.addEventListener('click', async () => {
    const { url } = shareData();
    track('share', { method: 'copy' });
    try {
      await navigator.clipboard.writeText(url);
      el.shareCopy.textContent = '✓';
      setTimeout(() => { el.shareCopy.textContent = '🔗'; }, 1500);
    } catch (e) { /* 忽略 */ }
  });

  // 語言選單（列出 10 種語言，顯示各自母語名稱）
  const langSel = document.getElementById('lang-select');
  window.I18N.order.forEach((code) => {
    const opt = document.createElement('option');
    opt.value = code; opt.textContent = window.I18N.name(code);
    langSel.appendChild(opt);
  });
  // 切語言＝跳到該語言的靜態頁（title/meta/底部說明都會是該語言，SEO 一致）；保留分享中的題目 ?p=
  langSel.addEventListener('change', () => {
    const code = langSel.value;
    track('change_language', { language: code });
    try { localStorage.setItem('pupdoku_lang', code); } catch (e) { /* ignore */ }
    const p = new URLSearchParams(location.search).get('p');
    const base = code === 'en' ? '/' : '/' + code + '/';
    location.assign(base + (p ? '?p=' + encodeURIComponent(p) : ''));
  });

  // 每次套用語言後，同步會變動的文字（徽章、開著的教學頁、選單值）
  window.I18N.onApply = () => {
    langSel.value = window.I18N.lang;
    updateBadge(currentLevel);
    refreshStatus(); // 切語言時，中間的狀態/提示文字也跟著換
    if (el.aboutOverlay.classList.contains('show')) renderAbout();
  };

  // Cookie 告知（使用本站即視為同意；不同意請勿使用）— 併入首次教學對話框底部
  function grantAnalytics() {
    if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: 'granted' });
  }
  function noticeSeen() {
    try { return !!localStorage.getItem('pupdoku_consent'); } catch (e) { return false; }
  }
  function updateConsentFooter() {
    const box = document.getElementById('modal-consent');
    if (box) box.hidden = noticeSeen(); // 看過告知後就不再顯示
  }
  function dismissNotice() {
    try { localStorage.setItem('pupdoku_consent', 'seen'); } catch (e) { /* ignore */ }
    updateConsentFooter();
  }
  function initConsent() {
    grantAnalytics(); // 使用本站即視為同意
    const okBtn = document.getElementById('consent-accept');
    if (okBtn) okBtn.addEventListener('click', dismissNotice);
    if (!noticeSeen()) openAbout(0); // 首次造訪：自動開教學（底部含 cookie 告知）
  }

  // PWA：註冊 Service Worker（離線）＋ 安裝到主畫面
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* ignore */ }));
  }
  let deferredPrompt = null;
  const installBtn = document.getElementById('install-btn');
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  // 顯示「加到首頁」按鈕：可程式化安裝（Android/桌面 Chrome）或 iOS Safari（給指引）；已安裝則隱藏
  function refreshInstallBtn() {
    if (!installBtn) return;
    installBtn.hidden = isStandalone() ? true : !(deferredPrompt || isIOS());
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; refreshInstallBtn();
  });
  if (installBtn) installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
      deferredPrompt = null; refreshInstallBtn();
      track('pwa_install_click', { from: 'toolbar' });
    } else if (isIOS()) {
      window.alert(t('installIos')); // iOS 無法程式化安裝，改給「分享 → 加入主畫面」指引
      track('pwa_install_click', { from: 'ios_hint' });
    }
  });
  window.addEventListener('appinstalled', () => { refreshInstallBtn(); track('pwa_installed'); });
  function maybeShowInstall() {
    const box = document.getElementById('win-install');
    if (!box) return;
    let done = null;
    try { done = localStorage.getItem('pupdoku_installPrompted'); } catch (e) { /* ignore */ }
    if (done || isStandalone()) { box.hidden = true; return; }
    const btn = document.getElementById('win-install-btn');
    const ios = document.getElementById('win-install-ios');
    if (deferredPrompt) { btn.hidden = false; ios.hidden = true; box.hidden = false; }
    else if (isIOS()) { btn.hidden = true; ios.hidden = false; box.hidden = false; }
    else { box.hidden = true; return; } // 不可安裝（例如已安裝或不支援）→ 不打擾
    try { localStorage.setItem('pupdoku_installPrompted', '1'); } catch (e) { /* ignore */ }
    track('pwa_prompt_shown');
  }
  const winInstallBtn = document.getElementById('win-install-btn');
  if (winInstallBtn) winInstallBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
    deferredPrompt = null;
    document.getElementById('win-install').hidden = true;
    refreshInstallBtn();
    track('pwa_install_click', { from: 'win' });
  });

  // 起始：偵測瀏覽器語言 → 首次教學＋同意 → 載入分享題或產生新題
  window.I18N.init();
  refreshInstallBtn(); // iOS Safari / 已安裝狀態，一開始就決定按鈕是否顯示
  if (!loadFromURL()) newGame();
  initConsent();
})();
