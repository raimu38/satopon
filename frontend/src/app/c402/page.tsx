// app/c402/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as api from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [allRooms, setAllRooms] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [newRoom, setNewRoom] = useState({ name: "", color_id: 1 });
  const wsRef = useRef<WebSocket | null>(null);

  // 1. 認証トークン取得
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  // 2. ユーザー情報セットアップ
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const u = await api.getMe(token);
        setMe(u);
      } catch {
        const { data } = await supabase.auth.getUser();
        const user = data.user!;
        const u = await api.createUser(token, {
          display_name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email!.split("@")[0],
          email: user.email!,
          icon_url: user.user_metadata?.avatar_url ?? "",
        });
        setMe(u);
      }
    })();
  }, [token]);

  // 3. 自分の参加ルーム一覧
  useEffect(() => {
    if (!token) return;
    api.listRooms(token).then(setRooms);
  }, [token, msg]);

  // 4. 全ルーム一覧（参加申請用）
  useEffect(() => {
    if (!token) return;
    api.getAllRooms(token).then(setAllRooms);
  }, [token, msg]);

  // 5. WebSocket でサーバからの通知をキャッチ → msg トリガーで再レンダー
  useEffect(() => {
    if (!token) return;
    if (wsRef.current) wsRef.current.close();
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws"}?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = () => setMsg((m) => m + "x");
    wsRef.current = ws;
    return () => ws.close();
  }, [token]);

  if (!token || !me)
    return <p className="text-center mt-20 text-gray-400">Loading…</p>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="flex justify-between items-center p-6 border-b border-gray-700">
        <h1 className="text-2xl font-bold">Welcome, {me.display_name}</h1>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/");
          }}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition"
        >
          Logout
        </button>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-8">
        {/* 新規ルーム作成 */}
        <section className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">新規ルーム作成</h2>
          <div className="flex gap-2">
            <input
              placeholder="ルーム名"
              value={newRoom.name}
              onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
              className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded"
            />
            <input
              type="number"
              min={1}
              max={12}
              value={newRoom.color_id}
              onChange={(e) =>
                setNewRoom({ ...newRoom, color_id: Number(e.target.value) })
              }
              className="w-20 p-2 bg-gray-700 border border-gray-600 rounded"
            />
            <button
              onClick={async () => {
                if (!newRoom.name) return alert("ルーム名を入力してください");
                await api.createRoom(token, newRoom);
                setNewRoom({ name: "", color_id: 1 });
                setMsg("new-room");
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition"
            >
              作成
            </button>
          </div>
        </section>

        {/* 参加可能ルーム */}
        <section>
          <h2 className="text-xl font-semibold mb-3">参加可能なルーム</h2>
          <div className="space-y-2">
            {allRooms
              .filter((r) => !rooms.some((x) => x.room_id === r.room_id))
              .map((r) => {
                const pending = r.pending_members?.some(
                  (m: any) => m.uid === me.uid,
                );
                return (
                  <div
                    key={r.room_id}
                    className="flex justify-between items-center p-3 bg-gray-800 rounded"
                  >
                    <div>
                      <strong>{r.name}</strong>{" "}
                      <span className="text-gray-400">({r.room_id})</span>
                    </div>
                    {pending ? (
                      <button
                        onClick={async () => {
                          await api.cancelJoinRequest(token, r.room_id);
                          setMsg("cancel-req");
                        }}
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded"
                      >
                        申請キャンセル
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          await api.joinRoom(token, r.room_id);
                          setMsg("join-req");
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded"
                      >
                        参加申請
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </section>

        {/* あなたのルーム一覧 */}
        <section>
          <h2 className="text-xl font-semibold mb-3">あなたのルーム</h2>
          <div className="space-y-2">
            {rooms.map((r) => (
              <Link
                key={r.room_id}
                href={`/rooms/${r.room_id}`}
                className="flex justify-between items-center p-3 bg-gray-800 rounded hover:bg-gray-700 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">
                    {r.name}{" "}
                    <span className="text-gray-400">({r.room_id})</span>
                  </span>
                  {r.pending_members?.length > 0 && (
                    <span
                      title="参加申請があります"
                      className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"
                    />
                  )}
                </div>
              </Link>
            ))}
            {rooms.length === 0 && (
              <p className="text-gray-500">まだ参加中のルームはありません。</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
