const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const SIZE = 15;

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
}

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function getCandidates(board) {
  const set = new Set();
  let hasStone = false;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== 0) {
        hasStone = true;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === 0) {
              set.add(nr * SIZE + nc);
            }
          }
        }
      }
    }
  }
  if (!hasStone) return [[7, 7]];
  return Array.from(set).map(k => [Math.floor(k / SIZE), k % SIZE]);
}

function scorePoint(board, r, c, color) {
  if (board[r][c] !== 0) return -1;
  const opp = 3 - color;
  let score = 0;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let own = 0, empty = 0, blocked = 0;
    for (let d = 1; d < 5; d++) {
      const nr = r + dr * d, nc = c + dc * d;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || board[nr][nc] === opp) { blocked++; break; }
      if (board[nr][nc] === color) own++;
      else { empty++; break; }
    }
    for (let d = 1; d < 5; d++) {
      const nr = r - dr * d, nc = c - dc * d;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || board[nr][nc] === opp) { blocked++; break; }
      if (board[nr][nc] === color) own++;
      else { empty++; break; }
    }
    const len = own + 1;
    if (len >= 5) score += 1000000;
    else if (len === 4 && empty >= 2 && blocked === 0) score += 50000;
    else if (len === 4 && empty >= 1) score += 10000;
    else if (len === 3 && empty >= 2 && blocked === 0) score += 5000;
    else if (len === 3 && empty >= 1) score += 500;
    else if (len === 2 && empty >= 2) score += 100;
    else if (len === 2) score += 20;
  }
  score += (7 - Math.abs(r - 7)) + (7 - Math.abs(c - 7));
  return score;
}

function aiMove(board, difficulty) {
  const candidates = getCandidates(board);
  if (!candidates.length) return null;
  for (const [r, c] of candidates) {
    board[r][c] = 2;
    if (checkWin(board, r, c, 2)) { board[r][c] = 0; return [r, c]; }
    board[r][c] = 0;
  }
  for (const [r, c] of candidates) {
    board[r][c] = 1;
    if (checkWin(board, r, c, 1)) { board[r][c] = 0; return [r, c]; }
    board[r][c] = 0;
  }
  if (difficulty === 'easy') {
    const scored = candidates.map(([r, c]) => ({ r, c, s: scorePoint(board, r, c, 2) }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, Math.max(1, Math.floor(scored.length / 2)));
    const pick = top[Math.floor(Math.random() * top.length)];
    return [pick.r, pick.c];
  }
  let best = -Infinity, bestMove = candidates[0];
  for (const [r, c] of candidates) {
    const attack = scorePoint(board, r, c, 2);
    const defense = scorePoint(board, r, c, 1);
    let s = attack * 1.15 + defense * (difficulty === 'hard' ? 1.2 : 1.0);
    if (difficulty === 'hard' && defense >= 5000) s += 4000;
    if (s > best) { best = s; bestMove = [r, c]; }
  }
  return bestMove;
}

function checkWin(board, r, c, color) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let d = 1; d < 5; d++) {
      const nr = r + dr * d, nc = c + dc * d;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || board[nr][nc] !== color) break;
      count++;
    }
    for (let d = 1; d < 5; d++) {
      const nr = r - dr * d, nc = c - dc * d;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || board[nr][nc] !== color) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

function broadcastInfo(code) {
  const room = rooms.get(code);
  if (!room) return;
  const black = room.players.find(p => p.color === 1);
  const white = room.players.find(p => p.color === 2);
  const bn = black ? black.name : '等待中';
  const wn = white ? white.name : (room.ai ? 'AI' : '等待中');
  io.to(code).emit('roomInfo', {
    black: bn,
    white: wn,
    spectators: room.spectators.map(s => s.name),
    spectatorCount: room.spectators.length,
    isAI: !!room.ai,
    blackWins: room.blackWins || 0,
    whiteWins: room.whiteWins || 0,
    scoreText: `${bn} : ${wn} = ${room.blackWins || 0}:${room.whiteWins || 0}`
  });
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.name = '玩家' + Math.floor(Math.random() * 900 + 100);

  socket.on('setName', (name) => {
    name = (name || '').trim().slice(0, 12) || socket.name;
    socket.name = name;
    if (socket.roomCode) {
      const room = rooms.get(socket.roomCode);
      if (!room) return;
      const p = room.players.find(x => x.id === socket.id);
      if (p) p.name = name;
      const s = room.spectators.find(x => x.id === socket.id);
      if (s) s.name = name;
      broadcastInfo(socket.roomCode);
    }
  });

  socket.on('createRoom', () => {
    const code = generateCode();
    rooms.set(code, {
      players: [{ id: socket.id, name: socket.name, color: 1 }],
      spectators: [],
      board: emptyBoard(),
      current: 1,
      gameOver: false,
      host: socket.id,
      started: false,
      ai: null,
      blackWins: 0,
      whiteWins: 0,
      nextStarter: 1
    });
    socket.join(code);
    socket.roomCode = code;
    socket.color = 1;
    socket.role = 'player';
    socket.emit('roomCreated', { code, color: 1 });
    broadcastInfo(code);
  });

  socket.on('createAIRoom', ({ difficulty }) => {
    const code = generateCode();
    const diff = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'medium';
    rooms.set(code, {
      players: [
        { id: socket.id, name: socket.name, color: 1 },
        { id: 'AI', name: 'AI', color: 2 }
      ],
      spectators: [],
      board: emptyBoard(),
      current: 1,
      gameOver: false,
      host: socket.id,
      started: true,
      ai: diff,
      blackWins: 0,
      whiteWins: 0,
      nextStarter: 1
    });
    socket.join(code);
    socket.roomCode = code;
    socket.color = 1;
    socket.role = 'player';
    socket.emit('aiRoomCreated', { code, color: 1, difficulty: diff });
    io.to(code).emit('gameStarted', { code });
    broadcastInfo(code);
  });

  socket.on('joinRoom', (code) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return socket.emit('errorMsg', '房間不存在');
    if (room.ai) return socket.emit('errorMsg', '此為人機對局，請用旁觀');
    if (room.players.length >= 2) return socket.emit('errorMsg', '房間已滿');

    room.players.push({ id: socket.id, name: socket.name, color: 2 });
    socket.join(code);
    socket.roomCode = code;
    socket.color = 2;
    socket.role = 'player';
    socket.emit('joined', { code, color: 2 });
    room.started = true;
    io.to(code).emit('gameStarted', { code });
    io.to(code).emit('playerJoined', { players: 2 });
    socket.emit('sync', { board: room.board, current: room.current, gameOver: room.gameOver });
    broadcastInfo(code);
  });

  socket.on('spectate', (code) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return socket.emit('errorMsg', '房間不存在');
    if (!room.started) return socket.emit('errorMsg', '對局尚未開始');

    room.spectators.push({ id: socket.id, name: socket.name });
    socket.join(code);
    socket.roomCode = code;
    socket.role = 'spectator';
    socket.emit('spectating', { code });
    socket.emit('sync', { board: room.board, current: room.current, gameOver: room.gameOver });
    broadcastInfo(code);
  });

  socket.on('move', ({ r, c }) => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.gameOver || socket.role !== 'player') return;
    if (room.current !== socket.color) return;
    if (room.board[r][c] !== 0) return;

    room.board[r][c] = socket.color;
    const win = checkWin(room.board, r, c, socket.color);
    if (win) {
      room.gameOver = true;
      if (socket.color === 1) room.blackWins = (room.blackWins || 0) + 1;
      else room.whiteWins = (room.whiteWins || 0) + 1;
      room.nextStarter = socket.color;
      io.to(code).emit('move', { r, c, color: socket.color, current: room.current, gameOver: true, win: true });
      broadcastInfo(code);
      return;
    }
    room.current = 3 - room.current;
    io.to(code).emit('move', { r, c, color: socket.color, current: room.current, gameOver: false, win: false });

    if (room.ai && room.current === 2 && !room.gameOver) {
      setTimeout(() => {
        const mv = aiMove(room.board, room.ai);
        if (!mv) return;
        const [ar, ac] = mv;
        room.board[ar][ac] = 2;
        const aiWin = checkWin(room.board, ar, ac, 2);
        if (aiWin) {
          room.gameOver = true;
          room.whiteWins = (room.whiteWins || 0) + 1;
          room.nextStarter = 2;
          broadcastInfo(code);
        } else room.current = 1;
        io.to(code).emit('move', { r: ar, c: ac, color: 2, current: room.current, gameOver: room.gameOver, win: aiWin });
      }, 350);
    }
  });

  socket.on('restart', () => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room || socket.role !== 'player') return;
    room.board = emptyBoard();
    room.current = room.nextStarter || 1;
    room.gameOver = false;
    io.to(code).emit('restart', { starter: room.current });
    broadcastInfo(code);
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    room.spectators = room.spectators.filter(s => s.id !== socket.id);
    if (!room.ai) room.started = room.players.length >= 2;
    io.to(code).emit('playerLeft');
    broadcastInfo(code);
    if (room.players.filter(p => p.id !== 'AI').length === 0) rooms.delete(code);
  });
});

server.listen(PORT, () => console.log('Gomoku server on', PORT));
