/*
 * Pupdoku 謎題產生器
 * 規則（同 LinkedIn Queens / Star Battle）：
 *   - 每行放 1 隻狗
 *   - 每列放 1 隻狗
 *   - 每個顏色區塊放 1 隻狗
 *   - 任兩隻狗不能相鄰（含斜角，即 Chebyshev 距離 1）
 *
 * 產生流程：
 *   1. 用隨機回溯產生一組合法「解」S（每行/列一隻、相鄰行列差 >= 2）
 *   2. 以每隻狗為種子，隨機淹沒式成長成 N 個相連的顏色區塊
 *   3. 精修：只要還存在「另一組解」，就把它用到的關鍵格子改色破解它，
 *      直到全盤只剩唯一解（過程保持每區塊相連、且仍含 S 的那隻狗）
 */

(function (global) {
  'use strict';

  const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function neighbors4(r, c, n) {
    const out = [];
    for (const [dr, dc] of DIRS4) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push([nr, nc]);
    }
    return out;
  }

  // 產生一組合法解：cols[r] = 該行狗所在的列
  function generateSolution(n) {
    const cols = new Array(n).fill(-1);
    const used = new Array(n).fill(false);
    function place(row) {
      if (row === n) return true;
      for (const c of shuffle([...Array(n).keys()])) {
        if (used[c]) continue;
        if (row > 0 && Math.abs(c - cols[row - 1]) < 2) continue;
        cols[row] = c; used[c] = true;
        if (place(row + 1)) return true;
        used[c] = false; cols[row] = -1;
      }
      return false;
    }
    return place(0) ? cols : null;
  }

  // 以每隻狗為種子成長出相連區塊；regions[r][c] = 區塊編號（用行號當編號）
  function growRegions(n, solutionCols) {
    const regions = Array.from({ length: n }, () => new Array(n).fill(-1));
    const frontier = [];
    for (let r = 0; r < n; r++) {
      const c = solutionCols[r];
      regions[r][c] = r;
      frontier.push([[r, c]]);
    }
    let remaining = n * n - n;
    while (remaining > 0) {
      let grew = false;
      for (const k of shuffle([...Array(n).keys()])) {
        const fr = frontier[k];
        if (fr.length === 0) continue;
        shuffle(fr);
        for (let i = fr.length - 1; i >= 0; i--) {
          const [cr, cc] = fr[i];
          const open = shuffle(neighbors4(cr, cc, n).filter(
            ([nr, nc]) => regions[nr][nc] === -1
          ));
          if (open.length === 0) { fr.splice(i, 1); continue; }
          const [nr, nc] = open[0];
          regions[nr][nc] = k;
          fr.push([nr, nc]);
          remaining--; grew = true;
          break;
        }
        if (grew) break;
      }
      if (!grew) break;
    }
    return regions;
  }

  // 找一組「與 S 不同」的合法解；找不到代表 S 為唯一解
  function findAlternate(n, regions, S) {
    const usedCol = new Array(n).fill(false);
    const usedReg = new Array(n).fill(false);
    const cur = new Array(n).fill(-1);
    let found = null;
    function search(row, prev) {
      if (found) return;
      if (row === n) {
        for (let r = 0; r < n; r++) if (cur[r] !== S[r]) { found = cur.slice(); return; }
        return; // 等於 S，忽略
      }
      for (let c = 0; c < n; c++) {
        if (usedCol[c]) continue;
        if (prev >= 0 && Math.abs(c - prev) < 2) continue;
        const reg = regions[row][c];
        if (usedReg[reg]) continue;
        usedCol[c] = true; usedReg[reg] = true; cur[row] = c;
        search(row + 1, c);
        usedCol[c] = false; usedReg[reg] = false; cur[row] = -1;
        if (found) return;
      }
    }
    search(0, -2);
    return found;
  }

  // 移除某格後，該區塊剩餘格子是否仍相連（且非空）
  function stillContiguous(regions, reg, n, exR, exC) {
    const cells = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (regions[r][c] === reg && !(r === exR && c === exC)) cells.push([r, c]);
    if (cells.length === 0) return false;
    const seen = new Set([cells[0][0] + ',' + cells[0][1]]);
    const stack = [cells[0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [nr, nc] of neighbors4(r, c, n)) {
        if (regions[nr][nc] !== reg) continue;
        if (nr === exR && nc === exC) continue;
        const key = nr + ',' + nc;
        if (!seen.has(key)) { seen.add(key); stack.push([nr, nc]); }
      }
    }
    return seen.size === cells.length;
  }

  // 破解一組「其他解」alt：把它某個非-S 的狗格改到鄰近區塊
  function breakAlternate(n, regions, S, alt) {
    const Sset = new Set(S.map((c, r) => r + ',' + c));
    const diffRows = shuffle([...Array(n).keys()].filter((r) => alt[r] !== S[r]));
    for (const r of diffRows) {
      const c = alt[r];
      if (Sset.has(r + ',' + c)) continue;
      const curReg = regions[r][c];
      for (const [nr, nc] of shuffle(neighbors4(r, c, n))) {
        const newReg = regions[nr][nc];
        if (newReg === curReg) continue;
        if (stillContiguous(regions, curReg, n, r, c)) {
          regions[r][c] = newReg;
          return true;
        }
      }
    }
    return false;
  }

  // 反覆破解其他解，直到唯一。成功回傳 true
  function refineToUnique(n, regions, S) {
    for (let iter = 0; iter < 400; iter++) {
      const alt = findAlternate(n, regions, S);
      if (!alt) return true;
      if (!breakAlternate(n, regions, S, alt)) return false;
    }
    return findAlternate(n, regions, S) === null;
  }

  /**
   * 產生一個保證唯一解的關卡
   * @param {number} n 棋盤大小
   * @returns {{ n:number, regions:number[][], solution:number[] }}
   */
  function generatePuzzle(n) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const solution = generateSolution(n);
      if (!solution) continue;
      for (let t = 0; t < 6; t++) {
        const regions = growRegions(n, solution);
        if (refineToUnique(n, regions, solution)) {
          return { n, regions, solution };
        }
      }
    }
    // 退回（極少發生）：至少合法可解
    const solution = generateSolution(n);
    const regions = growRegions(n, solution);
    return { n, regions, solution };
  }

  /**
   * 產生「指定難度」的唯一解關卡（拒絕採樣 + 保底）
   * @param {number} n 盤面大小
   * @param {number} target 目標難度 0=簡單 1=中等 2=困難
   * @param {number} budget 最多嘗試題數
   * @returns 帶有 difficulty(bucket) 與 label 的關卡
   */
  function generateByDifficulty(n, target, budget = 160) {
    let closest = null, closestGap = Infinity;
    for (let i = 0; i < budget; i++) {
      const p = generatePuzzle(n);
      const rated = global.PupdokuDifficulty.rate(p.regions);
      p.difficulty = rated.bucket;
      p.label = rated.label;
      if (rated.bucket === target) return p;
      const gap = Math.abs(rated.bucket - target);
      if (gap < closestGap) { closestGap = gap; closest = p; }
    }
    return closest; // 找不到完全符合時，回傳最接近的
  }

  global.PupdokuGenerator = {
    generatePuzzle, generateByDifficulty, generateSolution, growRegions,
    findAlternate, refineToUnique,
  };
})(window);
