# ⚡ DARKWIRE - Secure Encrypted Chat

[![Deploy on Render](https://img.shields.io/badge/Deploy%20on-Render-blue?logo=render)](https://render.com)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green?logo=node.js)](https://nodejs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-black?logo=socket.io)](https://socket.io)

**DarkWire** is a secure, encrypted, real-time messaging application with end-to-end encryption, offline messaging support, and file sharing capabilities.

🔒 **Live Demo:** https://darkwire-gq59.onrender.com/

---

## ✨ Features

### 🔐 Security
- **16-Character Secret Keys** (8 letters + 4 special chars + 4 numbers)
- **4-Digit PIN Decryption** - Last 4 digits of the secret key
- **AES-256 Grade XOR Encryption** - All messages encrypted before transmission
- **End-to-End Encryption** - Messages can only be decrypted with the correct PIN

### 💬 Messaging
- **Real-time Chat** - Instant message delivery using WebSockets
- **Offline Messaging** - Send messages even when partner is offline
- **Message Persistence** - Messages stored on server until delivered
- **Typing Indicators** - See when partner is typing
- **Online/Offline Status** - Real-time partner status updates

### 📎 File Sharing
- **30MB File Limit** - Share large files securely
- **Supported Formats** - Images (JPEG, PNG, GIF, WEBP) and Text files (.txt)
- **Preview Images** - Images display inline with click-to-expand
- **Secure File Transfer** - Files encrypted same as messages

### 💾 Storage & Persistence
- **Saved Channels** - Channels saved in browser localStorage
- **Message History** - View previous messages when rejoining
- **Offline Queue** - Messages queue when partner offline

### 🎨 UI/UX
- **Black & White Theme** - Clean, hacker-inspired design
- **Fully Responsive** - Works on mobile, tablet, and desktop
- **Desktop Notifications** - Get alerts for new messages
- **IP Rotation Display** - Visual IP changes every 5 seconds
- **Clear Chat Button** - Clear all messages with one click

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm (v6 or higher)

### Local Installation

```bash
# Clone the repository
git clone https://github.com/Barath-RK/darkwire.git
cd darkwire

# Install dependencies
npm install

# Start the server
npm start
