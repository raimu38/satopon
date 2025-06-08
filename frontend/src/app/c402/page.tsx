// app/c402/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as api from "@/lib/api";
import { usePresence } from "@/context/PresenceContext";

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [allRooms, setAllRooms] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [newRoom, setNewRoom] = useState({ name: "", color_id: 1 });

  const {
    wsReady,
    subscribePresence,
    unsubscribePresence,
    onlineUsers,
    onEvent,
  } = usePresence();

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

  // app/c402/page.tsx
  useEffect(() => {
    const off = onEvent((ev) => {
      switch (ev.type) {
        // ダッシュボードでリアルタイムに反映したいイベント一覧
        case "user_entered":
        case "user_left":
        case "join_request":
        case "join_request_cancelled":
        case "join_approved":
          // msg 更新で useEffect([msg]) をトリガー
          setMsg((m) => m + "x");
          break;
        // もし他の通知も拾いたいならここに追加
        default:
          break;
      }
    });
    return off;
  }, [onEvent]);
  // 3. 自分の参加ルーム一覧取得
  useEffect(() => {
    if (!token) return;
    api.listRooms(token).then(setRooms);
  }, [token, msg]);

  // 4. 全ルーム一覧取得（参加申請用）
  useEffect(() => {
    if (!token) return;
    api.getAllRooms(token).then(setAllRooms);
  }, [token, msg]);

  // 5. rooms の変化に合わせて presence を subscribe/unsubscribe
  useEffect(() => {
    rooms.forEach((r) => subscribePresence(r.room_id));
    return () => {
      rooms.forEach((r) => unsubscribePresence(r.room_id));
    };
  }, [rooms, subscribePresence, unsubscribePresence]);

  if (!token || !me)
    return <p className="text-center mt-20 text-gray-400">Loading…</p>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="flex justify-between items-center p-6 border-b border-gray-700">
        <h1 className="text-2xl font-bold">
          Welcome, {me.display_name}
          {!wsReady && (
            <span className="ml-2 text-sm text-yellow-400 animate-pulse">
              Connecting…
            </span>
          )}
        </h1>
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
                if (!newRoom.name) {
                  alert("ルーム名を入力してください");
                  return;
                }
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
            {rooms.map((r) => {
              const count = onlineUsers[r.room_id]?.size ?? 0;
              return (
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
                  <div className="flex items-center gap-1">
                    {count > 0 && (
                      <span
                        className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"
                        title={`${count} online`}
                      />
                    )}
                    <span className="text-gray-400 text-sm">{count}</span>
                  </div>
                </Link>
              );
            })}
            {rooms.length === 0 && (
              <p className="text-gray-500">まだ参加中のルームはありません。</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
