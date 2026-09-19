# P2P Browser File Shar-ACC

A real-time, browser-to-browser (P2P) file-sharing application built with **Next.js (TypeScript)**, **Socket.io**, and **WebRTC**. Files are transferred directly between peers via secure data channels, meaning large files don't strain your server bandwidth.

## ✨ Features

* **Room-Based Joining:** Users enter a shared room name via a browser prompt to securely connect with a peer.
* **Strict Room Limits:** Restricted to exactly 2 users per room to ensure clean 1-to-1 peer connections.
* **Direct P2P Transfer:** Uses WebRTC Data Channels for lightning-fast, browser-to-browser file transfers.
* **Light-Mode UI:** Clean, professional interface styled with Tailwind CSS and a minimalist upload icon button.
* **Real-Time Progress Tracking:** Live percentage indicators and status updates for both sending and receiving parties.
* **Production-Ready:** Optimized with custom TypeScript server configuration (`server.ts`), backpressure safeguards, and heartbeat tuning.

---

## 🛠️ Tech Stack

* **Frontend:** Next.js, React, TypeScript, Tailwind CSS
* **Signaling Server:** Node.js, Socket.io, TypeScript (`tsx`)
* **Transport Protocol:** WebRTC (`RTCPeerConnection` & `RTCDataChannel`)

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone or set up your project folder.
2. Install dependencies:
   ```bash
   npm install