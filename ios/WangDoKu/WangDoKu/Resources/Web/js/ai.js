/*
 * WangDoKu 1 vs 1 的電腦大腦：逐步式解題器。
 * 每次 step() 只回傳「一個」微動作：
 *   { type:'place', r, c } ── 邏輯上被逼出的一隻狗（外層把牠放到共享盤，計入電腦分數）
 *   { type:'mark',  r, c } ── 私有地消去一個候選（等同電腦「暗中畫的叉叉」，不顯示給玩家）
 *
 * 私有候選狀態 cand[r][c] 就是電腦的推理草稿；true = 這格還可能是狗。
 * 技巧由易到難（與 difficulty.js 的評級一致）：naked single → 線鎖定 1/2/3 → 一步反證。
 * 這些技巧都是「健全」的：永遠不會消掉真正的解答格，所以電腦放的狗一定正確。
 */
(function (global) {
  'use strict';

  class AiSolver {
    constructor(puzzle) {
      const n = puzzle.n;
      this.n = n;
      this.regions = puzzle.regions;
      this.solution = puzzle.solution;
      this.cand = Array.from({ length: n }, () => new Array(n).fill(true));
      this.regPlaced = new Array(n).fill(false);
      this.rowPlaced = new Array(n).fill(false);
      this.colPlaced = new Array(n).fill(false);
    }

    _commit(r, c) {
      const n = this.n, regions = this.regions, cand = this.cand;
      for (let i = 0; i < n; i++) { cand[r][i] = false; cand[i][c] = false; }
      for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++)
        if (regions[rr][cc] === regions[r][c]) cand[rr][cc] = false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) cand[nr][nc] = false;
      }
      cand[r][c] = false;
      this.regPlaced[regions[r][c]] = true;
      this.rowPlaced[r] = true; this.colPlaced[c] = true;
    }

    // 對手（玩家）放了一隻狗 → 同步占位（不計入電腦）
    commitExternal(r, c) { this._commit(r, c); }

    _regCells(k) { const n = this.n, a = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this.regions[r][c] === k && this.cand[r][c]) a.push([r, c]); return a; }
    _rowCells(r) { const n = this.n, a = []; for (let c = 0; c < n; c++) if (this.cand[r][c]) a.push([r, c]); return a; }
    _colCells(c) { const n = this.n, a = []; for (let r = 0; r < n; r++) if (this.cand[r][c]) a.push([r, c]); return a; }
    _combos(arr, k) { const res = []; const go = (s, cur) => { if (cur.length === k) { res.push(cur.slice()); return; } for (let i = s; i < arr.length; i++) { cur.push(arr[i]); go(i + 1, cur); cur.pop(); } }; go(0, []); return res; }

    // 線鎖定 K：K 個未放的顏色剛好被擠進 K 條行(列)時，那些行(列)裡「非這幾色」的候選可消去。
    // 回傳「第一個可消去的候選」[r,c]，或 null。
    _lineLockElim(byRow, K) {
      const n = this.n;
      const un = [...Array(n).keys()].filter((k) => !this.regPlaced[k]);
      const linesOf = (k) => { const s = new Set(); for (const [r, c] of this._regCells(k)) s.add(byRow ? r : c); return s; };
      for (const cb of this._combos(un, K)) {
        const L = new Set(); cb.forEach((g) => linesOf(g).forEach((l) => L.add(l)));
        if (L.size === K) {
          for (const line of L) {
            const arr = byRow ? this._rowCells(line) : this._colCells(line);
            for (const [r, c] of arr) if (!cb.includes(this.regions[r][c])) return [r, c];
          }
        }
      }
      return null;
    }

    // 一步反證：某候選格若放狗，會害某個「未放的」顏色/行/列全滅 → 該格可消去。
    _onePlyElim() {
      const n = this.n, regions = this.regions, cand = this.cand;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!cand[r][c]) continue;
        const t = cand.map((x) => x.slice());
        for (let i = 0; i < n; i++) { t[r][i] = false; t[i][c] = false; }
        for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) if (regions[rr][cc] === regions[r][c]) t[rr][cc] = false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < n && nc >= 0 && nc < n) t[nr][nc] = false; }
        t[r][c] = true;
        let dead = false;
        for (let k = 0; k < n && !dead; k++) { if (this.regPlaced[k] || k === regions[r][c]) continue; let any = false; for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) if (regions[rr][cc] === k && t[rr][cc]) any = true; if (!any) dead = true; }
        for (let rr = 0; rr < n && !dead; rr++) { if (this.rowPlaced[rr] || rr === r) continue; let any = false; for (let cc = 0; cc < n; cc++) if (t[rr][cc]) any = true; if (!any) dead = true; }
        for (let cc = 0; cc < n && !dead; cc++) { if (this.colPlaced[cc] || cc === c) continue; let any = false; for (let rr = 0; rr < n; rr++) if (t[rr][cc]) any = true; if (!any) dead = true; }
        if (dead) return [r, c];
      }
      return null;
    }

    step() {
      const n = this.n;
      // 1) 只剩一格（naked single）→ 放狗
      for (let k = 0; k < n; k++) { if (this.regPlaced[k]) continue; const a = this._regCells(k); if (a.length === 1) { this._commit(a[0][0], a[0][1]); return { type: 'place', r: a[0][0], c: a[0][1] }; } }
      for (let r = 0; r < n; r++) { if (this.rowPlaced[r]) continue; const a = this._rowCells(r); if (a.length === 1) { this._commit(a[0][0], a[0][1]); return { type: 'place', r: a[0][0], c: a[0][1] }; } }
      for (let c = 0; c < n; c++) { if (this.colPlaced[c]) continue; const a = this._colCells(c); if (a.length === 1) { this._commit(a[0][0], a[0][1]); return { type: 'place', r: a[0][0], c: a[0][1] }; } }
      // 2) 消去一個候選（暗中畫叉叉）：線鎖定 1→2→3 → 一步反證
      const e = this._lineLockElim(true, 1) || this._lineLockElim(false, 1)
        || this._lineLockElim(true, 2) || this._lineLockElim(false, 2)
        || this._lineLockElim(true, 3) || this._lineLockElim(false, 3)
        || this._onePlyElim();
      if (e) { this.cand[e[0]][e[1]] = false; return { type: 'mark', r: e[0], c: e[1] }; }
      // 3) 卡住（極少）→ 用 solution 放下一隻該放的狗（保底，仍是正解）
      for (let r = 0; r < n; r++) { if (!this.rowPlaced[r]) { const c = this.solution[r]; this._commit(r, c); return { type: 'place', r, c }; } }
      return null;
    }
  }

  global.PupdokuAI = { AiSolver };
})(window);
