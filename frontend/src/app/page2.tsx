"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const socket = new WebSocket("ws://100.64.1.15:8000/ws");

    socket.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]);
    };

    socket.onopen = () => {
      console.log("✅ WebSocket connected");
      socket.send("Hello from client");
    };

    socket.onclose = () => {
      console.log("❌ WebSocket closed");
    };

    return () => socket.close();
  }, []);

  return (
    <main>
      <h1>通知一覧</h1>
      <ul>
        {messages.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
    </main>
  );
}
