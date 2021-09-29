import { Server } from "ws";
import * as admin from "firebase-admin";
import * as path from "path";
import * as dgram from "dgram";

interface Remote {
  address: string;
  port: number;
}

class Rooms {
  #map = new Map<string, Remote[]>();

  join(roomName: string, remote: Remote): void {
    const remotes = this.#map.get(roomName);

    if (remotes === undefined) {
      this.#map.set(roomName, [remote]);
    } else {
      remotes.push(remote);
    }
  }

  getRemoteAddresses(roomName: string): Remote[] {
    return this.#map.get(roomName) ?? [];
  }
}

const rooms = new Rooms();

const dgramSocket = dgram.createSocket("udp4");

dgramSocket.on("message", (msg, rinfo) => {
  const typedArray = new Uint8Array(msg);
  const videoroomIdLength = typedArray[typedArray.length - 1]!;
  const videoroomIdBytes = typedArray.subarray(
    typedArray.length - videoroomIdLength - 1,
    typedArray.length - 1
  );
  const textDecoder = new TextDecoder();
  const videoroomId = textDecoder.decode(videoroomIdBytes);

  const roomRemotes = rooms.getRemoteAddresses("videoroom:" + videoroomId);
  for (const roomRemote of roomRemotes) {
    if (
      roomRemote.address !== rinfo.address ||
      roomRemote.port !== rinfo.port
    ) {
      dgramSocket.send(
        typedArray.subarray(0, typedArray.length - videoroomIdLength - 1),
        roomRemote.port,
        roomRemote.address
      );
    }
  }
});

dgramSocket.bind(3000, "127.0.0.1", () => {
  console.log(dgramSocket.address());
});

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

server.on("connection", (socket) => {
  // req.socket.remoteAddress
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
          rooms.join("videoroom:" + parsedData.videoroomId, {
            address: "127.0.0.1",
            port: parsedData.datagramPort,
          });
          console.log("joined room", {
            port: parsedData.datagramPort,
          });
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
    }
  });
});
