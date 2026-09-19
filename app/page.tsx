"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks

interface IncomingFile {
  name: string;
  size: number;
  type: string;
  chunks: ArrayBuffer[];
  received: number;
}

export default function Home() {
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [roomId, setRoomId] = useState<string>("");
  const [status, setStatus] = useState<string>("Initializing...");
  const [connected, setConnected] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [fileName, setFileName] = useState<string>("");

  const incomingFile = useRef<IncomingFile | null>(null);

  useEffect(() => {
    const promptRoom = prompt("Enter Room Name to join:");
    if (!promptRoom || !promptRoom.trim()) {
      alert("Room name is required to proceed.");
      return;
    }

    const cleanRoom = promptRoom.trim().toLowerCase();
    setRoomId(cleanRoom);

    const socket = io({
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Connected to server. Joining room...");
      socket.emit("join-room", cleanRoom);
    });

    socket.on("room-full", () => {
      alert("This room is full! Only 2 users are allowed per room.");
      setStatus("Room is full.");
    });

    socket.on("room-joined", () => {
      setStatus(`Joined room: ${cleanRoom}. Waiting for peer...`);
    });

    socket.on("init-offer", async () => {
      await createOffer(cleanRoom);
    });

    socket.on("offer", async (offer: RTCSessionDescriptionInit) => {
      await createAnswer(cleanRoom, offer);
    });

    socket.on("answer", async (answer: RTCSessionDescriptionInit) => {
      await peerRef.current?.setRemoteDescription(answer);
    });

    socket.on("ice-candidate", async (candidate: RTCIceCandidateInit) => {
      try {
        if (peerRef.current) {
          await peerRef.current.addIceCandidate(candidate);
        }
      } catch (err) {
        console.log("Error adding received ICE candidate", err);
      }
    });

    return () => {
      socket.disconnect();
      peerRef.current?.close();
    };
  }, []);

  function createPeerConnection(currentRoom: string): RTCPeerConnection {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("ice-candidate", {
          roomId: currentRoom,
          candidate: event.candidate,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") {
        setConnected(true);
        setStatus("Peer connected securely! Ready to share.");
      } else if (state === "disconnected" || state === "failed") {
        setConnected(false);
        setStatus("Peer connection lost.");
      }
    };

    peer.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    peerRef.current = peer;
    return peer;
  }

  function setupDataChannel(channel: RTCDataChannel) {
    channelRef.current = channel;
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      setConnected(true);
      setStatus("Data channel active. Ready to transfer.");
    };

    channel.onclose = () => {
      setConnected(false);
      setStatus("Data channel closed.");
    };

    channel.onerror = (error) => {
      console.log("Data channel error:", error);
      setStatus("Transfer error encountered.");
    };

    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "file-info") {
            incomingFile.current = {
              name: msg.name,
              size: msg.size,
              type: msg.fileType,
              chunks: [],
              received: 0,
            };
            setFileName(msg.name);
            setProgress(0);
            setStatus(`Receiving ${msg.name}...`);
          } else if (msg.type === "file-complete") {
            finalizeDownload();
          }
        } catch (e) {
          console.log("Failed to parse incoming text message", e);
        }
        return;
      }

      const incoming = incomingFile.current;
      if (!incoming) return;

      incoming.chunks.push(event.data);
      incoming.received += event.data.byteLength;

      const pct = Math.min(100, (incoming.received / incoming.size) * 100);
      setProgress(pct);
    };
  }

  async function createOffer(currentRoom: string) {
    const peer = createPeerConnection(currentRoom);
    const channel = peer.createDataChannel("file-channel", {
      ordered: true,
    });
    setupDataChannel(channel);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socketRef.current?.emit("offer", { roomId: currentRoom, offer });
  }

  async function createAnswer(currentRoom: string, offer: RTCSessionDescriptionInit) {
    const peer = createPeerConnection(currentRoom);
    await peer.setRemoteDescription(offer);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socketRef.current?.emit("answer", { roomId: currentRoom, answer });
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") {
      alert("Peer connection is not active yet.");
      return;
    }

    setFileName(file.name);
    setProgress(0);
    setStatus(`Sending ${file.name}...`);

    channel.send(
      JSON.stringify({
        type: "file-info",
        name: file.name,
        size: file.size,
        fileType: file.type,
      })
    );

    let offset = 0;
    try {
      while (offset < file.size) {
        if (channel.bufferedAmount > 8 * 1024 * 1024) {
          await new Promise((res) => setTimeout(res, 100));
          continue;
        }

        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await chunk.arrayBuffer();
        channel.send(buffer);

        offset += buffer.byteLength;
        const pct = Math.min(100, (offset / file.size) * 100);
        setProgress(pct);
      }

      channel.send(JSON.stringify({ type: "file-complete" }));
      setStatus(`Successfully sent ${file.name}!`);
    } catch (err) {
      console.log("Transfer failed:", err);
      setStatus("File transfer failed.");
      alert("An error occurred during file transfer.");
    }
  }

  function finalizeDownload() {
    const incoming = incomingFile.current;
    if (!incoming) return;

    try {
      const blob = new Blob(incoming.chunks, { type: incoming.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = incoming.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setProgress(100);
      setStatus(`Successfully received ${incoming.name}!`);
    } catch (err) {
      console.log("Failed to assemble downloaded file:", err);
      setStatus("Error saving file.");
    } finally {
      incomingFile.current = null;
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl text-center">
        <h1 className="text-2xl font-bold mb-1 text-slate-900">P2P File Drop -ACC</h1>
        <p className="text-sm text-slate-500 mb-6">
          Room: <span className="text-slate-900 font-semibold">{roomId || "None"}</span>
        </p>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center my-8">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!connected}
            className="w-20 h-20 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm border border-slate-200 group cursor-pointer"
            title="Click to upload file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-slate-600 group-hover:scale-110 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          </button>
          <span className="text-xs text-slate-500 mt-3">
            {connected ? "Click icon to select & send file" : "Waiting for peer to join..."}
          </span>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span className="truncate max-w-[200px]">{status}</span>
            <span className="font-mono">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          {fileName && (
            <p className="text-xs text-slate-500 mt-2 truncate">File: {fileName}</p>
          )}
        </div>
      </div>
    </main>
  )
}