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
  const [myPeerId, setMyPeerId] = useState(null);
  const [myRole, setMyRole] = useState("sender");
  const hasReceiver = roles.some(roleObj => {
    console.log("Checking role object:", roleObj);
    return typeof roleObj === 'object' ? roleObj.role === "receiver" : roleObj === "receiver";
  });
  console.log("Roles array:", roles, "Has receiver:", hasReceiver);

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
        console.log("Roles received:", msg.roles);
        if (msg.count != null) setPeers(msg.count);
        if (Array.isArray(msg.roles)) {
          console.log("Setting roles to:", msg.roles);
          setRoles(msg.roles);
        }
        
        // Store our own peer ID when we join
        if (msg.type === "joined" && msg.peerId) {
          setMyPeerId(msg.peerId);
          console.log("Received my peer ID:", msg.peerId);
        }
        return;
      }

      if (msg.type === "answer" && msg.sdp) {
        console.log("Current signaling state:", pc.signalingState);
        if (pc.signalingState === "have-local-offer") {
          try {
            await pc.setRemoteDescription(msg.sdp);
            console.log("Answer set successfully.");
          } catch (error) {
            console.error("Failed to set remote description:", error);
          }
        } else {
          console.warn("Received answer but not in correct state. Current state:", pc.signalingState);
        }
      } else if (msg.type === "candidate" && msg.candidate) {
        try { 
          await pc.addIceCandidate(msg.candidate);
          console.log("ICE candidate added successfully");
        }
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
      console.log("WebSocket not ready, state:", wsRef.current?.readyState, "retrying...");
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
      <p>Room: <b>{roomId}</b> — Peers: {peers}</p>
      {joined && (
        <p style={{color: peers >= 2 ? 'green' : 'orange'}}>
          Status: {peers >= 2 ? 'Ready to connect!' : `Waiting for receiver (${peers}/2 peers)`}
        </p>
      )}
      {myPeerId && <p>My Peer ID: <b>{myPeerId}</b> — My Role: <b>{myRole}</b></p>}
      <div>
        <h4>Peers in room:</h4>
        {roles.length > 0 ? (
          <ul>
            {roles.map((roleObj, index) => (
              <li key={index}>
                {typeof roleObj === 'object' 
                  ? `${roleObj.peerId}: ${roleObj.role}` 
                  : `Peer ${index + 1}: ${roleObj}`
                }
              </li>
            ))}
          </ul>
        ) : (
          <p>No peers in room yet</p>
        )}
      </div>
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