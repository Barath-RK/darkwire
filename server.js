const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store channels and messages
const channels = new Map();
let currentIP = '127.0.0.1';

function generateKey() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const special = '!@#$%^&*';
  const numbers = '0123456789';
  let key = '';
  for (let i = 0; i < 8; i++) key += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) key += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 4; i++) key += numbers[Math.floor(Math.random() * numbers.length)];
  return key;
}

function encrypt(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(result, 'binary').toString('base64');
}

app.post('/api/create', (req, res) => {
  const { name } = req.body;
  const id = crypto.randomBytes(8).toString('hex');
  const key = generateKey();
  const pin = key.slice(-4);
  
  channels.set(id, {
    id, name, key, pin,
    users: [],
    messages: [],
    createdAt: Date.now()
  });
  
  res.json({ id, key, pin, name });
});

app.post('/api/join', (req, res) => {
  const { key } = req.body;
  
  let found = null;
  for (const [id, ch] of channels) {
    if (ch.key === key) {
      found = { id, ...ch };
      break;
    }
  }
  
  if (!found) return res.status(404).json({ error: 'Channel not found' });
  if (found.users.length >= 2) return res.status(403).json({ error: 'Channel full' });
  
  res.json({ id: found.id, name: found.name, pin: found.pin, messages: found.messages });
});

app.post('/api/verify', (req, res) => {
  const { id, pin } = req.body;
  const ch = channels.get(id);
  if (!ch) return res.status(404).json({ error: 'Not found' });
  if (ch.pin === pin) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Wrong PIN' });
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  let currentChannelId = null;
  let currentUserId = null;
  
  socket.on('join', (data) => {
    const { id, userId } = data;
    const ch = channels.get(id);
    if (!ch) {
      socket.emit('error', 'Channel not found');
      return;
    }
    if (ch.users.length >= 2 && !ch.users.includes(userId)) {
      socket.emit('error', 'Channel full');
      return;
    }
    
    currentChannelId = id;
    currentUserId = userId;
    
    socket.join(id);
    if (!ch.users.includes(userId)) ch.users.push(userId);
    
    // Send message history
    ch.messages.forEach(msg => {
      socket.emit('old-msg', msg);
    });
    
    // Notify partner
    if (ch.users.length === 2) {
      io.to(id).emit('partner-joined');
    }
    
    console.log('User joined channel:', ch.name);
  });
  
  socket.on('msg', (data) => {
    const { id, text, userId } = data;
    const ch = channels.get(id);
    if (!ch) return;
    
    const encrypted = encrypt(text, ch.key);
    const msgData = { 
      id: Date.now(), 
      userId: userId, 
      text: encrypted, 
      time: Date.now()
    };
    
    ch.messages.push(msgData);
    if (ch.messages.length > 100) ch.messages.shift();
    
    io.to(id).emit('msg', msgData);
  });
  
  socket.on('typing', (data) => {
    const { id, userId, typing } = data;
    socket.to(id).emit('typing', { userId, typing });
  });
  
  socket.on('disconnect', () => {
    if (currentChannelId && currentUserId) {
      const ch = channels.get(currentChannelId);
      if (ch) {
        const index = ch.users.indexOf(currentUserId);
        if (index !== -1) {
          ch.users.splice(index, 1);
          io.to(currentChannelId).emit('partner-left');
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

// IP rotation
setInterval(() => {
  currentIP = Math.floor(Math.random() * 255) + '.' + 
              Math.floor(Math.random() * 255) + '.' + 
              Math.floor(Math.random() * 255) + '.' + 
              Math.floor(Math.random() * 255);
  io.emit('ip', currentIP);
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║         DARKWIRE - GLOBAL CHAT READY          ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');
  console.log('  🌐 http://localhost:' + PORT);
  console.log('');
});