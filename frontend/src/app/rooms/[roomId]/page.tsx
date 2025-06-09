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
 const [userMap, setUserMap] = useState<Record<string, { display_name: string; icon_url?: string }>>({});
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

  // state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [updating, setUpdating] = useState(false);

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
// roomを取得したら編集欄にも反映
useEffect(() => {
  setEditName(room?.name || "");
  setEditDesc(room?.description || "");
}, [room]);

// 編集処理
const handleUpdateRoom = async () => {
  setUpdating(true);
  try {
    await api.updateRoom(token, roomId, {
      name: editName.trim(),
      description: editDesc.trim()
    });
    setRoom({ ...room, name: editName, description: editDesc });
    setShowSettingsModal(false);
  } catch (err: any) {
    setErrorMessage(err.message || "更新に失敗しました");
  } finally {
    setUpdating(false);
  }
};
  // me 取得
  useEffect(() => {
    if (!token) return;
    api
      .getMe(token)
      .then(setMe)
      .catch(() => router.replace("/"));
  }, [token, router]);

 useEffect(() => {
    if (!token) return;
    api.getListUsers(token)
      .then((users: Array<{ uid: string; display_name: string; icon_url?: string }>) => {
        const map: typeof userMap = {};
        users.forEach(u => {
          map[u.uid] = { display_name: u.display_name, icon_url: u.icon_url };
        });
        setUserMap(map);
      })
      .catch(err => {
        console.error("Failed to fetch user list:", err);
      });
  }, [token]);
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
        // --- WebSocket イベントハンドラ内 ---
        case "point_round_started":
          // alert("ポイントラウンドが開始されました！");
          // モーダルを開いて新しいラウンドの UI を表示
          setShowPointModal(true);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-gray-100 flex flex-col">
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-8 py-4 backdrop-blur-lg bg-gray-900/70 border-b border-gray-700">
        <button
          onClick={() => router.push("/c402")}
          className="p-2 rounded hover:bg-gray-800/50 transition"
        >
          <span className="material-symbols-outlined text-white text-2xl">
            arrow_back
          </span>
        </button>
        <h1 className="text-2xl font-semibold tracking-wide">{room.name}</h1>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="p-2 rounded hover:bg-gray-800/50 transition"
        >
          <span className="material-symbols-outlined text-white text-2xl">
            settings
          </span>
        </button>
      </header>

      {/* メイン */}
      <main className="flex-grow overflow-auto px-8 py-6">
        {/* 自分のアイコン＆ポイント */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-600 to-purple-700 border-4 border-gray-700 overflow-hidden flex items-center justify-center shadow-xl">
            {me.icon_url ? (
              <img
                src={me.icon_url}
                alt="Your avatar"
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <span className="text-6xl text-white font-bold">
                {me.display_name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div
            className={`mt-3 text-2xl font-bold ${
              myBalance === 0
                ? "text-gray-300"
                : myBalance > 0
                  ? "text-yellow-400"
                  : "text-red-500"
            }`}
          >
            {myBalance.toLocaleString()} sato
          </div>
        </div>

        {/* 機能ボタン */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          {/* Settle */}
          <button
            onClick={() => hasOtherOnline && setShowSettleModal(true)}
            disabled={!hasOtherOnline}
            className={`flex flex-col items-center p-5 rounded-2xl transition
            ${
              hasOtherOnline
                ? "bg-gray-800 hover:bg-gray-700 cursor-pointer"
                : "bg-gray-700/50 cursor-not-allowed opacity-60"
            }
            shadow-lg`}
          >
            <span className="material-symbols-outlined text-purple-400 text-3xl mb-2">
              payments
            </span>
            <span className="text-sm font-medium">Sato</span>
          </button>

          {/* History */}
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex flex-col items-center p-5 rounded-2xl bg-gray-800 hover:bg-gray-700 transition shadow-lg"
          >
            <span className="material-symbols-outlined text-gray-400 text-3xl mb-2">
              history
            </span>
            <span className="text-sm font-medium">History</span>
          </button>

          {/* Round */}
          <button
            onClick={() => hasOtherOnline && setShowPointModal(true)}
            disabled={!hasOtherOnline}
            className={`
    flex flex-col items-center p-5 rounded-2xl transition shadow-lg
    ${
      hasOtherOnline
        ? isRoundActive
          ? // ラウンド中はグラデ＋リング＋pulse
            "bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white ring-2 ring-purple-400 animate-pulse cursor-pointer"
          : // 通常の状態
            "bg-gray-800 hover:bg-gray-700 cursor-pointer"
        : // オフライン
          "bg-gray-700/50 cursor-not-allowed opacity-60"
    }
  `}
          >
            <span
              className={`material-symbols-outlined text-3xl mb-2 ${
                isRoundActive ? "text-white" : "text-indigo-400"
              }`}
            >
              leaderboard
            </span>
            <span className="text-sm font-medium">
              {isRoundActive ? "Active" : "Round"}
            </span>
          </button>
        </div>

        {/* メンバー一覧 */}
<section>
  <h2 className="text-lg font-semibold mb-4">Members</h2>
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
    {room.members.map((m: any) => {
      // lookup：userMap に存在すれば display_name, icon_url を取得
      const info = userMap[m.uid] || { display_name: m.uid, icon_url: undefined };
      const online = ctxOnlineUsers[roomId]?.has(m.uid);
      const bal = balances[m.uid] || 0;
      return (
        <button
          key={m.uid}
          onClick={() => setSelectedMember(m)}
          className="relative flex flex-col items-center bg-gray-800 rounded-2xl p-4 hover:bg-gray-700 transition"
        >
          {/* オンラインインジケーター */}
          <span
            className={`
              absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-800
              ${online ? "bg-green-400" : "bg-gray-600"}
            `}
            title={online ? "Online" : "Offline"}
          />

          {/* アバター */}
          {info.icon_url ? (
            <img
              src={info.icon_url}
              alt={info.display_name}
              className="w-16 h-16 rounded-full object-cover mb-2 shadow-lg"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-700 mb-2 flex items-center justify-center text-xl text-white shadow-lg">
              {info.display_name.charAt(0)}
            </div>
          )}

          {/* 表示名 */}
          <span className="text-sm font-medium text-gray-200 truncate w-full text-center">
            {info.display_name}
          </span>

          {/* バランス */}
          <span
            className={`mt-1 px-2 py-1 rounded-full text-xs font-semibold ${
              bal > 0
                ? "bg-yellow-500/20 text-yellow-400"
                : bal < 0
                  ? "bg-red-500/20 text-red-400"
                  : "bg-gray-600 text-gray-300"
            }`}
          >
            {bal.toLocaleString()}pt
          </span>
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
                      Start
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
                        Start
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
                            Approve
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
          <div className="w-full max-w-3xl h-[80vh] bg-gray-900/90 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col animate-scale-up">
            {/* ヘッダー + タブ */}
            <div className="bg-gray-800/80 px-6 py-4 flex flex-col">
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-gray-400 hover:text-white p-1 rounded"
                >
                  <span className="material-symbols-outlined text-2xl">
                    close
                  </span>
                </button>
              </div>

              {/* タブ */}
              <div className="flex space-x-8">
                {["PON", "SATO"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setHistoryType(type as "PON" | "SATO")}
                    className={`
          relative pb-2 text-sm font-medium transition
          ${
            historyType === type
              ? "text-white"
              : "text-gray-400 hover:text-gray-200"
          }
        `}
                  >
                    {type}
                    {historyType === type && (
                      <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            {/* コンテンツ */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 scrollbar-hide scrollbar-thumb-gray-700 scrollbar-track-gray-800">
              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center py-20">
                  <span className="material-symbols-outlined text-gray-500 text-4xl mb-4">
                    history
                  </span>
                  <p className="text-gray-500 text-lg">No history available</p>
                  <p className="text-gray-600 text-sm mt-1">
                    Game records will appear here
                  </p>
                </div>
              ) : (
                filteredHistory.map((rec, index) => {
                  if (historyType === "SATO") {
                    const sender = rec.points.find((p: any) => p.value > 0);
                    const receiver = rec.points.find((p: any) => p.value < 0);
                    const amount = Math.abs(
                      sender?.value || receiver?.value || 0,
                    );

                    return (
                      <div
                        key={rec.round_id}
                        className="mx-auto max-w-2xl bg-gray-900/80 border border-gray-700 rounded-2xl p-6"
                      >
                        {/* ヘッダー */}
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                              <span className="material-symbols-outlined text-white text-sm">
                                swap_horiz
                              </span>
                            </div>
                            <span className="text-sm font-mono text-blue-300 font-semibold">
                              {rec.round_id}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400 bg-gray-800/60 px-2 py-1 rounded-lg">
                            {new Date(rec.created_at).toLocaleString("ja-JP", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {/* 送金フロー */}
                        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                          <div className="flex items-center justify-between">
                            {/* From */}
                            <div className="flex flex-col items-center">
                              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center mb-2">
                                <span className="material-symbols-outlined text-white text-sm">
                                  account_circle
                                </span>
                              </div>
                              <span className="text-xs text-gray-400 mb-1">
                                From
                              </span>
                              <span className="text-sm font-medium text-green-300 truncate max-w-[6rem]">
                                {sender?.uid || "Unknown"}
                              </span>
                            </div>
                            {/* → & Amount */}
                            <div className="flex flex-col items-center mx-6">
                              <span className="material-symbols-outlined text-blue-400 text-lg">
                                arrow_forward
                              </span>
                              <div className="mt-2 bg-yellow-600/20 border border-yellow-500 rounded-lg px-3 py-1">
                                <span className="text-yellow-300 font-bold">
                                  {amount}{" "}
                                  <span className="text-xs opacity-80">
                                    sato
                                  </span>
                                </span>
                              </div>
                            </div>
                            {/* To */}
                            <div className="flex flex-col items-center">
                              <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center mb-2">
                                <span className="material-symbols-outlined text-white text-sm">
                                  account_circle
                                </span>
                              </div>
                              <span className="text-xs text-gray-400 mb-1">
                                To
                              </span>
                              <span className="text-sm font-medium text-red-300 truncate max-w-[6rem]">
                                {receiver?.uid || "Unknown"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // PON ケース
                  return (
                    <div
                      key={rec.round_id}
                      className="mx-auto max-w-2xl bg-gray-900/80 border border-gray-700 rounded-2xl p-6"
                    >
                      {/* ヘッダー */}
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-sm">
                              emoji_events
                            </span>
                          </div>
                          <span className="text-sm font-mono text-purple-300 font-semibold">
                            {rec.round_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="bg-gray-800/60 px-2 py-1 rounded-lg flex items-center gap-1">
                            <span className="material-symbols-outlined text-gray-400 text-xs">
                              group
                            </span>
                            <span className="text-xs text-gray-400">
                              {rec.points.length}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400 bg-gray-800/60 px-2 py-1 rounded-lg">
                            {new Date(rec.created_at).toLocaleString("ja-JP", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* 結果リスト */}
                      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                        <div className="grid gap-3">
                          {rec.points
                            .sort((a: any, b: any) => b.value - a.value)
                            .map((p: any, idx: number) => (
                              <div
                                key={p.uid}
                                className={`flex justify-between items-center px-3 py-2 rounded-lg ${
                                  idx === 0
                                    ? "bg-yellow-500/15 border-yellow-400/30 border"
                                    : p.value > 0
                                      ? "bg-green-500/10 border-green-500/20 border"
                                      : p.value < 0
                                        ? "bg-red-500/10 border-red-500/20 border"
                                        : "bg-gray-700/30 border-gray-600/20 border"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {idx === 0 && (
                                    <span className="material-symbols-outlined text-yellow-400 text-sm">
                                      trophy
                                    </span>
                                  )}
                                  <span className="truncate max-w-[8rem] font-medium">
                                    {p.uid}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span
                                    className={`font-bold tabular-nums ${
                                      p.value > 0
                                        ? "text-green-400"
                                        : p.value < 0
                                          ? "text-red-400"
                                          : "text-gray-400"
                                    }`}
                                  >
                                    {p.value > 0 ? "+" : ""}
                                    {p.value}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    pt
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
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
        <div className="fixed inset-0 bg-gradient-to-br from-black/60 via-black/50 to-purple-900/30 backdrop-blur-xl flex items-center justify-center z-50 animate-fade-in">
          <div className="w-full max-w-md bg-gradient-to-br from-gray-900/90 via-gray-800/80 to-gray-900/90 backdrop-blur-2xl rounded-3xl p-8 border border-gray-600/30 shadow-2xl transform animate-scale-up relative overflow-hidden">
            {/* 背景装飾 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-400/10 to-transparent rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-xl"></div>

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
                {/* タイトル＋アイコン */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="material-symbols-outlined text-white text-xl">
                      payments
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent tracking-wide">
                    SATO
                  </h2>
                </div>

                {/* 閉じるボタン */}
                <button
                  onClick={() => setShowSettleModal(false)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-gray-700/60 rounded-xl transition-all duration-200 hover:scale-105 group"
                >
                  <span className="material-symbols-outlined text-gray-400 group-hover:text-white text-lg transition-colors">
                    close
                  </span>
                </button>
              </div>

              {/* 現在の残高表示 */}
              <div className="bg-gradient-to-r from-gray-800/60 to-gray-900/60 rounded-2xl p-4 mb-6 border border-gray-600/30">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium">
                    Your Balance
                  </span>
                  <span
                    className={`font-bold text-lg tabular-nums ${
                      myBalance >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {myBalance >= 0 ? "+" : ""}
                    {myBalance.toLocaleString()}
                    <span className="text-sm opacity-80 ml-1">sato</span>
                  </span>
                </div>
              </div>

              {/* 送金可能な相手だけをリスト */}
              <div className="mb-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-400">
                    person_search
                  </span>
                  Select Recipient
                </h3>

                {room.members.filter((m: any) => {
                  if (m.uid === me.uid) return false;
                  const theirBal = balances[m.uid] || 0;
                  return myBalance < 0 && theirBal > 0;
                }).length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {room.members
                      .filter((m: any) => {
                        if (m.uid === me.uid) return false;
                        const theirBal = balances[m.uid] || 0;
                        return myBalance < 0 && theirBal > 0;
                      })
                      .map((m: any) => {
                        const maxPay = Math.min(-myBalance, balances[m.uid]);
                        const isSel = settleInput.to_uid === m.uid;
                        return (
                          <button
                            key={m.uid}
                            onClick={() =>
                              setSettleInput({ to_uid: m.uid, amount: 0 })
                            }
                            className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 group ${
                              isSel
                                ? "border-purple-400/60 bg-gradient-to-br from-purple-600/20 to-indigo-600/20 shadow-lg shadow-purple-500/20"
                                : "border-gray-600/40 bg-gradient-to-br from-gray-700/40 to-gray-800/40 hover:border-purple-400/40"
                            }`}
                          >
                            {isSel && (
                              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-2xl animate-pulse"></div>
                            )}

                            <div
                              className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all ${
                                isSel
                                  ? "bg-gradient-to-r from-purple-500 to-indigo-500 shadow-lg"
                                  : "bg-gradient-to-r from-gray-600 to-gray-700 group-hover:from-purple-500/50 group-hover:to-indigo-500/50"
                              }`}
                            >
                              <span className="text-white font-bold text-lg">
                                {m.uid.charAt(0).toUpperCase()}
                              </span>
                            </div>

                            <span
                              className={`text-xs font-medium truncate max-w-full ${
                                isSel ? "text-purple-300" : "text-gray-300"
                              }`}
                            >
                              {m.uid}
                            </span>

                            <div
                              className={`text-xs mt-1 px-2 py-0.5 rounded-full ${
                                isSel
                                  ? "bg-purple-500/20 text-purple-300"
                                  : "bg-gray-600/40 text-gray-400"
                              }`}
                            >
                              Max: {maxPay.toLocaleString()}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-orange-400 text-sm">
                        info
                      </span>
                    </div>
                    <p className="text-orange-300 font-medium">
                      No recipients available for Sato
                    </p>
                  </div>
                )}
              </div>

              {/* 金額入力＆送信 */}
              {settleInput.to_uid && (
                <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl p-5 border border-gray-600/30">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-400">
                      paid
                    </span>
                    Enter Amount
                  </h3>

                  {(() => {
                    const maxPay = Math.min(
                      -myBalance,
                      balances[settleInput.to_uid] || 0,
                    );
                    const isValid =
                      settleInput.amount >= 1 && settleInput.amount <= maxPay;

                    return (
                      <div className="space-y-4">
                        <div className="relative">
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
                            placeholder="Enter amount..."
                            className="w-full px-4 py-4 bg-gray-900/60 border border-gray-600/50 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all duration-200 placeholder-gray-400 text-center text-xl font-semibold"
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
                            sato
                          </div>
                        </div>

                        {!isValid && settleInput.amount > 0 && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-red-400 text-sm">
                              error
                            </span>
                            <p className="text-red-300 text-sm">
                              Amount must be between 1 -{" "}
                              {maxPay.toLocaleString()} sato
                            </p>
                          </div>
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
                            setAmountInput("");
                            setShowSettleModal(false);
                          }}
                          disabled={!isValid}
                          className={`w-full py-4 rounded-2xl font-semibold transition-all duration-300 transform relative overflow-hidden group ${
                            isValid
                              ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:via-indigo-500 hover:to-purple-600 text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                              : "bg-gradient-to-r from-gray-700/50 to-gray-600/50 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          {isValid && (
                            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          )}
                          <span className="relative flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined">
                              send_money
                            </span>
                            Sato Request
                          </span>
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* メンバーディテールモーダル */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-2xl max-w-sm w-full">
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={() => setSelectedMember(null)}
                className="p-2 hover:bg-gray-700 rounded-full"
              >
                <span className="material-symbols-outlined text-white">
                  close
                </span>
              </button>
            </div>
 {/* アイコン */}
    {userMap[selectedMember.uid]?.icon_url ? (
      <img
        src={userMap[selectedMember.uid].icon_url}
        alt={userMap[selectedMember.uid].display_name}
        className="w-12 h-12 rounded-full mb-2"
      />
    ) : (
      <div className="w-12 h-12 rounded-full bg-gray-700 mb-2 flex items-center justify-center text-white">
        {userMap[selectedMember.uid]?.display_name.charAt(0)}
      </div>
    )}
    <h3 className="text-white text-lg font-semibold">
      {userMap[selectedMember.uid]?.display_name || selectedMember.uid}
    </h3>
            <p className="text-gray-300">
              参加日時: {new Date(selectedMember.joined_at).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Room Settings モーダル */}
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
          {room.created_by === me.uid ? (
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              maxLength={20}
              className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="text-lg">{room.name}</p>
          )}
        </div>
        <div>
          <h3 className="text-sm text-gray-400">Description</h3>
          {room.created_by === me.uid ? (
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              maxLength={100}
              className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="text-base">{room.description || "なし"}</p>
          )}
        </div>

        {room.created_by === me.uid && (
          <button
            onClick={handleUpdateRoom}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-semibold mt-2"
            disabled={updating}
          >
            {updating ? "Updating..." : "Update Room"}
          </button>
        )}

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
        <div className="fixed inset-0 bg-gradient-to-br from-black/70 via-black/60 to-blue-900/30 backdrop-blur-xl flex items-center justify-center z-50 animate-fade-in">
          <div className="w-full max-w-md bg-gradient-to-br from-gray-900/95 via-gray-800/85 to-gray-900/95 backdrop-blur-2xl rounded-3xl p-8 border border-gray-600/30 shadow-2xl transform animate-scale-up relative overflow-hidden">
            {/* 装飾 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-green-500/10 to-transparent rounded-full blur-xl"></div>

            <div className="relative z-10">
              {/* ヘッダー */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="material-symbols-outlined text-white text-2xl">
                    person_add
                  </span>
                </div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  Join Request
                </h2>
              </div>

              {/* ユーザー情報 */}
              <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl p-6 mb-6 border border-gray-600/30 text-center">
                <p className="text-gray-400 text-sm mb-2">User</p>
                <p className="text-white font-bold text-lg">
                  {joinReq.from_uid}
                </p>
              </div>

              {/* アクションボタン */}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      await api.rejectMember(token!, roomId!, joinReq.from_uid);
                    } catch (e) {
                      console.error("拒否に失敗:", e);
                    } finally {
                      setJoinReq(null);
                    }
                  }}
                  className="flex-1 py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-2xl font-semibold transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">block</span>
                    Reject
                  </span>
                </button>

                <button
                  onClick={async () => {
                    try {
                      await api.approveMember(
                        token!,
                        roomId!,
                        joinReq.from_uid,
                      );
                    } catch (e) {
                      console.error("承認に失敗:", e);
                      alert("承認に失敗しました");
                    } finally {
                      setJoinReq(null);
                    }
                  }}
                  className="flex-1 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-2xl font-semibold transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">
                      check_circle
                    </span>
                    Approve
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 精算リクエスト承認モーダル */}
      {pendingReq && (
        <div className="fixed inset-0 bg-gradient-to-br from-black/70 via-black/60 to-blue-900/30 backdrop-blur-xl flex items-center justify-center z-50 animate-fade-in">
          <div className="w-full max-w-md bg-gradient-to-br from-gray-900/95 via-gray-800/85 to-gray-900/95 backdrop-blur-2xl rounded-3xl p-8 border border-gray-600/30 shadow-2xl transform animate-scale-up relative overflow-hidden">
            {/* 背景装飾 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-green-500/10 to-transparent rounded-full blur-xl"></div>

            <div className="relative z-10">
              {/* ヘッダー */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="material-symbols-outlined text-white text-2xl">
                    request_quote
                  </span>
                </div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  Sato Request
                </h2>
              </div>

              {/* リクエスト詳細 */}
              <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl p-6 mb-6 border border-gray-600/30">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-lg">
                      {pendingReq.from_uid.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">
                      {pendingReq.from_uid}
                    </p>
                    <p className="text-gray-400 text-sm">wants to sato</p>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-400/30 rounded-xl p-4 text-center">
                  <p className="text-yellow-300 font-bold text-2xl">
                    {pendingReq.amount.toLocaleString()}
                    <span className="text-base opacity-80 ml-1">sato</span>
                  </p>
                </div>
              </div>

              {/* アクションボタン */}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    await api.rejectSettlementRequest(
                      token!,
                      roomId!,
                      pendingReq.from_uid,
                    );
                    setPendingReq(null);
                  }}
                  className="flex-1 py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-2xl font-semibold transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">block</span>
                    Decline
                  </span>
                </button>

                <button
                  onClick={async () => {
                    await api.approveSettlementRequest(
                      token!,
                      roomId!,
                      pendingReq.from_uid,
                    );
                    setPendingReq(null);
                  }}
                  className="flex-1 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-2xl font-semibold transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">
                      check_circle
                    </span>
                    Approve
                  </span>
                </button>
              </div>

              {/* 注意事項 */}
              <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-blue-400 text-sm mt-0.5">
                  info
                </span>
                <p className="text-blue-300 text-xs">
                  Approving will transfer {pendingReq.amount.toLocaleString()}{" "}
                  sato from your balance to {pendingReq.from_uid}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
