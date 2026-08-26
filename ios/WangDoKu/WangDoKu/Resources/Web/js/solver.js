/*
 * Pupdoku 求解器
 * 給定顏色區塊配置，計算合法解的數量（用來驗證唯一解）。
 * 因為每行恰好一隻狗，只需對每一行選一列，並檢查：
 *   - 列未被使用
 *   - 區塊未被使用
 *   - 與上一行的狗不相鄰（|colDiff| >= 2；非相鄰行不可能貼到）
 */

(function (global) {
  'use strict';

  /**
   * 計算解的數量，最多數到 cap（預設 2，足以判斷是否唯一）
   */
  function countSolutions(n, regions, cap = 2) {
    const usedCol = new Array(n).fill(false);
    const usedRegion = new Array(n).fill(false);
    let count = 0;

    function search(row, prevCol) {
      if (count >= cap) return;
      if (row === n) {
        count++;
        return;
      }
      for (let c = 0; c < n; c++) {
        if (usedCol[c]) continue;
        if (prevCol >= 0 && Math.abs(c - prevCol) < 2) continue;
        const reg = regions[row][c];
        if (usedRegion[reg]) continue;

        usedCol[c] = true;
        usedRegion[reg] = true;
        search(row + 1, c);
        usedCol[c] = false;
        usedRegion[reg] = false;
        if (count >= cap) return;
      }
    }

    search(0, -2);
    return count;
  }

  /**
   * 求出第一組（對唯一解題目即為唯一）合法解，回傳 cols 或 null
   */
  function solve(n, regions) {
    const usedCol = new Array(n).fill(false);
    const usedRegion = new Array(n).fill(false);
    const cur = new Array(n).fill(-1);
    let sol = null;
    function search(row, prev) {
      if (sol) return;
      if (row === n) { sol = cur.slice(); return; }
      for (let c = 0; c < n; c++) {
        if (usedCol[c]) continue;
        if (prev >= 0 && Math.abs(c - prev) < 2) continue;
        const reg = regions[row][c];
        if (usedRegion[reg]) continue;
        usedCol[c] = true; usedRegion[reg] = true; cur[row] = c;
        search(row + 1, c);
        usedCol[c] = false; usedRegion[reg] = false; cur[row] = -1;
        if (sol) return;
      }
    }
    search(0, -2);
    return sol;
  }

  global.PupdokuSolver = { countSolutions, solve };
})(window);
