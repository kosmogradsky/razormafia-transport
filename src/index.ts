import { Server, WebSocket } from "ws";
import * as admin from "firebase-admin";
import * as path from "path";

const app = admin.initializeApp({
  credential: admin.credential.cert(
    path.resolve(
      __dirname,
      "./serviceAccountKeys/razormafia-e1ac2-firebase-adminsdk-pll99-0b84d9225c.json"
    )
  ),
  databaseURL:
    "https://razormafia-e1ac2-default-rtdb.europe-west1.firebasedatabase.app",
});

const server = new Server({ port: 8000 });

class Rooms {
  #map = new Map<string, WebSocket[]>();

  join(roomName: string, socket: WebSocket): void {
    const sockets = this.#map.get(roomName);

    if (sockets === undefined) {
      this.#map.set(roomName, [socket]);
    } else {
      sockets.push(socket);
    }
  }

  getSockets(roomName: string): WebSocket[] {
    return this.#map.get(roomName) ?? [];
  }
}

const rooms = new Rooms();

server.on("connection", (socket) => {
  socket.addEventListener("message", async (event) => {
    if (typeof event.data === "string") {
      const parsedData = JSON.parse(event.data);

      const slotSnapshot = await app
        .firestore()
        .collection("videorooms")
        .doc(parsedData.videoroomId)
        .get();
      const slotData = slotSnapshot.data()?.[parsedData.slot];

      if (slotData === undefined) {
        socket.send(JSON.stringify({ status: "error" }));
      } else {
        const decodedToken = await app.auth().verifyIdToken(parsedData.idToken);

        if (decodedToken.uid === slotData.uid) {
          rooms.join("videoroom:" + parsedData.videoroomId, socket);
          socket.send(
            JSON.stringify({
              status: "ok",
              videoroomId: parsedData.videoroomId,
              slot: parsedData.slot,
            })
          );
        } else {
          socket.send(JSON.stringify({ status: "error" }));
        }
      }
    } else {
      const typedArray = new Uint8Array(event.data as ArrayBuffer);
      const videoroomIdLength = typedArray[typedArray.length - 1]!;
      const videoroomIdBytes = typedArray.subarray(
        typedArray.length - videoroomIdLength - 1,
        typedArray.length - 1
      );
      const textDecoder = new TextDecoder();
      const videoroomId = textDecoder.decode(videoroomIdBytes);

      const sockets = rooms.getSockets("videoroom:" + videoroomId);
      for (const roomSocket of sockets) {
        if (roomSocket !== socket) {
          roomSocket.send(
            typedArray.subarray(0, typedArray.length - videoroomIdLength - 1)
          );
        }
      }
    }
  });
});
