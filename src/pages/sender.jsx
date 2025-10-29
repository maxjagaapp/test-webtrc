// pages/sender.js
import { useEffect, useRef, useState } from "react";
import { getSignalingUrl } from "../signalingUrl";

function SenderComponent() {
  const pcRef = useRef(null);
  const wsRef = useRef(null);

  const [dataChannel, setDataChannel] = useState(null);
  const [dcOpen, setDcOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [roomId, setRoomId] = useState("test-room");
  const [joined, setJoined] = useState(false);

  // Presence UI
  const [peers, setPeers] = useState(0);
  const [roles, setRoles] = useState([]);
  const hasReceiver = roles.includes("receiver");

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    // Signaling socket
    const signalingUrl = getSignalingUrl();
    console.log("Connecting to signaling server:", signalingUrl);
    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected successfully");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
    };

    ws.onmessage = async (evt) => {
      console.log("Received message:", evt.data);
      const msg = JSON.parse(evt.data);
      const pc = pcRef.current;
      if (!pc) return;

      // Presence updates
      if (msg.type === "joined" || msg.type === "peer-joined" || msg.type === "peer-left") {
        console.log("Presence update:", msg);
        if (msg.count != null) setPeers(msg.count);
        if (Array.isArray(msg.roles)) setRoles(msg.roles);
        return;
      }

      if (msg.type === "answer" && msg.sdp) {
        await pc.setRemoteDescription(msg.sdp);
        console.log("Answer set.");
      } else if (msg.type === "candidate" && msg.candidate) {
        try { await pc.addIceCandidate(msg.candidate); }
        catch (e) { console.error("Failed to add ICE candidate", e); }
      }
    };

    return () => {
      try { ws.close(); } catch {}
      try { pc.close(); } catch {}
    };
  }, []);

  const joinRoom = () => {
    console.log("Attempting to join room:", roomId);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log("WebSocket not ready, retrying...");
      setTimeout(joinRoom, 300);
      return;
    }
    const joinMessage = { type: "join", room: roomId, role: "sender" };
    console.log("Sending join message:", joinMessage);
    wsRef.current.send(JSON.stringify(joinMessage));
    setJoined(true);
  };

  const createConnection = async () => {
    const pc = pcRef.current;
    const ws = wsRef.current;
    if (!pc || !ws || !joined) return alert("Join a room first.");

    const dc = pc.createDataChannel("fileTransfer");
    dc.binaryType = "arraybuffer";
    dc.onopen = () => setDcOpen(true);
    dc.onclose = () => setDcOpen(false);
    setDataChannel(dc);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate, room: roomId }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", sdp: pc.localDescription, room: roomId }));
  };

  const sendFile = async () => {
    const dc = dataChannel;
    if (!dc || !file) return alert("No file or connection yet!");
    if (dc.readyState !== "open") return alert("Data channel not open yet.");

    const chunkSize = 16 * 1024;
    const reader = new FileReader();
    let offset = 0;

    dc.bufferedAmountLowThreshold = 1 << 20; // 1MB
    const waitBufferedAmountLow = () =>
      new Promise((resolve) => {
        const handler = () => {
          dc.removeEventListener("bufferedamountlow", handler);
          resolve();
        };
        dc.addEventListener("bufferedamountlow", handler);
      });

    const pump = async () => {
      if (offset >= file.size) {
        dc.send("EOF");
        alert("File sent!");
        return;
      }
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = async (e) => {
      try { dc.send(e.target.result); }
      catch (err) { console.error("send failed:", err); return; }
      offset += e.target.result.byteLength;

      if (dc.bufferedAmount > dc.bufferedAmountLowThreshold) {
        await waitBufferedAmountLow();
      }
      pump();
    };

    reader.onerror = (err) => console.error("File read error:", err);

    pump();
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>📤 Sender</h2>
      <div>
        <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="room id" />
        <button onClick={joinRoom} disabled={joined}>Join room</button>
      </div>
      <p>Room: <b>{roomId}</b> — Peers: {peers} — Receiver present: {hasReceiver ? "Yes" : "No"}</p>
      <button onClick={createConnection} disabled={!joined}>1️⃣ Create Offer</button>
      <br />
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={sendFile} disabled={!file || !dcOpen}>3️⃣ Send File</button>
    </div>
  );
}

export default function Sender() {
  return <SenderComponent />;
}