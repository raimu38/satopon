// app/rooms/[roomId]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import * as api from "@/lib/api";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [pointHistory, setPointHistory] = useState<any[]>([]);
  const [settleHistory, setSettleHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  // ポイントラウンド用 state
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [submittedBy, setSubmittedBy] = useState<Set<string>>(new Set());
  const [submissions, setSubmissions] = useState<Record<string, number>>({});
  const [finalTable, setFinalTable] = useState<Record<string, number> | null>(
    null,
  );
  const [approvedBy, setApprovedBy] = useState<Set<string>>(new Set());

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  // 精算用 input
  const [settleInput, setSettleInput] = useState({ to_uid: "", amount: 0 });

  // 1. トークン＆ユーザー取得
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token ?? null;
      setToken(t);
    });
  }, []);
  useEffect(() => {
    if (!token) return;
    api
      .getMe(token)
      .then(setMe)
      .catch(() => router.replace("/"));
  }, [token]);

  // 2. ルーム＆履歴取得
  const fetchAll = () => {
    if (!token || !roomId) return;
    api.getRoom(token, roomId).then(setRoom);
    api.getPointHistory(token, roomId).then(setPointHistory);
    api.getSettlementHistory(token, roomId).then(setSettleHistory);
    api.getPresence(token, roomId).then((list: string[]) => {
      setOnlineUsers(new Set(list));
    });
  };
  useEffect(fetchAll, [token, roomId, msg]);

  // 3. WS でイベント受信
  useEffect(() => {
    if (!token || !roomId) return;
    if (wsRef.current) wsRef.current.close();
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws"}?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "enter_room", room_id: roomId }));
    };

    ws.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.room_id !== roomId) return;
      switch (ev.type) {
        case "point_round_started":
          setIsRoundActive(true);
          setCurrentRoundId(ev.round_id);
          setSubmittedBy(new Set());
          setSubmissions({});
          setFinalTable(null);
          setApprovedBy(new Set());
          break;
        case "point_submitted":
          setSubmissions((s) => ({ ...s, [ev.uid]: ev.value }));
          setSubmittedBy((s) => new Set(s).add(ev.uid));
          break;
        case "point_final_table":
          setIsRoundActive(false);
          setFinalTable(ev.table);
          break;
        case "point_approved":
          setApprovedBy((s) => new Set(s).add(ev.uid));
          break;
        case "point_round_cancelled":
          alert("ラウンド中止: " + ev.reason);
          setIsRoundActive(false);
          setSubmissions({});
          setSubmittedBy(new Set());
        case "user_entered":
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            next.add(ev.uid);
            return next;
          });
          break;
        case "user_left":
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            next.delete(ev.uid);
            return next;
          });
          break;
        default:
          // join events / settle approvals も trigger fetchAll
          setMsg((m) => m + "x");
      }
    };
    wsRef.current = ws;
    return () => {
      // 退室通知
      ws.send(JSON.stringify({ type: "leave_room", room_id: roomId }));
      ws.close();
    };
  }, [token, roomId]);

  if (!token || !me)
    return <p className="text-center mt-20 text-gray-400">Loading…</p>;
  if (!room)
    return <p className="text-center mt-20 text-red-400">Room not found.</p>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="flex items-center justify-between p-6 border-b border-gray-700">
        <h1 className="text-2xl font-bold">{room.name}</h1>
        <Link href="/c402" className="text-blue-400 hover:underline">
          ← ダッシュボードへ
        </Link>
      </header>
      <main className="max-w-3xl mx-auto p-6 space-y-8">
        {/* ルーム説明 */}
        {room.description && (
          <p className="text-gray-300">{room.description}</p>
        )}

        {/* メンバー一覧 & 退会 */}
        <section className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-2">メンバー</h2>
          <div className="flex flex-wrap gap-2">
            {room.members.map((m: any) => {
              const isOnline = onlineUsers.has(m.uid);
              return (
                <span
                  key={m.uid}
                  className={`
            px-3 py-1 rounded-full flex items-center gap-1
            ${m.uid === me.uid ? "bg-blue-600" : "bg-gray-700"}
            ${isOnline ? "ring-2 ring-green-400" : "opacity-60"}
          `}
                >
                  {m.uid}
                  {isOnline && (
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                  )}
                </span>
              );
            })}
          </div>
          <button
            onClick={async () => {
              await api.leaveRoom(token, roomId);
              router.replace("/c402");
            }}
            className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
          >
            退会する
          </button>
        </section>

        {/* 参加申請中メンバー承認/拒否 (オーナー用) */}
        {room.created_by === me.uid && room.pending_members.length > 0 && (
          <section className="bg-gray-800 p-4 rounded">
            <h2 className="font-semibold mb-2">参加申請中</h2>
            {room.pending_members.map((p: any) => (
              <div
                key={p.uid}
                className="flex justify-between items-center mb-2"
              >
                <span>{p.uid}</span>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await api.approveMember(token, roomId, p.uid);
                      setMsg("approved");
                    }}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded"
                  >
                    承認
                  </button>
                  <button
                    onClick={async () => {
                      await api.rejectMember(token, roomId, p.uid);
                      setMsg((m) => m + "-rejected");
                    }}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded"
                  >
                    拒否
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ポイントラウンド */}
        <section className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-3">ポイントラウンド</h2>

          {/* ラウンド開始ボタン：誰でもOK */}
          {!isRoundActive && !finalTable && (
            <button
              onClick={async () => {
                await api.startPointRound(token!, roomId!);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
            >
              ラウンド開始
            </button>
          )}

          {/* 参加者提出状況 */}
          {isRoundActive && (
            <div className="space-y-2">
              <p>提出状況:</p>
              {room.members.map((m: any) => (
                <div key={m.uid} className="flex justify-between">
                  <span>{m.uid}</span>
                  {submittedBy.has(m.uid) ? (
                    <span className="text-green-400">提出済</span>
                  ) : m.uid === me.uid ? (
                    <button
                      onClick={async () => {
                        // promptでキャンセルしたら中止API呼び出し
                        const v = prompt("スコアを入力してください", "0");
                        if (v === null) {
                          // キャンセル扱い
                          await api.cancelPointRound(token!, roomId!, {
                            reason: "ユーザーキャンセル",
                          });
                          return;
                        }
                        const num = Number(v);
                        if (!isNaN(num)) {
                          await api.submitPoint(token!, roomId!, me.uid, num);
                        }
                      }}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded"
                    >
                      提出
                    </button>
                  ) : (
                    <span className="text-gray-500">未提出</span>
                  )}
                </div>
              ))}

              {/* 集計 */}
              {submittedBy.size === room.members.length && (
                <button
                  onClick={() => api.finalizePointRound(token!, roomId!)}
                  className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded"
                >
                  集計する
                </button>
              )}
            </div>
          )}

          {/* 最終テーブル & 承認 */}
          {finalTable && (
            <div className="mt-4">
              <h3 className="font-medium mb-2">最終スコア表</h3>
              <div className="space-y-1">
                {Object.entries(finalTable).map(([uid, v]) => (
                  <div key={uid} className="flex justify-between">
                    <span>{uid}</span>
                    <span>{v}pt</span>
                  </div>
                ))}
              </div>
              <h4 className="mt-3 font-medium">承認状況</h4>
              <div className="space-y-1">
                {room.members.map((m: any) => (
                  <div key={m.uid} className="flex justify-between">
                    <span>{m.uid}</span>
                    {approvedBy.has(m.uid) ? (
                      <span className="text-green-400">承認済</span>
                    ) : (
                      me.uid === m.uid && (
                        <button
                          onClick={() =>
                            api.approvePoint(token, roomId, currentRoundId!)
                          }
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded"
                        >
                          承認
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ポイント履歴 */}
        <section className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-2">ポイント履歴</h2>
          {pointHistory.length === 0 ? (
            <p className="text-gray-400">まだありません。</p>
          ) : (
            pointHistory.map((rec) => (
              <div key={rec.round_id} className="mb-3 p-3 bg-gray-700 rounded">
                <div className="flex justify-between">
                  <span>#{rec.round_id}</span>
                  <span className="text-gray-400 text-sm">
                    {new Date(rec.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {rec.points.map((p: any) => (
                    <div key={p.uid} className="flex justify-between">
                      <span>{p.uid}</span>
                      <span>{p.value > 0 ? `+${p.value}` : p.value}pt</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* 精算 */}
        <section className="bg-gray-800 p-4 rounded">
          <h2 className="font-semibold mb-3">精算</h2>
          <div className="flex gap-2 mb-4">
            <select
              value={settleInput.to_uid}
              onChange={(e) =>
                setSettleInput((s) => ({ ...s, to_uid: e.target.value }))
              }
              className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded"
            >
              <option value="">--相手選択--</option>
              {room.members
                .filter((m: any) => m.uid !== me.uid)
                .map((m: any) => (
                  <option key={m.uid} value={m.uid}>
                    {m.uid}
                  </option>
                ))}
            </select>
            <input
              type="number"
              value={settleInput.amount}
              onChange={(e) =>
                setSettleInput((s) => ({
                  ...s,
                  amount: Number(e.target.value),
                }))
              }
              className="w-24 p-2 bg-gray-700 border border-gray-600 rounded"
            />
            <button
              onClick={async () => {
                await api.settle(
                  token,
                  roomId,
                  settleInput.to_uid,
                  settleInput.amount,
                );
                setMsg("settled");
                setSettleInput({ to_uid: "", amount: 0 });
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
            >
              リクエスト
            </button>
          </div>
          <h3 className="font-semibold mb-2">精算履歴</h3>
          {settleHistory.length === 0 ? (
            <p className="text-gray-400">まだありません。</p>
          ) : (
            settleHistory.map((s, i) => (
              <div
                key={i}
                className="flex justify-between items-center mb-2 p-3 bg-gray-700 rounded"
              >
                <span>
                  {s.from_uid} → {s.to_uid} : {s.amount}円 [
                  {s.approved ? "承認済" : "未承認"}]
                </span>
                {!s.approved && (
                  <button
                    onClick={async () => {
                      await api.approveSettlement(
                        token,
                        roomId,
                        s._id ?? s.settlement_id,
                      );
                      setMsg("approved-settle");
                    }}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded"
                  >
                    承認
                  </button>
                )}
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
