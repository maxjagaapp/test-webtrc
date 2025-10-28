
// pages/sender.js
import { useEffect, useState } from "react";

function SenderComponent() {
  const [pc, setPc] = useState();
  const [dataChannel, setDataChannel] = useState(null);
  const [offer, setOffer] = useState("");
  const [answer, setAnswer] = useState("");
  const [file, setFile] = useState(null);

  useEffect(() => {
    setPc(new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }, // Google public STUN server
  ],
}))
  },[])

   const createConnection = async () => {
    const dc = pc.createDataChannel("fileTransfer");
    setDataChannel(dc);

    dc.onopen = () => alert("Connection open! You can send your file now.");

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setOffer(JSON.stringify(offer));

    pc.onicecandidate = (e) => {
      if (e.candidate) return;
      // no more candidates, update offer text
      setOffer(JSON.stringify(pc.localDescription));
    };
  };

  const addAnswer = async () => {
    const remoteDesc = new RTCSessionDescription(JSON.parse(answer));
    await pc.setRemoteDescription(remoteDesc);
    alert("Answer added! Ready to transfer.");
  };

  const sendFile = () => {
    if (!dataChannel || !file) return alert("No file or connection yet!");
    const chunkSize = 16 * 1024;
    const reader = new FileReader();
    let offset = 0;

    reader.onload = (e) => {
      while (offset < file.size) {
        const slice = file.slice(offset, offset + chunkSize);
        offset += chunkSize;
        reader.readAsArrayBuffer(slice);
        dataChannel.send(e.target.result);
      }
      dataChannel.send("EOF");
      alert("File sent!");
    };

    reader.readAsArrayBuffer(file.slice(0, chunkSize));
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>📤 Sender</h2>
      <button onClick={createConnection}>1️⃣ Create Offer</button>
      <textarea
        rows={10}
        cols={60}
        value={offer}
        readOnly
        placeholder="Offer will appear here"
      />
      <br />
      <textarea
        rows={10}
        cols={60}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Paste receiver answer here"
      />
      <br />
      <button onClick={addAnswer}>2️⃣ Add Answer</button>
      <br />
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={sendFile}>3️⃣ Send File</button>
    </div>
  );

}

export default function Sender() {

  return <SenderComponent />;
}