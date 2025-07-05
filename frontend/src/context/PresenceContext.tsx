"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  PropsWithChildren,
} from "react";
import * as api from "@/lib/api";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

type Event =
  | { type: "user_entered"; room_id: string; uid: string }
  | { type: "user_left"; room_id: string; uid: string }
  | { type: string; [key: string]: any };

interface PresenceContextValue {
  wsReady: boolean;
  onlineUsers: Record<string, Set<string>>;
  subscribePresence: (room_id: string) => void;
  unsubscribePresence: (room_id: string) => void;
  enterRoom: (room_id: string) => void;
  leaveRoom: (room_id: string) => void;
  onEvent: (listener: (ev: Event) => void) => () => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

export const PresenceProvider = ({ children }: PropsWithChildren) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, Set<string>>>({});
  const subscribedRooms = useRef<Set<string>>(new Set());
  const enteredRooms = useRef<Set<string>>(new Set());
  const listeners = useRef<Set<(ev: Event) => void>>(new Set());

  /* ----------------------------- auth token ----------------------------- */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const idToken = await user.getIdToken(true);
        setToken(idToken);
      } else {
        setToken(null);
      }
    });

    return () => unsubscribe();
  }, []);

  /* ----------------------------- WebSocket ------------------------------ */
  useEffect(() => {
    if (!token) {
      wsRef.current?.close();
      setWsReady(false);
      return;
    }

    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL || "ws://10.225.246.225:8000/ws"}?token=${token}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setWsReady(true);
      enteredRooms.current.forEach((room_id) =>
        ws.send(JSON.stringify({ type: "enter_room", room_id }))
      );
    };

    ws.onmessage = (e) => {
      let ev: Event;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }

      if (ev.type === "user_entered") {
        setOnlineUsers((prev) => {
          const next = { ...prev };
          (next[ev.room_id] ??= new Set()).add(ev.uid);
          return next;
        });
      } else if (ev.type === "user_left") {
        setOnlineUsers((prev) => {
          const next = { ...prev };
          next[ev.room_id]?.delete(ev.uid);
          return next;
        });
      }

      listeners.current.forEach((fn) => fn(ev));
    };

    ws.onclose = () => {
      setWsReady(false);
    };

    return () => {
      ws.onclose = null;
      ws.close();
    };
  }, [token]);

  /* --------------------------- dashboard --------------------------- */
  const subscribePresence = useCallback(
    (room_id: string) => {
      if (!token || subscribedRooms.current.has(room_id)) return;
      subscribedRooms.current.add(room_id);
      api.getPresence(token, room_id).then((list) => {
        setOnlineUsers((prev) => ({ ...prev, [room_id]: new Set(list) }));
      });
    },
    [token]
  );

  const unsubscribePresence = useCallback((room_id: string) => {
    subscribedRooms.current.delete(room_id);
    setOnlineUsers((prev) => {
      const next = { ...prev };
      delete next[room_id];
      return next;
    });
  }, []);

  /* ---------------------------- room screen ----------------------------- */
  const enterRoom = useCallback(
    (room_id: string) => {
      if (!token || enteredRooms.current.has(room_id)) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "enter_room", room_id }));
      }
      enteredRooms.current.add(room_id);
      api.getPresence(token, room_id).then((list) => {
        setOnlineUsers((prev) => ({ ...prev, [room_id]: new Set(list) }));
      });
    },
    [token]
  );

  const leaveRoom = useCallback((room_id: string) => {
    if (enteredRooms.current.has(room_id)) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "leave_room", room_id }));
      }
      enteredRooms.current.delete(room_id);
    }
  }, []);

  /* ------------------------------ API ------------------------------- */
  const onEvent = useCallback((listener: (ev: Event) => void) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  return (
    <PresenceContext.Provider
      value={{
        wsReady,
        onlineUsers,
        subscribePresence,
        unsubscribePresence,
        enterRoom,
        leaveRoom,
        onEvent,
      }}
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

