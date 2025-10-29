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
  const [myPeerId, setMyPeerId] = useState(null);
  const [myRole, setMyRole] = useState("receiver");
  const roomIdRef = useRef("test-room"); // Add ref to track current roomId

  // Update roomIdRef when roomId changes
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    // Add connection state monitoring to receiver too
    pc.onconnectionstatechange = () => {
      console.log("🔗 Receiver connection state changed to:", pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("🧊 Receiver ICE connection state:", pc.iceConnectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.log("📊 Receiver ICE gathering state:", pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log("📡 Receiver signaling state:", pc.signalingState);
    };

    pc.ondatachannel = (event) => {
      console.log("🎉 Receiver: Data channel received!");
      const channel = event.channel;
      channel.binaryType = "arraybuffer";
      const buffers = [];
      let fileMetadata = null;
      
      channel.onopen = () => {
        console.log("🎉 Receiver: Data channel opened!");
      };
      
      channel.onclose = () => {
        console.log("❌ Receiver: Data channel closed!");
      };
      
      channel.onerror = (error) => {
        console.error("❌ Receiver: Data channel error:", error);
      };
      
      channel.onmessage = (e) => {
        if (typeof e.data === "string") {
          if (e.data.startsWith("METADATA:")) {
            // Parse file metadata (name, type, size)
            try {
              fileMetadata = JSON.parse(e.data.substring(9));
              console.log("Received file metadata:", fileMetadata);
            } catch (err) {
              console.error("Failed to parse metadata:", err);
            }
          } else if (e.data === "EOF") {
            // Create blob with proper type
            const mimeType = fileMetadata?.type || "application/octet-stream";
            const fileName = fileMetadata?.name || "received_file";
            
            const blob = new Blob(buffers, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a); // Add to DOM for Firefox compatibility
            a.click();
            document.body.removeChild(a); // Clean up
            URL.revokeObjectURL(url);
            
            console.log(`File received: ${fileName} (${blob.size} bytes, ${mimeType})`);
            
            // Reset for next file
            buffers.length = 0;
            fileMetadata = null;
          }
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
        console.log("Receiver roles received:", msg.roles);
        if (msg.count != null) setPeers(msg.count);
        if (Array.isArray(msg.roles)) {
          console.log("Receiver setting roles to:", msg.roles);
          setRoles(msg.roles);
        }
        
        // Store our own peer ID when we join
        if (msg.type === "joined" && msg.peerId) {
          setMyPeerId(msg.peerId);
          console.log("Receiver received my peer ID:", msg.peerId);
        }
        return;
      }

      if (msg.type === "offer" && msg.sdp) {
        console.log("📥 Receiver: Received offer, current signaling state:", pc.signalingState);
        try {
          await pc.setRemoteDescription(msg.sdp);
          console.log("✅ Receiver: Offer set successfully, new signaling state:", pc.signalingState);
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log("📤 Receiver: Sending answer, signaling state:", pc.signalingState);
          
          ws.send(JSON.stringify({ type: "answer", sdp: pc.localDescription, room: roomIdRef.current }));
        } catch (error) {
          console.error("❌ Receiver: Failed to handle offer:", error);
        }
      } else if (msg.type === "candidate" && msg.candidate) {
        console.log("📥 Receiver: Received ICE candidate:", msg.candidate);
        try { 
          await pc.addIceCandidate(msg.candidate);
          console.log("✅ Receiver: ICE candidate added successfully");
        }
        catch (e) { 
          console.error("❌ Receiver: Failed to add ICE candidate", e); 
        }
      }
    };

    // Send ICE whenever we have it (server forwards after join)
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current) {
        // Check WebSocket state instead of joined flag
        if (wsRef.current.readyState === WebSocket.OPEN) {
          console.log("📤 Receiver: Sending ICE candidate:", e.candidate);
          wsRef.current.send(JSON.stringify({ 
            type: "candidate", 
            candidate: e.candidate, 
            room: roomIdRef.current // Use ref instead of state
          }));
        } else {
          console.warn("⚠️ Receiver: WebSocket not ready, ICE candidate not sent");
        }
      } else if (!e.candidate) {
        console.log("🏁 Receiver: ICE gathering complete");
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
      console.log("Receiver WebSocket not ready, state:", wsRef.current?.readyState, "retrying...");
      setTimeout(joinRoom, 300);
      return;
    }
    const joinMessage = { type: "join", room: roomIdRef.current, role: "receiver" };
    console.log("Receiver sending join message:", joinMessage);
    wsRef.current.send(JSON.stringify(joinMessage));
    setJoined(true);
  };

  const hasSender = roles.some(roleObj => {
    console.log("Receiver checking role object:", roleObj);
    return typeof roleObj === 'object' ? roleObj.role === "sender" : roleObj === "sender";
  });
  console.log("Receiver roles array:", roles, "Has sender:", hasSender);

  return (
    <div style={{ padding: 20 }}>
      <h2>📥 Receiver</h2>
      <div>
        <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="room id" />
        <button onClick={joinRoom} disabled={joined}>Join room</button>
      </div>
      <p>Room: <b>{roomId}</b> — Peers: {peers}</p>
      {joined && (
        <p style={{color: peers >= 2 ? 'green' : 'orange'}}>
          Status: {peers >= 2 ? 'Ready to receive!' : `Waiting for sender (${peers}/2 peers)`}
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
      <p>Waiting for offer...</p>
    </div>
  );
}