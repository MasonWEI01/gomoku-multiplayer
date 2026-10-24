const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// rooms: { code: { players: [socketId...], spectators: [socketId...], board, current, gameOver, host, started } }
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
}

function emptyBoard() {
  return Array.from({ length: 15 }, () => Array(15).fill(0));
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('createRoom', () => {
    const code = generateCode();
    rooms.set(code, {
      players: [socket.id],
      spectators: [],
      board: emptyBoard(),
      current: 1,
      gameOver: false,
      host: socket.id,
      started: false
    });
    socket.join(code);
    socket.roomCode = code;
    socket.color = 1;
    socket.role = 'player';
    socket.emit('roomCreated', { code, color: 1 });
  });

  socket.on('joinRoom', (code) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      socket.emit('errorMsg', '房間不存在');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('errorMsg', '房間已滿，可改用旁觀模式');
      return;
    }
    room.players.push(socket.id);
    socket.join(code);
    socket.roomCode = code;
    socket.color = 2;
    socket.role = 'player';
    socket.emit('joined', { code, color: 2 });
    if (room.players.length === 2) {
      room.started = true;
      io.to(code).emit('gameStarted', { code });
    }
    io.to(code).emit('playerJoined', { players: room.players.length });
    socket.emit('sync', {
      board: room.board,
      current: room.current,
      gameOver: room.gameOver
    });
  });

  socket.on('spectate', (code) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      socket.emit('errorMsg', '房間不存在');
      return;
    }
    if (!room.started || room.players.length < 2) {
      socket.emit('errorMsg', '對局尚未開始，暫時無法旁觀');
      return;
    }
    room.spectators.push(socket.id);
    socket.join(code);
    socket.roomCode = code;
    socket.role = 'spectator';
    socket.emit('spectating', { code });
    socket.emit('sync', {
      board: room.board,
      current: room.current,
      gameOver: room.gameOver
    });
    io.to(code).emit('spectatorJoined', { count: room.spectators.length });
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
    if (win) room.gameOver = true;
    else room.current = 3 - room.current;

    io.to(code).emit('move', {
      r, c, color: socket.color,
      current: room.current,
      gameOver: room.gameOver,
      win
    });
  });

  socket.on('restart', () => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room || socket.role !== 'player') return;
    room.board = emptyBoard();
    room.current = 1;
    room.gameOver = false;
    io.to(code).emit('restart');
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    if (socket.role === 'player') {
      room.players = room.players.filter(id => id !== socket.id);
      room.started = room.players.length >= 2;
      io.to(code).emit('playerLeft');
    } else if (socket.role === 'spectator') {
      room.spectators = room.spectators.filter(id => id !== socket.id);
      io.to(code).emit('spectatorLeft', { count: room.spectators.length });
    }

    if (room.players.length === 0) {
      rooms.delete(code);
    }
  });
});

function checkWin(board, r, c, color) {
  const SIZE = 15;
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

server.listen(PORT, () => {
  console.log(`Gomoku server running on port ${PORT}`);
});
