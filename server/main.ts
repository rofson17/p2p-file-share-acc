import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        handle(req, res);
    });

    const io = new Server(httpServer, {
        cors: {
            origin: process.env.ALLOWED_ORIGIN || "*",
            methods: ["GET", "POST"],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    io.on("connection", (socket) => {
        console.log(`> User connected: ${socket.id}`);

        socket.on("join-room", (roomId: string) => {
            if (!roomId || typeof roomId !== "string") return;

            const cleanRoom = roomId.trim().toLowerCase();
            const room = io.sockets.adapter.rooms.get(cleanRoom);
            const numClients = room ? room.size : 0;

            if (numClients >= 2) {
                socket.emit("room-full");
                return;
            }

            socket.join(cleanRoom);
            socket.emit("room-joined", cleanRoom);

            console.log(`> User ${socket.id} joined room: ${cleanRoom} (${numClients + 1}/2)`);

            if (numClients === 1) {
                socket.to(cleanRoom).emit("init-offer");
            }
        });

        socket.on("offer", ({ roomId, offer }: { roomId: string; offer: RTCSessionDescriptionInit }) => {
            if (!roomId || typeof roomId !== "string") return;
            socket.to(roomId.trim().toLowerCase()).emit("offer", offer);
        });

        socket.on("answer", ({ roomId, answer }: { roomId: string; answer: RTCSessionDescriptionInit }) => {
            if (!roomId || typeof roomId !== "string") return;
            socket.to(roomId.trim().toLowerCase()).emit("answer", answer);
        });

        socket.on("ice-candidate", ({ roomId, candidate }: { roomId: string; candidate: RTCIceCandidateInit }) => {
            if (!roomId || typeof roomId !== "string") return;
            socket.to(roomId.trim().toLowerCase()).emit("ice-candidate", candidate);
        });

        socket.on("disconnect", () => {
            console.log(`> User disconnected: ${socket.id}`);
        });
    });

    httpServer.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
});