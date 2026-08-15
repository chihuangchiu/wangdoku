/*
 * Pupdoku 遊戲核心：狀態、互動與勝負判定
 * 格子狀態 cell：0 = 空, 1 = 標記排除(❌), 2 = 放狗(🐶)
 */

(function (global) {
  'use strict';

  const EMPTY = 0, MARK = 1, DOG = 2;

  // 依區塊數量產生一組分明的柔和色
  function buildPalette(n) {
    const colors = [];
    for (let i = 0; i < n; i++) {
      const hue = Math.round((360 / n) * i + 12) % 360;
      colors.push(`hsl(${hue}, 62%, 74%)`);
    }
    return colors;
  }

  class Game {
    constructor(puzzle) {
      this.n = puzzle.n;
      this.regions = puzzle.regions;
      this.solution = puzzle.solution;
      this.palette = buildPalette(this.n);
      this.grid = Array.from({ length: this.n }, () =>
        new Array(this.n).fill(EMPTY)
      );
      this.history = [];
      this.won = false;
    }

    cycle(r, c) {
      if (this.won) return;
      this.history.push(this.snapshot());
      const cur = this.grid[r][c];
      this.grid[r][c] = cur === EMPTY ? MARK : cur === MARK ? DOG : EMPTY;
    }

    setDog(r, c) {
      if (this.won) return;
      this.history.push(this.snapshot());
      this.grid[r][c] = this.grid[r][c] === DOG ? EMPTY : DOG;
    }

    clear() {
      this.history.push(this.snapshot());
      this.grid = Array.from({ length: this.n }, () =>
        new Array(this.n).fill(EMPTY)
      );
      this.won = false;
    }

    undo() {
      if (this.history.length === 0) return;
      this.grid = this.history.pop();
      this.won = false;
    }

    // 一次把多個空格標成 ❌（提示用；可整批復原）
    markCells(list) {
      if (this.won) return;
      this.history.push(this.snapshot());
      for (const [r, c] of list) if (this.grid[r][c] === EMPTY) this.grid[r][c] = MARK;
    }
    // 把某格清成空白（給「取消標錯的 ❌」用）
    clearCell(r, c) {
      this.history.push(this.snapshot());
      this.grid[r][c] = EMPTY;
    }

    snapshot() {
      return this.grid.map((row) => row.slice());
    }

    dogs() {
      const list = [];
      for (let r = 0; r < this.n; r++)
        for (let c = 0; c < this.n; c++)
          if (this.grid[r][c] === DOG) list.push([r, c]);
      return list;
    }

    // 回傳有衝突的狗座標集合（用 "r,c" 字串標記）
    conflicts() {
      const bad = new Set();
      const dogs = this.dogs();
      const rows = {}, cols = {}, regs = {};
      for (const [r, c] of dogs) {
        (rows[r] = rows[r] || []).push([r, c]);
        (cols[c] = cols[c] || []).push([r, c]);
        const reg = this.regions[r][c];
        (regs[reg] = regs[reg] || []).push([r, c]);
      }
      const flag = (groups) => {
        for (const key in groups) {
          if (groups[key].length > 1)
            for (const [r, c] of groups[key]) bad.add(`${r},${c}`);
        }
      };
      flag(rows); flag(cols); flag(regs);
      // 相鄰（含斜角）
      for (let i = 0; i < dogs.length; i++) {
        for (let j = i + 1; j < dogs.length; j++) {
          const [r1, c1] = dogs[i], [r2, c2] = dogs[j];
          if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) {
            bad.add(`${r1},${c1}`);
            bad.add(`${r2},${c2}`);
          }
        }
      }
      return bad;
    }

    checkWin() {
      const dogs = this.dogs();
      if (dogs.length !== this.n) return false;
      if (this.conflicts().size > 0) return false;
      this.won = true;
      return true;
    }

    /*
     * 教學型提示：一步一步，只在「看得見只剩一格」時才放狗，否則先幫你畫 ❌ 並說明原因。
     * 順序：① 移除放錯的狗 ② 取消標錯的 ❌ ③ 補狗排除的 ❌ ④ 只剩一格→放狗
     *       ⑤ 反證→畫 ❌（高亮會沒位子的顏色/行/列）⑥ 保底：直接指出一個解格
     * 回傳 { type:'remove'|'unmark'|'mark'|'place', ... reasonKey, [cells], [flag] }
     */
    hint() {
      const n = this.n, regions = this.regions, grid = this.grid;
      const solSet = new Set(this.solution.map((c, r) => r + ',' + c));
      const isSol = (r, c) => solSet.has(r + ',' + c);
      const dogs = this.dogs();

      // ① 放錯的狗（不在唯一解上）
      for (const [r, c] of dogs) if (!isSol(r, c)) return { type: 'remove', r, c, reasonKey: 'wrongDog' };
      // ② 標錯的 ❌（把該放狗的格子劃掉了）
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
        if (grid[r][c] === MARK && isSol(r, c)) return { type: 'unmark', r, c, reasonKey: 'wrongMark' };

      const live = (r, c) => grid[r][c] === EMPTY;
      const regDone = new Array(n).fill(false), rowDone = new Array(n).fill(false), colDone = new Array(n).fill(false);
      for (const [r, c] of dogs) { regDone[regions[r][c]] = true; rowDone[r] = true; colDone[c] = true; }

      // ③ 補狗排除的 ❌（與某隻狗同行/列/色，或就在旁邊）
      const dogExcluded = (r, c) => dogs.some(([dr, dc]) =>
        dr === r || dc === c || regions[dr][dc] === regions[r][c] || (Math.abs(dr - r) <= 1 && Math.abs(dc - c) <= 1));
      const exMarks = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
        if (live(r, c) && dogExcluded(r, c)) exMarks.push([r, c]);
      if (exMarks.length) return { type: 'mark', cells: exMarks, reasonKey: 'markExcluded' };

      // ④ 只剩一格（可見）→ 放狗
      const regLive = (k) => { const a = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (regions[r][c] === k && live(r, c)) a.push([r, c]); return a; };
      const rowLive = (r) => { const a = []; for (let c = 0; c < n; c++) if (live(r, c)) a.push([r, c]); return a; };
      const colLive = (c) => { const a = []; for (let r = 0; r < n; r++) if (live(r, c)) a.push([r, c]); return a; };
      for (let k = 0; k < n; k++) { if (regDone[k]) continue; const a = regLive(k); if (a.length === 1) return { type: 'place', r: a[0][0], c: a[0][1], reasonKey: 'onlyColor' }; }
      for (let r = 0; r < n; r++) { if (rowDone[r]) continue; const a = rowLive(r); if (a.length === 1) return { type: 'place', r: a[0][0], c: a[0][1], reasonKey: 'onlyRow', n: r + 1 }; }
      for (let c = 0; c < n; c++) { if (colDone[c]) continue; const a = colLive(c); if (a.length === 1) return { type: 'place', r: a[0][0], c: a[0][1], reasonKey: 'onlyCol', n: c + 1 }; }

      // ⑤ 反證 → 畫 ❌：某空格若放狗，會害某（未完成的）顏色/行/列全滅
      const elimBy = (r, c, rr, cc) => rr === r || cc === c || regions[rr][cc] === regions[r][c] || (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1);
      const killsWhat = (r, c) => {
        for (let k = 0; k < n; k++) {
          if (regDone[k] || k === regions[r][c]) continue;
          let alive = false;
          for (let rr = 0; rr < n && !alive; rr++) for (let cc = 0; cc < n; cc++)
            if (regions[rr][cc] === k && live(rr, cc) && !elimBy(r, c, rr, cc)) { alive = true; break; }
          if (!alive) return { kind: 'region', id: k };
        }
        for (let rr = 0; rr < n; rr++) {
          if (rowDone[rr] || rr === r) continue;
          let alive = false;
          for (let cc = 0; cc < n; cc++) if (live(rr, cc) && !elimBy(r, c, rr, cc)) { alive = true; break; }
          if (!alive) return { kind: 'row', id: rr };
        }
        for (let cc = 0; cc < n; cc++) {
          if (colDone[cc] || cc === c) continue;
          let alive = false;
          for (let rr = 0; rr < n; rr++) if (live(rr, cc) && !elimBy(r, c, rr, cc)) { alive = true; break; }
          if (!alive) return { kind: 'col', id: cc };
        }
        return null;
      };
      let target = null;
      for (let r = 0; r < n && !target; r++) for (let c = 0; c < n; c++) {
        if (!live(r, c) || isSol(r, c)) continue;
        const w = killsWhat(r, c); if (w) { target = w; break; }
      }
      if (target) {
        const cells = [];
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          if (!live(r, c) || isSol(r, c)) continue;
          const w = killsWhat(r, c);
          if (w && w.kind === target.kind && w.id === target.id) cells.push([r, c]);
        }
        return { type: 'mark', cells, reasonKey: 'markDeduced', flag: target };
      }

      // ⑥ 保底：技巧卡住時，直接指出一個解格
      for (let r = 0; r < n; r++) { const c = this.solution[r]; if (grid[r][c] !== DOG) return { type: 'place', r, c, reasonKey: 'mustBeDog' }; }
      return null;
    }
  }

  global.PupdokuGame = { Game, EMPTY, MARK, DOG, buildPalette };
})(window);
