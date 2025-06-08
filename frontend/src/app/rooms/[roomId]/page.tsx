// app/rooms/[roomId]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as api from "@/lib/api";
import { usePresence } from "@/context/PresenceContext";
import styles from "./RoomPage.module.css";

type PendingRequest =
  | { type: "join"; from_uid: string }
  | { type: "settle"; from_uid: string; amount: number };

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

  const [showApprovalSuccess, setShowApprovalSuccess] = useState(false);
  const [historyType, setHistoryType] = useState<"PON" | "SATO">("PON");
  // メンバーのバランス
  const [balances, setBalances] = useState<Record<string, number>>({});

  // 1. state 定義部に joinReq を追加
  const [joinReq, setJoinReq] = useState<{ from_uid: string } | null>(null);
  // ポイントラウンド用 state
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [submittedBy, setSubmittedBy] = useState<Set<string>>(new Set());
  const [submissions, setSubmissions] = useState<Record<string, number>>({});
  const [finalTable, setFinalTable] = useState<Record<string, number> | null>(
    null,
  );
  const [approvedBy, setApprovedBy] = useState<Set<string>>(new Set());
  const filteredHistory = pointHistory.filter((rec) =>
    rec.round_id.startsWith(historyType),
  );
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

  useEffect(() => {
    if (finalTable && room && approvedBy.size === room.members.length) {
      setShowApprovalSuccess(true);
      const timeout = setTimeout(() => {
        setShowApprovalSuccess(false);
        setShowPointModal(false);
      }, 1500); // 1.5秒で閉じる

      return () => clearTimeout(timeout);
    }
  }, [approvedBy.size, finalTable, room]);
  // WebSocket イベント: me が取れてから登録
  useEffect(() => {
    if (!me) return;
    const off = onEvent((ev) => {
      if (ev.room_id !== roomId) return;
      switch (ev.type) {
        // 参加申請
        case "join_request":
          console.log("ev:", ev);
          setJoinReq({ from_uid: ev.applicant_uid });
          break;

        // 申請が承認・拒否された場合はモーダルを閉じる
        case "join_approved":
        case "join_rejected":
          setJoinReq(null);
          break;
        // ポイントラウンド
        // ラウンド開始通知
        case "point_round_started":
          // 既存の状態セットに加えて、
          // アラートやトーストでユーザーに「ラウンド開始！」を通知
          alert("ポイントラウンドが開始されました！");
          // あとは既存の初期化処理
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
          <div className="w-full max-w-md bg-gray-800/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-700 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              {/* タイトル＋アイコン */}
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-yellow-400 text-2xl">
                  stars
                </span>
                <h2 className="text-xl font-bold text-white tracking-wide">
                  PON
                </h2>
              </div>

              {/* 閉じるボタン */}
              <button
                onClick={() => setShowPointModal(false)}
                className="w-8 h-8 flex items-center justify-center hover:bg-gray-700/50 rounded-full transition"
              >
                <span className="material-symbols-outlined text-white text-base">
                  close
                </span>
              </button>
            </div>
            {!isRoundActive &&
              !finalTable &&
              (room.members.length >= 2 ? (
                <button
                  onClick={() => api.startPointRound(token!, roomId!)}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md transition duration-200"
                >
                  Start
                </button>
              ) : (
                <button
                  disabled
                  className="w-full py-2.5 rounded-lg bg-blue-600/30 text-gray-400 font-semibold shadow-inner cursor-not-allowed"
                  title="2人以上のメンバーが必要です"
                >
                  Start Round
                </button>
              ))}
            {isRoundActive && (
              <div className="space-y-4">
                {/* プログレス表示 */}
                <div>
                  <p className="text-sm text-gray-300 mb-1">
                    {submittedBy.size} / {room.members.length}
                  </p>
                  <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{
                        width: `${
                          (submittedBy.size / room.members.length) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {/* 入力フォーム（自分用） */}
                {!submittedBy.has(me.uid) && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const value = Number(formData.get("point"));
                      if (!isNaN(value)) {
                        await api.submitPoint(token!, roomId!, me.uid, value);
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="number"
                      name="point"
                      placeholder=""
                      className="w-24 px-3 py-1 bg-gray-800 border border-gray-600 text-white rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-semibold"
                    >
                      <span className="material-symbols-outlined text-base">
                        send
                      </span>
                    </button>
                  </form>
                )}

                {/* Finalizeボタン（全員提出時のみ） */}
                {submittedBy.size === room.members.length && (
                  <button
                    onClick={() => api.finalizePointRound(token!, roomId!)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition"
                  >
                    Finalize Round
                  </button>
                )}
              </div>
            )}
            {finalTable && (
              <div className="mt-4 space-y-4">
                {/* 結果表示 */}
                <div>
                  <h3 className="text-white font-semibold text-lg mb-2">
                    Results
                  </h3>
                  <div className="space-y-1">
                    {Object.entries(finalTable)
                      .sort((a, b) => b[1] - a[1]) // スコア順にソート
                      .map(([uid, v], i) => (
                        <div
                          key={uid}
                          className={`flex justify-between items-center px-3 py-2 rounded-lg
            ${
              i === 0
                ? "bg-yellow-500/10 border border-yellow-500 text-yellow-300"
                : "bg-gray-700/40 text-gray-200"
            }`}
                        >
                          <span className="font-mono truncate max-w-[8rem]">
                            {uid}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {v}pt
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 承認状況プログレスバー */}
                <div className="space-y-2">
                  {/* プログレス表示 */}
                  <div>
                    <p className="text-sm text-gray-300 mb-1">
                      {approvedBy.size} / {room.members.length}
                    </p>
                    <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{
                          width: `${(approvedBy.size / room.members.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* 自分の承認ボタン（未承認時） */}
                  {!approvedBy.has(me.uid) && (
                    <button
                      onClick={() =>
                        api.approvePoint(token!, roomId!, currentRoundId!)
                      }
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition"
                    >
                      Approve
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showApprovalSuccess && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl z-50">
          <span className="material-symbols-outlined text-green-400 text-5xl mb-3 animate-pop">
            check_circle
          </span>
          <p className="text-white text-lg font-semibold">All Approved!</p>
        </div>
      )}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50">
          <div className="w-full max-w-lg bg-gray-900/80 border border-gray-700 shadow-2xl backdrop-blur-xl rounded-2xl p-6">
            {/* ヘッダー */}
            <div className="flex justify-start  items-center mb-4">
              <h2 className="text-xl font-bold text-white tracking-wide">
                History
              </h2>
            </div>

            {/* タブボタン */}
            <div className="flex justify-center space-x-4 mb-4">
              {["PON", "SATO"].map((type) => (
                <button
                  key={type}
                  onClick={() => setHistoryType(type as "PON" | "SATO")}
                  className={`px-5 py-1.5 rounded-full text-sm font-medium border transition-all duration-200
              ${
                historyType === type
                  ? "bg-white text-gray-900 shadow-md"
                  : "bg-transparent text-gray-400 border-gray-600 hover:bg-gray-700 hover:text-white"
              }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* 履歴表示 */}
            <div className="space-y-3 max-h-[20rem] overflow-y-auto min-h-[20rem] transition-all scrollbar-hide">
              {filteredHistory.length === 0 ? (
                <p className="text-gray-500 text-center pt-10">No history.</p>
              ) : (
                filteredHistory.map((rec) => {
                  // SATO: 送金形式（送信者→受信者）
                  if (historyType === "SATO") {
                    const sender = rec.points.find((p: any) => p.value > 0);
                    const receiver = rec.points.find((p: any) => p.value < 0);
                    const amount = Math.abs(
                      sender?.value || receiver?.value || 0,
                    );

                    return (
                      <div
                        key={rec.round_id}
                        className="bg-gray-800/60 border border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-mono text-blue-300">
                            {rec.round_id}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(rec.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-300 px-1">
                          <span className="truncate max-w-[8rem] text-green-400">
                            {sender?.uid || "???"}
                          </span>
                          <span className="mx-2 text-white text-base">→</span>
                          <span className="truncate max-w-[8rem] text-red-400 text-right">
                            {receiver?.uid || "???"}
                          </span>
                        </div>
                        <div className="text-center mt-2 text-white text-sm font-semibold">
                          {amount} sato
                        </div>
                      </div>
                    );
                  }

                  // PON: 勝ち負け形式
                  return (
                    <div
                      key={rec.round_id}
                      className="bg-gray-800/60 border border-gray-700 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-mono text-blue-300">
                          {rec.round_id}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(rec.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {rec.points.map((p: any) => (
                          <div
                            key={p.uid}
                            className="flex justify-between text-gray-300"
                          >
                            <span className="truncate max-w-[8rem]">
                              {p.uid}
                            </span>
                            <span
                              className={
                                p.value > 0
                                  ? "text-green-400 font-semibold"
                                  : "text-red-400 font-semibold"
                              }
                            >
                              {p.value > 0 ? "+" : ""}
                              {p.value}pt
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
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

      {/* ————— 参加申請モーダル ————— */}
      {joinReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-xl">
            <p className="text-white mb-4">
              {joinReq.from_uid} さんが参加を申請しています。
            </p>
            <div className="flex gap-4">
              <button
                onClick={async () => {
                  try {
                    await api.approveMember(token!, roomId!, joinReq.from_uid);
                  } catch (e) {
                    console.error("承認に失敗:", e);
                    alert("承認に失敗しました");
                  } finally {
                    setJoinReq(null);
                  }
                }}
                className="px-4 py-2 bg-green-600 rounded"
              >
                承認
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.rejectMember(token!, roomId!, joinReq.from_uid);
                  } catch (e) {
                    console.error("Reject failed:", e);
                  } finally {
                    setJoinReq(null); // 成功・失敗に関係なく閉じる
                  }
                }}
                className="px-4 py-2 bg-red-600 rounded"
              >
                拒否
              </button>
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
