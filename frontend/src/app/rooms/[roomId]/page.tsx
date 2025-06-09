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

  const [amountInput, setAmountInput] = useState<string>("");
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

  // RoomPage コンポーネントの中で
  // 「自分以外にオンラインユーザーがいるか」を判定する

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
    if (me?.uid) setMyBalance(bal[me.uid] ?? 0);
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

  // ローディング / エラーハンドリング
  if (!token || !me) return <p className="text-center mt-20">Loading…</p>;

  // ここ以降なら me は必ず非 null
  const myUid = me.uid;
  const otherOnlineCount =
    (ctxOnlineUsers[roomId]?.size || 0) -
    (ctxOnlineUsers[roomId]?.has(myUid) ? 1 : 0);
  const hasOtherOnline = otherOnlineCount > 0;

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
          {/* Settle */}
          <button
            onClick={() => hasOtherOnline && setShowSettleModal(true)}
            disabled={!hasOtherOnline}
            className={`p-4 rounded flex flex-col items-center transition
      ${
        hasOtherOnline
          ? "bg-gray-800 hover:bg-gray-700 cursor-pointer"
          : "bg-gray-700/50 cursor-not-allowed opacity-50"
      }`}
          >
            <span className="material-symbols-outlined text-purple-400 text-2xl">
              payments
            </span>
            <span className="mt-1">Settle</span>
          </button>

          {/* History */}
          <button
            onClick={() => setShowHistoryModal(true)}
            className="bg-gray-800 p-4 rounded flex flex-col items-center"
          >
            <span className="material-symbols-outlined text-gray-400 text-2xl">
              history
            </span>
            <span className="mt-1">History</span>
          </button>

          {/* Round */}
          <button
            onClick={() => hasOtherOnline && setShowPointModal(true)}
            disabled={!hasOtherOnline}
            className={`p-4 rounded flex flex-col items-center transition
      ${
        hasOtherOnline
          ? "bg-gray-800 hover:bg-gray-700 cursor-pointer"
          : "bg-gray-700/50 cursor-not-allowed opacity-50"
      }`}
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
        <div className="fixed inset-0 bg-gradient-to-br from-black/60 via-black/50 to-purple-900/30 backdrop-blur-xl flex items-center justify-center z-50 animate-fade-in">
          <div className="w-full max-w-md bg-gradient-to-br from-gray-900/90 via-gray-800/80 to-gray-900/90 backdrop-blur-2xl rounded-3xl p-8 border border-gray-600/30 shadow-2xl transform animate-scale-up relative overflow-hidden">
            {/* 背景装飾 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-yellow-400/10 to-transparent rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-xl"></div>

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
                {/* タイトル＋アイコン */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="material-symbols-outlined text-white text-xl">
                      stars
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent tracking-wide">
                    PON
                  </h2>
                </div>

                {/* 閉じるボタン */}
                <button
                  onClick={() => setShowPointModal(false)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-gray-700/60 rounded-xl transition-all duration-200 hover:scale-105 group"
                >
                  <span className="material-symbols-outlined text-gray-400 group-hover:text-white text-lg transition-colors">
                    close
                  </span>
                </button>
              </div>

              {!isRoundActive &&
                !finalTable &&
                (hasOtherOnline ? (
                  <button
                    onClick={() => api.startPointRound(token!, roomId!)}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 hover:from-blue-500 hover:via-blue-600 hover:to-indigo-600 text-white font-semibold shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined">
                        play_arrow
                      </span>
                      Start Round
                    </span>
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      disabled
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-gray-700/50 to-gray-600/50 text-gray-400 font-semibold shadow-inner cursor-not-allowed relative overflow-hidden"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined opacity-50">
                          group
                        </span>
                        Start Round
                      </span>
                    </button>
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 bg-red-500/90 text-white text-xs px-3 py-1 rounded-full animate-pulse">
                      Need 2+ members
                    </div>
                  </div>
                ))}

              {isRoundActive && (
                <div className="space-y-6">
                  {/* プログレス表示 */}
                  <div className="bg-gray-800/40 rounded-2xl p-4 border border-gray-700/30">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm font-medium text-gray-300">
                        Progress
                      </p>
                      <p className="text-sm font-bold text-white tabular-nums">
                        {submittedBy.size} / {room.members.length}
                      </p>
                    </div>
                    <div className="w-full h-4 bg-gray-700/50 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700 ease-out rounded-full shadow-lg relative"
                        style={{
                          width: `${
                            (submittedBy.size / room.members.length) * 100
                          }%`,
                        }}
                      >
                        <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>
                      </div>
                    </div>
                  </div>

                  {/* 入力フォーム（自分用） */}
                  {!submittedBy.has(me.uid) && (
                    <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl p-5 border border-gray-600/30">
                      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-400">
                          edit
                        </span>
                        Your Estimate
                      </h3>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          const value = Number(formData.get("point"));
                          if (!isNaN(value)) {
                            await api.submitPoint(
                              token!,
                              roomId!,
                              me.uid,
                              value,
                            );
                          }
                        }}
                        className="flex items-center gap-3"
                      >
                        <div className="relative flex-1">
                          <input
                            type="number"
                            name="point"
                            placeholder="Enter points..."
                            className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                          />
                          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 focus-within:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
                        </div>
                        <button
                          type="submit"
                          className="flex items-center justify-center w-12 h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl group"
                        >
                          <span className="material-symbols-outlined text-lg group-hover:rotate-12 transition-transform">
                            send
                          </span>
                        </button>
                      </form>
                    </div>
                  )}

                  {/* 提出済み状態 */}
                  {submittedBy.has(me.uid) && (
                    <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
                        <span className="material-symbols-outlined text-white text-sm">
                          check
                        </span>
                      </div>
                      <span className="text-green-300 font-medium">
                        Submitted! Waiting for others...
                      </span>
                    </div>
                  )}

                  {/* Finalizeボタン（全員提出時のみ） */}
                  {submittedBy.size === room.members.length && (
                    <button
                      onClick={() => api.finalizePointRound(token!, roomId!)}
                      className="w-full py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:via-purple-500 hover:to-indigo-600 text-white rounded-2xl font-semibold transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-2xl relative overflow-hidden group animate-pulse"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <span className="relative flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined">grade</span>
                        Finalize Round
                      </span>
                    </button>
                  )}
                </div>
              )}

              {finalTable && (
                <div className="mt-6 space-y-6">
                  {/* 結果表示 */}
                  <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl p-5 border border-gray-600/30">
                    <h3 className="text-white font-bold text-xl mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-yellow-400">
                        trophy
                      </span>
                      Results
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(finalTable)
                        .sort((a, b) => b[1] - a[1]) // スコア順にソート
                        .map(([uid, v], i) => (
                          <div
                            key={uid}
                            className={`flex justify-between items-center px-4 py-3 rounded-xl transition-all duration-300 transform hover:scale-[1.01] relative overflow-hidden
              ${
                i === 0
                  ? "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-400/40 text-yellow-300 shadow-lg"
                  : i === 1
                    ? "bg-gradient-to-r from-gray-400/10 to-gray-500/10 border border-gray-400/30 text-gray-200"
                    : i === 2
                      ? "bg-gradient-to-r from-amber-600/10 to-orange-600/10 border border-amber-600/30 text-amber-200"
                      : "bg-gray-700/40 border border-gray-600/20 text-gray-300"
              }`}
                          >
                            {i === 0 && (
                              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-yellow-400/20 to-transparent rounded-full blur-xl"></div>
                            )}
                            <div className="flex items-center gap-3 relative z-10">
                              {i < 3 && (
                                <span className="material-symbols-outlined text-lg">
                                  {i === 0
                                    ? "trophy"
                                    : i === 1
                                      ? "military_tech"
                                      : "workspace_premium"}
                                </span>
                              )}
                              <span className="font-mono font-medium truncate max-w-[8rem]">
                                {uid}
                              </span>
                            </div>
                            <span className="font-bold tabular-nums text-lg relative z-10 flex items-center gap-1">
                              {v}
                              <span className="text-sm opacity-80">pt</span>
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* 承認状況プログレスバー */}
                  <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-2xl p-5 border border-indigo-500/20">
                    <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-400">
                        how_to_vote
                      </span>
                      Approval Status
                    </h4>

                    <div className="space-y-4">
                      {/* プログレス表示 */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium text-indigo-300">
                            Approved
                          </p>
                          <p className="text-sm font-bold text-white tabular-nums">
                            {approvedBy.size} / {room.members.length}
                          </p>
                        </div>
                        <div className="w-full h-4 bg-gray-700/50 rounded-full overflow-hidden shadow-inner">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700 ease-out rounded-full shadow-lg relative"
                            style={{
                              width: `${(approvedBy.size / room.members.length) * 100}%`,
                            }}
                          >
                            <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>
                          </div>
                        </div>
                      </div>

                      {/* 自分の承認ボタン（未承認時） */}
                      {!approvedBy.has(me.uid) && (
                        <button
                          onClick={() =>
                            api.approvePoint(token!, roomId!, currentRoundId!)
                          }
                          className="w-full py-4 bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:via-blue-500 hover:to-indigo-600 text-white rounded-xl font-semibold transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl relative overflow-hidden group"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          <span className="relative flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined">
                              thumb_up
                            </span>
                            Approve Results
                          </span>
                        </button>
                      )}

                      {/* 承認済み状態 */}
                      {approvedBy.has(me.uid) && (
                        <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-sm">
                              verified
                            </span>
                          </div>
                          <span className="text-green-300 font-medium">
                            You've approved these results
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showApprovalSuccess && (
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-green-900/20 to-black/80 backdrop-blur-lg flex flex-col items-center justify-center rounded-3xl z-50">
          <div className="relative">
            <div className="absolute inset-0 w-20 h-20 bg-green-400/30 rounded-full animate-ping"></div>
            <div className="relative w-16 h-16 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl">
              <span className="material-symbols-outlined text-white text-3xl animate-bounce">
                check_circle
              </span>
            </div>
          </div>
          <p className="text-white text-xl font-bold mt-4 animate-fade-in-up">
            All Approved!
          </p>
          <p
            className="text-green-300 text-sm mt-1 animate-fade-in-up"
            style={{ animationDelay: "0.2s" }}
          >
            Round completed successfully
          </p>
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
            <h2 className="text-white text-2xl font-semibold mb-4">SATO</h2>

            {/* 送金可能な相手だけをリスト */}
            <div className="flex flex-wrap gap-4 mb-4">
              {/*
          自分の残高がマイナスかつ相手の残高がプラスのときのみ表示
        */}
              {room.members
                .filter((m: any) => {
                  if (m.uid === me.uid) return false;
                  const theirBal = balances[m.uid] || 0;
                  // 自分の残高がマイナスで、相手に支払う余地がある場合
                  return myBalance < 0 && theirBal > 0;
                })
                .map((m: any) => {
                  // この相手へ送れる上限
                  const maxPay = Math.min(-myBalance, balances[m.uid]);
                  const isSel = settleInput.to_uid === m.uid;
                  return (
                    <button
                      key={m.uid}
                      onClick={
                        () => setSettleInput({ to_uid: m.uid, amount: 0 }) // maxPay を初期セットしない
                      }
                      className={`flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 ${
                        isSel
                          ? "border-purple-400 bg-purple-600"
                          : "border-gray-600 bg-gray-700"
                      } hover:scale-105 transition`}
                    >
                      {/* 大きなアイコン */}
                      <span className="text-2xl font-bold">
                        {m.uid.charAt(0)}
                      </span>
                      {/* この相手へ送れる最大額 */}
                      <span className="text-xs text-gray-200 mt-1">
                        {maxPay.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
            </div>
            {/*
        送金可能相手がいなければ案内文
      */}
            {room.members
              .filter((m: any) => m.uid !== me.uid)
              .every(
                (m: any) => !(myBalance < 0 && (balances[m.uid] || 0) > 0),
              ) && (
              <p className="text-gray-400 mb-4">送金可能な相手がいません。</p>
            )}

            {/* 金額入力＆送信 */}
            <div className="flex flex-col gap-2">
              {(() => {
                // 選択中の相手へ送れる上限
                const maxPay = settleInput.to_uid
                  ? Math.min(-myBalance, balances[settleInput.to_uid] || 0)
                  : 0;
                const isValid =
                  settleInput.to_uid !== "" &&
                  settleInput.amount >= 1 &&
                  settleInput.amount <= maxPay;

                return (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={amountInput}
                      onChange={(e) => {
                        let raw = e.target.value;
                        raw = raw.replace(/[０-９]/g, (s) =>
                          String.fromCharCode(s.charCodeAt(0) - 65248),
                        );
                        if (!/^\d*$/.test(raw)) return;

                        const cleaned = raw.replace(/^0+(?=\d)/, "");

                        setAmountInput(cleaned);
                        setSettleInput((s) => ({
                          ...s,
                          amount: Number(cleaned || "0"),
                        }));
                      }}
                      placeholder="SATO"
                      className="w-full p-2 bg-gray-700 rounded text-center text-white"
                    />
                    {/* 範囲外エラー */}
                    {!isValid && settleInput.to_uid && (
                      <p className="text-red-400 text-sm text-center">
                        1 - {maxPay.toLocaleString()}
                      </p>
                    )}
                    <button
                      onClick={async () => {
                        if (!isValid) return;
                        await api.requestSettlement(
                          token!,
                          roomId!,
                          settleInput.to_uid,
                          settleInput.amount,
                        );
                        setSettleInput({ to_uid: "", amount: 0 });
                        setShowSettleModal(false);
                      }}
                      disabled={!isValid}
                      className={`w-full py-2 rounded text-white font-semibold transition ${
                        isValid
                          ? "bg-purple-600 hover:bg-purple-500"
                          : "bg-purple-600/30 cursor-not-allowed"
                      }`}
                    >
                      Sato
                    </button>
                  </>
                );
              })()}
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
