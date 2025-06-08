// app/rooms/[roomId]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as api from "@/lib/api";
import { usePresence } from "@/context/PresenceContext";
import styles from "./RoomPage.module.css";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  // --- state 定義 ---
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [pointHistory, setPointHistory] = useState<any[]>([]);
  const [settleHistory, setSettleHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [myBalance, setMyBalance] = useState<number>(0);

  // メンバーのバランス
  const [balances, setBalances] = useState<Record<string, number>>({});

  // ポイントラウンド用 state
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [submittedBy, setSubmittedBy] = useState<Set<string>>(new Set());
  const [submissions, setSubmissions] = useState<Record<string, number>>({});
  const [finalTable, setFinalTable] = useState<Record<string, number> | null>(
    null,
  );
  const [approvedBy, setApprovedBy] = useState<Set<string>>(new Set());

  // 精算リクエスト用 state
  const [pendingReq, setPendingReq] = useState<{
    from_uid: string;
    amount: number;
  } | null>(null);
  const [settleInput, setSettleInput] = useState({ to_uid: "", amount: 0 });

  const [showPointModal, setShowPointModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const {
    wsReady,
    enterRoom,
    leaveRoom,
    onlineUsers: ctxOnlineUsers,
    onEvent,
  } = usePresence();

  // supabase セッション取得
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  // me 取得
  useEffect(() => {
    if (!token) return;
    api
      .getMe(token)
      .then(setMe)
      .catch(() => router.replace("/"));
  }, [token, router]);

  // roomData & histories 初期取得
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
      } catch {
        alert("データの取得に失敗しました。");
      }
    })();
  }, [token, roomId, msg]);

  // 入退室管理
  useEffect(() => {
    if (!wsReady || !roomId) return;
    enterRoom(roomId);
    return () => leaveRoom(roomId);
  }, [wsReady, roomId, enterRoom, leaveRoom]);

  // balance 計算
  useEffect(() => {
    const bal: Record<string, number> = {};
    room?.members.forEach((m: any) => {
      bal[m.uid] = 0;
    });
    pointHistory.forEach((rec) => {
      rec.points.forEach((p: any) => {
        bal[p.uid] = (bal[p.uid] || 0) + p.value;
      });
    });
    setBalances(bal);
    if (me) setMyBalance(bal[me.uid] ?? 0);
  }, [pointHistory, room, me]);

  // WebSocket イベント: me が取れてから登録
  useEffect(() => {
    if (!me) return;
    const off = onEvent((ev) => {
      if (ev.room_id !== roomId) return;
      switch (ev.type) {
        // ポイントラウンド
        case "point_round_started":
          setIsRoundActive(true);
          setCurrentRoundId(ev.round_id);
          setSubmittedBy(new Set());
          setSubmissions({});
          setFinalTable(null);
          setApprovedBy(new Set());
          break;
        case "point_submitted":
          setSubmittedBy((s) => new Set(s).add(ev.uid));
          setSubmissions((s) => ({ ...s, [ev.uid]: ev.value }));
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
          setSubmittedBy(new Set());
          setSubmissions({});
          break;

        // 精算リクエスト
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

        // その他の変更はリロードトリガー
        default:
          setMsg((m) => m + "x");
      }
    });
    return off;
  }, [onEvent, me, roomId]);

  // ローディング / エラーハンドリング
  if (!token || !me) return <p className="text-center mt-20">Loading…</p>;
  if (!room)
    return <p className="text-center mt-20 text-red-400">Room not found.</p>;

  // 退出 / 削除
  const handleLeaveRoom = async () => {
    try {
      await api.leaveRoom(token, roomId);
      router.replace("/c402");
    } catch (err: any) {
      setErrorMessage(err.message || "退出に失敗しました。");
    }
  };
  const handleDeleteRoom = async () => {
    try {
      await api.deleteRoom(token, roomId);
      router.replace("/c402");
    } catch (err: any) {
      setErrorMessage(err.message || "ルーム削除に失敗しました。");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100 flex flex-col">
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-6 py-4 backdrop-blur-lg bg-gray-900/60 border-b border-gray-700/40">
        <button
          onClick={() => router.push("/c402")}
          className="p-2 hover:bg-gray-800/50 rounded"
        >
          <span className="material-symbols-outlined text-white text-2xl">
            arrow_back
          </span>
        </button>
        <h1 className="text-xl font-semibold">{room.name}</h1>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="p-2 hover:bg-gray-800/50 rounded"
        >
          <span className="material-symbols-outlined text-white text-2xl">
            settings
          </span>
        </button>
      </header>

      {/* メイン */}
      <main className="flex-grow overflow-auto px-6 py-8">
        {/* 自分のアイコン＆ポイント */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-28 h-28 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 overflow-hidden border-4 border-gray-700 flex items-center justify-center">
            {me.icon_url ? (
              <img
                src={me.icon_url}
                className="w-full h-full object-cover rounded-full"
                alt="Your avatar"
              />
            ) : (
              <span className="text-5xl text-white font-bold">
                {me.display_name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div
            className={`mt-2 text-lg font-bold ${myBalance === 0 ? "text-white" : myBalance > 0 ? "text-yellow-500" : "text-red-400"}`}
          >
            {myBalance} sato
          </div>
        </div>

        {/* 機能ボタン */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => setShowSettleModal(true)}
            className="bg-gray-800 p-4 rounded flex flex-col items-center"
          >
            <span className="material-symbols-outlined text-purple-400 text-2xl">
              payments
            </span>
            <span className="mt-1">Settle</span>
          </button>
          <button
            onClick={() => setShowHistoryModal(true)}
            className="bg-gray-800 p-4 rounded flex flex-col items-center"
          >
            <span className="material-symbols-outlined text-gray-400 text-2xl">
              history
            </span>
            <span className="mt-1">History</span>
          </button>
          <button
            onClick={() => setShowPointModal(true)}
            className="bg-gray-800 p-4 rounded flex flex-col items-center"
          >
            <span className="material-symbols-outlined text-indigo-400 text-2xl">
              leaderboard
            </span>
            <span className="mt-1">{isRoundActive ? "Active" : "Round"}</span>
          </button>
        </div>

        {/* メンバー一覧 */}
        <section>
          <h2 className="text-white mb-2">Members & Balances</h2>
          <div className="flex flex-wrap gap-3">
            {room.members.map((m: any) => {
              const online = ctxOnlineUsers[roomId]?.has(m.uid);
              const bal = balances[m.uid] || 0;
              return (
                <button
                  key={m.uid}
                  onClick={() => setSelectedMember(m)}
                  className={`flex flex-col items-center w-16 p-2 rounded ${online ? "bg-green-600" : "bg-gray-700"} hover:scale-105 transition`}
                >
                  <span className="text-lg font-bold">
                    {m.uid.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm">{bal}pt</span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {/* ——— 以下、モーダル類 ——— */}

      {/* ポイントラウンドモーダル */}
      {showPointModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50">
          <div className="w-full max-w-md bg-gray-800/60 backdrop-blur-xl rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Point Round</h2>
              <button
                onClick={() => setShowPointModal(false)}
                className="p-2 hover:bg-gray-700 rounded-full"
              >
                <span className="material-symbols-outlined text-white">
                  close
                </span>
              </button>
            </div>
            {!isRoundActive && !finalTable && (
              <button
                onClick={() => api.startPointRound(token!, roomId!)}
                className="w-full py-2 bg-blue-600 rounded"
              >
                Start Round
              </button>
            )}
            {isRoundActive && (
              <div className="space-y-2">
                <p className="text-gray-300">Submitting…</p>
                {room.members.map((m: any) => (
                  <div key={m.uid} className="flex justify-between">
                    <span className="text-white">{m.uid}</span>
                    {submittedBy.has(m.uid) ? (
                      <span className="text-green-400">
                        Done ({submissions[m.uid]}pt)
                      </span>
                    ) : m.uid === me.uid ? (
                      <button
                        onClick={async () => {
                          const v = prompt("Score?", "0");
                          if (v === null) {
                            await api.cancelPointRound(token!, roomId!, {
                              reason: "User cancel",
                            });
                            return;
                          }
                          const num = Number(v);
                          if (!isNaN(num)) {
                            await api.submitPoint(token!, roomId!, me.uid, num);
                          }
                        }}
                        className="px-3 py-1 bg-green-600 rounded"
                      >
                        Submit
                      </button>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </div>
                ))}
                {submittedBy.size === room.members.length && (
                  <button
                    onClick={() => api.finalizePointRound(token!, roomId!)}
                    className="w-full py-2 bg-indigo-600 rounded"
                  >
                    Finalize
                  </button>
                )}
              </div>
            )}
            {finalTable && (
              <div className="mt-4 space-y-2">
                <h3 className="text-white font-medium">Results</h3>
                {Object.entries(finalTable).map(([uid, v]) => (
                  <div key={uid} className="flex justify-between text-gray-200">
                    <span>{uid}</span>
                    <span>{v}pt</span>
                  </div>
                ))}
                <h4 className="mt-3 text-white font-medium">Approvals</h4>
                {room.members.map((m: any) => (
                  <div
                    key={m.uid}
                    className="flex justify-between items-center"
                  >
                    <span className="text-gray-200">{m.uid}</span>
                    {approvedBy.has(m.uid) ? (
                      <span className="text-green-400">OK</span>
                    ) : m.uid === me.uid ? (
                      <button
                        onClick={() =>
                          api.approvePoint(token!, roomId!, currentRoundId!)
                        }
                        className="px-2 py-1 bg-indigo-600 rounded"
                      >
                        Approve
                      </button>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 履歴モーダル */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50">
          <div className="w-full max-w-lg bg-gray-800/60 backdrop-blur-xl rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Point History</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 hover:bg-gray-700 rounded-full"
              >
                <span className="material-symbols-outlined text-white">
                  close
                </span>
              </button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {pointHistory.length === 0 ? (
                <p className="text-gray-400">No history.</p>
              ) : (
                pointHistory.map((rec) => (
                  <div
                    key={rec.round_id}
                    className="bg-gray-700/40 p-3 rounded-lg"
                  >
                    <div className="flex justify-between text-gray-200">
                      <span>#{rec.round_id}</span>
                      <span className="text-sm">
                        {new Date(rec.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-gray-300">
                      {rec.points.map((p: any) => (
                        <div key={p.uid} className="flex justify-between">
                          <span>{p.uid}</span>
                          <span>{p.value}pt</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 精算モーダル */}
      {showSettleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
            <h2 className="text-white mb-4">Settlement</h2>
            <div className="flex flex-wrap gap-3 mb-4">
              {room.members
                .filter((m: any) => m.uid !== me.uid)
                .map((m: any) => {
                  const isSel = settleInput.to_uid === m.uid;
                  return (
                    <button
                      key={m.uid}
                      onClick={() =>
                        setSettleInput((s) => ({ ...s, to_uid: m.uid }))
                      }
                      className={`w-12 h-12 flex flex-col items-center justify-center rounded-full ${isSel ? "ring-2 ring-purple-400 bg-purple-600" : "bg-gray-700"}`}
                    >
                      <span className="font-semibold">{m.uid.charAt(0)}</span>
                      <span className="text-xs">{balances[m.uid] || 0}pt</span>
                    </button>
                  );
                })}
            </div>
            {settleInput.to_uid && (
              <p className="text-gray-300 mb-2">
                送金可能上限:{" "}
                {Math.min(
                  Math.max(0, -balances[me.uid] || 0),
                  balances[settleInput.to_uid] || 0,
                )}{" "}
                円
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="number"
                value={settleInput.amount}
                onChange={(e) =>
                  setSettleInput((s) => ({
                    ...s,
                    amount: Number(e.target.value),
                  }))
                }
                placeholder="金額"
                className="flex-1 p-2 bg-gray-700 rounded text-center"
              />
              <button
                onClick={async () => {
                  if (!settleInput.to_uid || settleInput.amount <= 0) {
                    alert("相手と金額を正しく入力してください");
                    return;
                  }
                  const maxPay = Math.min(
                    Math.max(0, -balances[me.uid] || 0),
                    balances[settleInput.to_uid] || 0,
                  );
                  if (settleInput.amount > maxPay) {
                    alert(`最大送金可能額は ${maxPay} 円です`);
                    return;
                  }
                  await api.requestSettlement(
                    token!,
                    roomId!,
                    settleInput.to_uid,
                    settleInput.amount,
                  );
                  setSettleInput({ to_uid: "", amount: 0 });
                  setShowSettleModal(false);
                }}
                className="px-4 py-2 bg-purple-600 rounded"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* メンバーディテールモーダル */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-2xl max-w-sm w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white text-lg font-semibold">
                {selectedMember.uid}
              </h3>
              <button
                onClick={() => setSelectedMember(null)}
                className="p-2 hover:bg-gray-700 rounded-full"
              >
                <span className="material-symbols-outlined text-white">
                  close
                </span>
              </button>
            </div>
            <p className="text-gray-300">
              参加日時: {new Date(selectedMember.joined_at).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Room Settings モーダル */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50">
          <div className="w-full max-w-md bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Room Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-700 rounded-full"
              >
                <span className="material-symbols-outlined text-white text-xl">
                  close
                </span>
              </button>
            </div>
            <div className="text-white space-y-4">
              <div>
                <h3 className="text-sm text-gray-400">Room Name</h3>
                <p className="text-lg">{room.name}</p>
              </div>
              <div>
                <h3 className="text-sm text-gray-400">Description</h3>
                <p className="text-base">{room.description || "なし"}</p>
              </div>
              <div className="pt-4">
                {room.created_by === me.uid ? (
                  <button
                    onClick={handleDeleteRoom}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-full text-white font-semibold"
                  >
                    Delete Room
                  </button>
                ) : (
                  <button
                    onClick={handleLeaveRoom}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-full text-white font-semibold"
                  >
                    Leave Room
                  </button>
                )}
              </div>
              {errorMessage && (
                <p className="text-red-400 text-sm text-center mt-2">
                  {errorMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 精算リクエスト承認モーダル */}
      {pendingReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-xl">
            <p className="text-white mb-4">
              {pendingReq.from_uid} さんから{" "}
              <span className="text-yellow-400">{pendingReq.amount} 円</span>{" "}
              の精算リクエスト
            </p>
            <div className="flex gap-4">
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
    </div>
  );
}
