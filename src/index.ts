import { nanoid } from "nanoid";
import { Server, Socket } from "socket.io";

const connections = new Map<string, { socketId: string; socket: Socket }>();

const io = new Server(8000, {
  transports: ["websocket"],
});

io.on("connection", (socket) => {
  const socketId = nanoid();
  const connection = { socketId, socket };
  connections.set(socketId, connection);
  console.log('new connection', socketId)

  socket.on(
    "frame to server",
    (frame: { type: string; timestamp: number; chunkData: Uint8Array }) => {
      for (const otherConnection of connections.values()) {
        if (otherConnection.socketId !== socketId) {
          otherConnection.socket.emit("frame to client", frame);
          console.log('sending frame to client', otherConnection.socketId);
        }
      }
    }
  );
});
