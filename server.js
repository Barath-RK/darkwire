const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 30 * 1024 * 1024
});

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));
app.use(express.static('public'));

// Store channels
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

// API Routes
app.post('/api/create', (req, res) => {
  const { name } = req.body;
  const id = crypto.randomBytes(8).toString('hex');
  const key = generateKey();
  const pin = key.slice(-4);
  
  channels.set(id, {
    id, name, key, pin,
    users: [],
    messages: [],
    offlineMessages: [],
    createdAt: Date.now()
  });
  
  console.log(`Channel created: ${name} with key: ${key}`);
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
  
  if (!found) {
    console.log(`Join failed: Key ${key} not found`);
    return res.status(404).json({ error: 'Channel not found' });
  }
  if (found.users.length >= 2) {
    return res.status(403).json({ error: 'Channel full' });
  }
  
  console.log(`User joined channel: ${found.name} with key: ${key}`);
  res.json({ 
    id: found.id, 
    name: found.name, 
    pin: found.pin, 
    messages: found.messages,
    offlineMessages: found.offlineMessages 
  });
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

// Socket.IO
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
    
    // Send all stored messages
    ch.messages.forEach(msg => {
      socket.emit('old-msg', msg);
    });
    
    // Send offline messages that were stored
    if (ch.offlineMessages && ch.offlineMessages.length > 0) {
      console.log(`Sending ${ch.offlineMessages.length} offline messages to ${userId}`);
      ch.offlineMessages.forEach(msg => {
        socket.emit('offline-msg', msg);
      });
      ch.offlineMessages = [];
    }
    
    // Notify partner that user joined
    if (ch.users.length === 2) {
      io.to(id).emit('partner-joined');
    }
    
    console.log(`User ${userId} joined channel: ${ch.name}`);
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
      time: Date.now(),
      type: 'text'
    };
    
    // Store message in history
    ch.messages.push(msgData);
    if (ch.messages.length > 100) ch.messages.shift();
    
    // Check if partner is online (channel has 2 users)
    const partnerOnline = ch.users.length === 2;
    
    if (partnerOnline) {
      // Send immediately if partner online
      io.to(id).emit('msg', msgData);
      console.log(`Message sent immediately to ${id}`);
    } else {
      // Store for offline delivery
      ch.offlineMessages.push(msgData);
      console.log(`Message stored offline for channel ${ch.name}`);
      socket.emit('msg-stored', { time: Date.now() });
    }
  });
  
  socket.on('file', (data) => {
    const { id, userId, fileName, fileData, fileType } = data;
    const ch = channels.get(id);
    if (!ch) return;
    
    const fileMsgData = {
      id: Date.now(),
      userId: userId,
      type: 'file',
      fileName: fileName,
      fileData: fileData,
      fileType: fileType,
      time: Date.now()
    };
    
    ch.messages.push(fileMsgData);
    if (ch.messages.length > 100) ch.messages.shift();
    
    const partnerOnline = ch.users.length === 2;
    
    if (partnerOnline) {
      io.to(id).emit('file', fileMsgData);
    } else {
      ch.offlineMessages.push(fileMsgData);
      socket.emit('msg-stored', { time: Date.now() });
    }
  });
  
  socket.on('typing', (data) => {
    const { id, userId, typing } = data;
    socket.to(id).emit('typing', { userId, typing });
  });
  
  socket.on('clear-chat', (data) => {
    const { id } = data;
    const ch = channels.get(id);
    if (ch) {
      ch.messages = [];
      ch.offlineMessages = [];
      io.to(id).emit('chat-cleared');
    }
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
  console.log('║      DARKWIRE - OFFLINE MESSAGING READY       ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');
  console.log('  🌐 http://localhost:' + PORT);
  console.log('  📁 Max file size: 30MB');
  console.log('  💾 Offline messages: Stored & delivered');
  console.log('');
});
