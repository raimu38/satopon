// app/rooms/[roomId]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import * as api from "@/lib/api";
import { usePresence } from "@/context/PresenceContext";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [pointHistory, setPointHistory] = useState<any[]>([]);
  const [settleHistory, setSettleHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [myBalance, setMyBalance] = useState<number>(0);
  // ポイントラウンド用 state
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [submittedBy, setSubmittedBy] = useState<Set<string>>(new Set());
  const [submissions, setSubmissions] = useState<Record<string, number>>({});
  const [finalTable, setFinalTable] = useState<Record<string, number> | null>(
    null,
  );
  const [approvedBy, setApprovedBy] = useState<Set<string>>(new Set());

  const [settleInput, setSettleInput] = useState({ to_uid: "", amount: 0 });
  // presence は context で管理
  const {
    wsReady,
    enterRoom,
    leaveRoom,
    subscribePresence,
    unsubscribePresence,
    onlineUsers: ctxOnlineUsers,
    onEvent,
  } = usePresence();

  const [pendingReq, setPendingReq] = useState<{
    from_uid: string;
    amount: number;
  } | null>(null);

  // presence / point-round / 基本 fetch (省略)
  // 5. WebSocket イベントで精算リクエストを受け取る
  //    → me が取れてから登録するようにガードを追加
  useEffect(() => {
    if (!me) return; // ← ここを追加
    const off = onEvent((ev) => {
      console.log("★WS イベント受信★", ev, "me.uid=", me.uid);
      if (ev.room_id !== roomId) return;
      switch (ev.type) {
        case "settle_requested":
          if (ev.to_uid === me.uid) {
            setPendingReq({ from_uid: ev.from_uid, amount: ev.amount });
          }
          break;
        case "settle_rejected":
          if (ev.to_uid === me.uid) {
            alert(`${ev.from_uid} さんに拒否されました`);
          }
          break;
        case "settle_completed":
          setMsg((m) => m + "x");
          break;
      }
    });
    return off;
  }, [onEvent, me, roomId]);
  // 1. トークン＆ユーザー取得
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => {
    if (!me) return; // ← me が null のときは何もしない
    const total = pointHistory.reduce((sum, rec) => {
      const entry = rec.points.find((p: any) => p.uid === me.uid);
      return sum + (entry?.value || 0);
    }, 0);
    setMyBalance(total);
  }, [pointHistory, me]);

  useEffect(() => {
    if (!token) return;
    api
      .getMe(token)
      .then(setMe)
      .catch(() => router.replace("/"));
  }, [token, router]);
  // 3. roomData と history の初期取得だけ
  useEffect(() => {
    if (!token || !roomId) return;
    (async () => {
      try {
        const [roomData, ph, sh] = await Promise.all([
          api.getRoom(token, roomId),
          api.getPointHistory(token, roomId),
          api.getSettlementHistory(token, roomId),
        ]);
        setRoom(roomData);
        setPointHistory(ph);
        setSettleHistory(sh);
      } catch (err: any) {
        console.error("fetchAll error:", err);
        alert("データの取得に失敗しました。");
      }
    })();
  }, [token, roomId, msg]);

  // 3. PresenceContext を使って入退室管理
  useEffect(() => {
    if (!wsReady || !roomId) return;
    enterRoom(roomId);
    return () => {
      leaveRoom(roomId);
    };
  }, [wsReady, roomId, enterRoom, leaveRoom]);

  // 4. ポイント・精算イベントのみ拾う
  useEffect(() => {
    if (!roomId) return;
    const off = onEvent((ev) => {
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
          break;
        default:
          // join_request, join_approved, settle_approved などは再フェッチ
          setMsg((m) => m + "x");
      }
    });
    return off;
  }, [onEvent, roomId]);

  if (!token || !me) {
    return <p className="text-center mt-20 text-gray-400">Loading…</p>;
  }
  if (!room) {
    return <p className="text-center mt-20 text-red-400">Room not found.</p>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="flex items-center justify-between p-6 border-b border-gray-700">
        <div>
          <h1 className="text-2xl font-bold">{room.name}</h1>
          <p className="text-gray-400 mt-1">
            あなたのポイント:{" "}
            <span className="text-yellow-300 font-semibold">{myBalance}pt</span>
          </p>
        </div>
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
              // PresenceContext 側の onlineUsers で判定
              const isOnline = ctxOnlineUsers[roomId]?.has(m.uid) ?? false;
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
          {!isRoundActive && !finalTable && (
            <button
              onClick={() => api.startPointRound(token, roomId)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
            >
              ラウンド開始
            </button>
          )}
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
                        const v = prompt("スコアを入力してください", "0");
                        if (v === null) {
                          await api.cancelPointRound(token, roomId, {
                            reason: "ユーザーキャンセル",
                          });
                          return;
                        }
                        const num = Number(v);
                        if (!isNaN(num)) {
                          await api.submitPoint(token, roomId, me.uid, num);
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
              {submittedBy.size === room.members.length && (
                <button
                  onClick={() => api.finalizePointRound(token, roomId)}
                  className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded"
                >
                  集計する
                </button>
              )}
            </div>
          )}
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
                      m.uid === me.uid && (
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
        {/* 承認モーダル */}
        {pendingReq && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-gray-800 p-6 rounded">
              <p className="mb-4 text-white">
                {pendingReq.from_uid} さんから {pendingReq.amount}円
                の精算リクエストがあります。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await api.approveSettlementRequest(
                      token!,
                      roomId!,
                      pendingReq.from_uid,
                    );
                    setPendingReq(null);
                  }}
                  className="px-4 py-2 bg-green-600 rounded"
                >
                  承認
                </button>
                <button
                  onClick={async () => {
                    await api.rejectSettlementRequest(
                      token!,
                      roomId!,
                      pendingReq.from_uid,
                    );
                    setPendingReq(null);
                  }}
                  className="px-4 py-2 bg-red-600 rounded"
                >
                  拒否
                </button>
              </div>
            </div>
          </div>
        )}
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
                // リクエスト送信API
                await api.requestSettlement(
                  token!,
                  roomId!,
                  settleInput.to_uid,
                  settleInput.amount,
                );
                setSettleInput({ to_uid: "", amount: 0 });
              }}
              className="px-4 py-2 bg-purple-600 rounded"
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
