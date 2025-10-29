// pages/receiver.js
import { useEffect, useRef, useState } from "react";
import { getSignalingUrl } from "../signalingUrl";

export default function Receiver() {
  const pcRef = useRef(null);
  const wsRef = useRef(null);

  const [roomId, setRoomId] = useState("test-room");
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState(0);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.binaryType = "arraybuffer";
      const buffers = [];
      channel.onmessage = (e) => {
        if (typeof e.data === "string" && e.data === "EOF") {
          const blob = new Blob(buffers, { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "received_file";
          a.click();
          URL.revokeObjectURL(url);
        } else {
          buffers.push(e.data);
        }
      };
    };

    // Signaling socket (create once)
    const signalingUrl = getSignalingUrl();
    console.log("Receiver connecting to:", signalingUrl);
    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => console.log("Receiver WS connected");

    ws.onerror = (error) => {
      console.error("Receiver WebSocket error:", error);
    };

    ws.onclose = (event) => {
      console.log("Receiver WebSocket closed:", event.code, event.reason);
    };

    ws.onmessage = async (evt) => {
      console.log("Receiver received:", evt.data);
      const msg = JSON.parse(evt.data);
      const pc = pcRef.current;
      if (!pc) return;

      // Presence updates
      if (msg.type === "joined" || msg.type === "peer-joined" || msg.type === "peer-left") {
        console.log("Receiver presence update:", msg);
        if (msg.count != null) setPeers(msg.count);
        if (Array.isArray(msg.roles)) setRoles(msg.roles);
        return;
      }

      if (msg.type === "offer" && msg.sdp) {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", sdp: pc.localDescription, room: roomId }));
      } else if (msg.type === "candidate" && msg.candidate) {
        try { await pc.addIceCandidate(msg.candidate); }
        catch (e) { console.error("Failed to add ICE candidate", e); }
      }
    };

    // Send ICE whenever we have it (server forwards after join)
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: "candidate", candidate: e.candidate, room: roomId }));
      }
    };

    return () => {
      try { ws.close(); } catch {}
      try { pc.close(); } catch {}
    };
  }, []); // don't depend on 'joined'

  const joinRoom = () => {
    console.log("Receiver attempting to join room:", roomId);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log("Receiver WebSocket not ready, retrying...");
      setTimeout(joinRoom, 300);
      return;
    }
    const joinMessage = { type: "join", room: roomId, role: "receiver" };
    console.log("Receiver sending join message:", joinMessage);
    wsRef.current.send(JSON.stringify(joinMessage));
    setJoined(true);
  };

  const hasSender = roles.includes("sender");

  return (
    <div style={{ padding: 20 }}>
      <h2>📥 Receiver</h2>
      <div>
        <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="room id" />
        <button onClick={joinRoom} disabled={joined}>Join room</button>
      </div>
      <p>Room: <b>{roomId}</b> — Peers: {peers} — Sender present: {hasSender ? "Yes" : "No"}</p>
      <p>Waiting for offer...</p>
    </div>
  );
}