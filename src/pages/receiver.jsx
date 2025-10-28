// pages/receiver.js
import { useEffect } from "react";
import { useState } from "react";

export default function Receiver() {
  const [pc, setPc] = useState();
  const [offer, setOffer] = useState("");
  const [answer, setAnswer] = useState("");
  const [receivedBuffers, setReceivedBuffers] = useState([]);

  useEffect(()=>{ setPc(new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }, // Google public STUN server
  ],
}))
  },[])

  const createAnswer = async () => {
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      const buffers = [];
      channel.onmessage = (e) => {
        console.log("Received message:", e.data);
        if (e.data === "EOF") {
          const blob = new Blob(buffers);
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

    await pc.setRemoteDescription(JSON.parse(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setAnswer(JSON.stringify(answer));

    pc.onicecandidate = (e) => {
      if (e.candidate) return;
      setAnswer(JSON.stringify(pc.localDescription));
    };
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>📥 Receiver</h2>
      <textarea
        rows={10}
        cols={60}
        value={offer}
        onChange={(e) => setOffer(e.target.value)}
        placeholder="Paste sender offer here"
      />
      <br />
      <button onClick={createAnswer}>1️⃣ Create Answer</button>
      <textarea
        rows={10}
        cols={60}
        value={answer}
        readOnly
        placeholder="Answer will appear here"
      />
    </div>
  );
}