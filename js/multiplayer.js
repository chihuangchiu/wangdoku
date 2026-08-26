/* WangDoKu online rooms — public Supabase RPC client.
 * The publishable key is intentionally public; room answers stay private in DB RPCs.
 */
(function (global) {
  'use strict';
  const URL = 'https://jznwaluttobcdffvvudo.supabase.co';
  const KEY = 'sb_publishable_cmnmgOEOGsS6Nw66LYQX_A_hJkHFUBF';
  const HEADERS = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const ID_KEY = 'wangdoku_multiplayer_player_id';
  let playerId;
  try { playerId = localStorage.getItem(ID_KEY); } catch (e) { /* ignore */ }
  if (!playerId) {
    playerId = 'p_' + crypto.getRandomValues(new Uint32Array(4)).join('').slice(0, 28);
    try { localStorage.setItem(ID_KEY, playerId); } catch (e) { /* ignore */ }
  }
  async function rpc(name, body) {
    const res = await fetch(URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && (data.message || data.hint)) || 'Connection failed');
    return data;
  }
  function code() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out = '';
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    for (const b of bytes) out += chars[b % chars.length];
    return out;
  }
  function safePuzzle(p) { return { n: p.n, regions: p.regions, difficulty: p.difficulty || 2 }; }
  global.WangDoKuMultiplayer = {
    playerId,
    create: (puzzle) => rpc('create_match', { p_code: code(), p_puzzle: safePuzzle(puzzle), p_solution: puzzle.solution, p_host_id: playerId }),
    join: (roomCode) => rpc('join_match', { p_code: roomCode.trim().toUpperCase(), p_player_id: playerId }),
    get: (roomCode) => rpc('get_match', { p_code: roomCode, p_player_id: playerId }),
    move: (roomCode, r, c) => rpc('play_match_move', { p_code: roomCode, p_player_id: playerId, p_row: r, p_col: c }),
    leave: (roomCode) => rpc('leave_match', { p_code: roomCode, p_player_id: playerId }),
  };
})(window);
