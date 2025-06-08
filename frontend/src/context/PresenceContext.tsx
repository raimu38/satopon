// src/context/PresenceContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  PropsWithChildren,
} from "react";
import * as api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

type Event =
  | { type: "user_entered"; room_id: string; uid: string }
  | { type: "user_left"; room_id: string; uid: string }
  | { type: "point_round_started"; room_id: string; round_id: string }
  | {
      type: "point_submitted";
      room_id: string;
      round_id: string;
      uid: string;
      value?: number;
    }
  | {
      type: "point_final_table";
      room_id: string;
      round_id: string;
      table: Record<string, number>;
    }
  | { type: "point_approved"; room_id: string; round_id: string; uid: string }
  | {
      type: "point_round_cancelled";
      room_id: string;
      round_id: string;
      reason: string;
    }
  | { type: string; [key: string]: any };

interface PresenceContextValue {
  wsReady: boolean;
  send: (evt: object) => void;
  onlineUsers: Record<string, Set<string>>; // room_id → set of uids
  emit: (evt: Event) => void;
  // hooks for pages:
  enterRoom: (room_id: string) => void;
  leaveRoom: (room_id: string) => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

export const PresenceProvider = ({ children }: PropsWithChildren) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, Set<string>>>(
    {},
  );

  // initialize token
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  // open single WS
  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL}/ws?token=${token}`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] opened");
      setWsReady(true);
    };

    ws.onmessage = (e) => {
      let ev: Event;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      emit(ev);
    };

    ws.onclose = () => {
      console.log("[WS] closed, retry in 3s");
      setWsReady(false);
      setTimeout(() => setToken(token), 3000); // reconnect
    };

    return () => {
      ws.close();
    };
  }, [token]);

  // broadcast incoming events to state
  const emit = (ev: Event) => {
    switch (ev.type) {
      case "user_entered":
        setOnlineUsers((prev) => {
          const byRoom = { ...prev };
          if (!byRoom[ev.room_id]) byRoom[ev.room_id] = new Set();
          byRoom[ev.room_id].add(ev.uid);
          return byRoom;
        });
        break;
      case "user_left":
        setOnlineUsers((prev) => {
          const byRoom = { ...prev };
          byRoom[ev.room_id]?.delete(ev.uid);
          return byRoom;
        });
        break;
      // ここに point_* や settle_* のグローバルな副作用を追加できます
      default:
        break;
    }
    // もし各ページで補足したいなら Context の外で onmessage をフックするか
  };

  const send = (evt: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(evt));
    }
  };

  const enterRoom = (room_id: string) => {
    send({ type: "enter_room", room_id });
    // 取得したい初回オンライン一覧を API からフェッチ
    api.getPresence(token!, room_id).then((list) => {
      setOnlineUsers((prev) => ({
        ...prev,
        [room_id]: new Set(list),
      }));
    });
  };

  const leaveRoom = (room_id: string) => {
    send({ type: "leave_room", room_id });
    setOnlineUsers((prev) => {
      const byRoom = { ...prev };
      delete byRoom[room_id];
      return byRoom;
    });
  };

  return (
    <PresenceContext.Provider
      value={{ wsReady, send, onlineUsers, emit, enterRoom, leaveRoom }}
    >
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresence = (): PresenceContextValue => {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used within PresenceProvider");
  return ctx;
};
