/*
 * Pupdoku 難度分析器
 * 用「解這題需要動用到多難的推理技巧」來評級。
 * 技巧由易到難：
 *   single  ── 某顏色/行/列只剩一格
 *   lock1   ── 單色線鎖定（一個顏色被擠進單一行或列）
 *   lock2/3 ── 2~3 個顏色組合鎖定
 *   oneply  ── 試放矛盾（反證：某格放狗會害某顏色/行/列全滅）
 * 若上述都不足以解完（stuck），代表需要更深的多步反證。
 *
 * 三段難度：
 *   0 = 簡單（只用到 single / lock1）
 *   1 = 中等（用到 lock2 / lock3）
 *   2 = 困難（用到 oneply 或需更深推理）
 */

(function (global) {
  'use strict';

  const LABELS = ['簡單', '中等', '困難'];

  function rate(regions) {
    const n = regions.length;
    const cand = Array.from({ length: n }, () => new Array(n).fill(true));
    const regPlaced = new Array(n).fill(false);
    const rowPlaced = new Array(n).fill(false);
    const colPlaced = new Array(n).fill(false);

    const commit = (r, c) => {
      for (let i = 0; i < n; i++) { cand[r][i] = false; cand[i][c] = false; }
      for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++)
        if (regions[rr][cc] === regions[r][c]) cand[rr][cc] = false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) cand[nr][nc] = false;
      }
      cand[r][c] = true;
      regPlaced[regions[r][c]] = true; rowPlaced[r] = true; colPlaced[c] = true;
    };
    const regCells = (k) => { const a = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (regions[r][c] === k && cand[r][c]) a.push([r, c]); return a; };
    const rowCells = (r) => { const a = []; for (let c = 0; c < n; c++) if (cand[r][c]) a.push([r, c]); return a; };
    const colCells = (c) => { const a = []; for (let r = 0; r < n; r++) if (cand[r][c]) a.push([r, c]); return a; };
    const combos = (arr, k) => { const res = []; const go = (s, cur) => { if (cur.length === k) { res.push(cur.slice()); return; } for (let i = s; i < arr.length; i++) { cur.push(arr[i]); go(i + 1, cur); cur.pop(); } }; go(0, []); return res; };

    function lineLock(byRow, K) {
      const un = [...Array(n).keys()].filter((k) => !regPlaced[k]);
      const linesOf = (k) => { const s = new Set(); for (const [r, c] of regCells(k)) s.add(byRow ? r : c); return s; };
      for (const cb of combos(un, K)) {
        const L = new Set(); cb.forEach((g) => linesOf(g).forEach((l) => L.add(l)));
        if (L.size === K) {
          let ch = false;
          for (const line of L) {
            const arr = byRow ? rowCells(line) : colCells(line);
            for (const [r, c] of arr) if (!cb.includes(regions[r][c]) && cand[r][c]) { cand[r][c] = false; ch = true; }
          }
          if (ch) return true;
        }
      }
      return false;
    }
    function onePly() {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!cand[r][c]) continue;
        const t = cand.map((x) => x.slice());
        for (let i = 0; i < n; i++) { t[r][i] = false; t[i][c] = false; }
        for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) if (regions[rr][cc] === regions[r][c]) t[rr][cc] = false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < n && nc >= 0 && nc < n) t[nr][nc] = false; }
        t[r][c] = true;
        let dead = false;
        for (let k = 0; k < n && !dead; k++) { if (regPlaced[k] || k === regions[r][c]) continue; let any = false; for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) if (regions[rr][cc] === k && t[rr][cc]) any = true; if (!any) dead = true; }
        for (let rr = 0; rr < n && !dead; rr++) { if (rowPlaced[rr] || rr === r) continue; let any = false; for (let cc = 0; cc < n; cc++) if (t[rr][cc]) any = true; if (!any) dead = true; }
        for (let cc = 0; cc < n && !dead; cc++) { if (colPlaced[cc] || cc === c) continue; let any = false; for (let rr = 0; rr < n; rr++) if (t[rr][cc]) any = true; if (!any) dead = true; }
        if (dead) { cand[r][c] = false; return true; }
      }
      return false;
    }

    const counts = { single: 0, lock1: 0, lock2: 0, lock3: 0, oneply: 0 };
    let placed = 0, guard = 0, stuck = false;
    while (placed < n && guard++ < 5000) {
      let did = false;
      for (let k = 0; k < n && !did; k++) { if (regPlaced[k]) continue; const cc = regCells(k); if (cc.length === 1) { commit(cc[0][0], cc[0][1]); placed++; counts.single++; did = true; } }
      if (!did) for (let r = 0; r < n && !did; r++) { if (rowPlaced[r]) continue; const a = rowCells(r); if (a.length === 1) { commit(a[0][0], a[0][1]); placed++; counts.single++; did = true; } }
      if (!did) for (let c = 0; c < n && !did; c++) { if (colPlaced[c]) continue; const a = colCells(c); if (a.length === 1) { commit(a[0][0], a[0][1]); placed++; counts.single++; did = true; } }
      if (did) continue;
      if (lineLock(true, 1) || lineLock(false, 1)) { counts.lock1++; continue; }
      if (lineLock(true, 2) || lineLock(false, 2)) { counts.lock2++; continue; }
      if (lineLock(true, 3) || lineLock(false, 3)) { counts.lock3++; continue; }
      if (onePly()) { counts.oneply++; continue; }
      stuck = true; break;
    }

    let bucket;
    if (stuck || counts.oneply > 0) bucket = 2;
    else if (counts.lock2 > 0 || counts.lock3 > 0) bucket = 1;
    else bucket = 0;

    return { bucket, label: LABELS[bucket], counts, stuck };
  }

  global.PupdokuDifficulty = { rate, LABELS };
})(window);
