// app/rooms/[roomId]/page.tsx
"use client";

import { useParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import * as api from "@/lib/api";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { usePresence } from "@/context/PresenceContext";

type PendingRequest =
  | { type: "join"; from_uid: string }
  | { type: "settle"; from_uid: string; amount: number };

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { sendEvent } = usePresence();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [userMap, setUserMap] = useState<
    Record<string, { display_name: string; icon_url?: string }>
  >({});
  const [pointHistory, setPointHistory] = useState<any[]>([]);
  const [myBalance, setMyBalance] = useState<number>(0);

  const [amountInput, setAmountInput] = useState<string>("");
  const [showApprovalSuccess, setShowApprovalSuccess] = useState(false);
  const [historyType, setHistoryType] = useState<"PON" | "SATO">("PON");
  const [balances, setBalances] = useState<Record<string, number>>({});

  const [joinQueue, setJoinQueue] = useState<string[]>([]);
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [submittedBy, setSubmittedBy] = useState<Set<string>>(new Set());
  const [submissions, setSubmissions] = useState<Record<string, number>>({});
  const [finalTable, setFinalTable] = useState<Record<string, number> | null>(
    null
  );
  const [approvedBy, setApprovedBy] = useState<Set<string>>(new Set());
  const filteredHistory = pointHistory.filter((rec) =>
    rec.round_id.startsWith(historyType)
  );
  const [pendingReq, setPendingReq] = useState<{
    from_uid: string;
    amount: number;
  } | null>(null);
  const [settleInput, setSettleInput] = useState({ to_uid: "", amount: 0 });

  const [showPointModal, setShowPointModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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

  // Firebase ID token
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const idToken = await user.getIdToken();
        setToken(idToken);
      } else {
        router.replace("/");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    setEditName(room?.name || "");
    setEditDesc(room?.description || "");
  }, [room]);

  const pathname = usePathname();

  const prevPathRef = useRef<string>(pathname);
  useEffect(() => {
    if (
      prevPathRef.current.startsWith(`/rooms/${roomId}`) &&
      !pathname.startsWith(`/rooms/${roomId}`)
    ) {
      sendEvent({ type: "cancel_point_round", room_id: roomId });
      sendEvent({ type: "leave_room", room_id: roomId });
    }
    prevPathRef.current = pathname;
  }, [pathname, roomId, sendEvent]);

  useEffect(() => {
    return () => {
      if (!roomId) return;
      sendEvent({ type: "cancel_point_round", room_id: roomId });
      sendEvent({ type: "leave_room", room_id: roomId });
    };
  }, [roomId, sendEvent]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!roomId) return;
      navigator.sendBeacon(
        `${process.env.NEXT_PUBLIC_WS_URL}/ws?token=${token}`,
        JSON.stringify({ type: "cancel_point_round", room_id: roomId })
      );
      navigator.sendBeacon(
        `${process.env.NEXT_PUBLIC_WS_URL}/ws?token=${token}`,
        JSON.stringify({ type: "leave_room", room_id: roomId })
      );
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [roomId, token]);

  const handleUpdateRoom = async () => {
    setUpdating(true);
    try {
      await api.updateRoom(token, roomId, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
      setRoom({ ...room, name: editName, description: editDesc });
      setShowSettingsModal(false);
    } catch (err: any) {
      setErrorMessage(err.message || "更新に失敗しました");
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    api
      .getMe(token)
      .then(setMe)
      .catch(() => router.replace("/"));
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    api
      .getListUsers(token)
      .then(
        (
          users: Array<{ uid: string; display_name: string; icon_url?: string }>
        ) => {
          const map: typeof userMap = {};
          users.forEach((u) => {
            map[u.uid] = { display_name: u.display_name, icon_url: u.icon_url };
          });
          setUserMap(map);
        }
      )
      .catch((err) => {
        console.error("Failed to fetch user list:", err);
      });
  }, [token]);

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
        setJoinQueue(roomData.pending_members?.map((m: any) => m.uid) || []);
      } catch {}
    })();
  }, [token, roomId]);

  useEffect(() => {
    if (!wsReady || !roomId) return;
    enterRoom(roomId);
    return () => leaveRoom(roomId);
  }, [wsReady, roomId, enterRoom, leaveRoom]);

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
    if (finalTable && room && approvedBy.size === onlineCount) {
      setShowApprovalSuccess(true);
      const timeout = setTimeout(() => {
        setShowApprovalSuccess(false);
        setShowPointModal(false);
      }, 1500); // 1.5秒で閉じる

      return () => clearTimeout(timeout);
    }
  }, [approvedBy.size, finalTable, room]);

  function cancelPointRound(reason?: string) {
    setIsRoundActive(false);
    setShowPointModal(false);
    setSubmittedBy(new Set());
    setSubmissions({});
    setFinalTable(null);
    setApprovedBy(new Set());
  }

  // inside RoomPage(), after your existing hooks:
const totalPon = pointHistory.filter(rec => rec.round_id.startsWith("PON")).length;
const wins = pointHistory.reduce((acc, rec) => {
  if (!rec.round_id.startsWith("PON")) return acc;
  // find highest scorer
  const top = [...rec.points].sort((a, b) => b.value - a.value)[0];
  return top.uid === me?.uid ? acc + 1 : acc;
}, 0);

useEffect(() => {
  if (!me) return;
  const off = onEvent((ev) => {
    if (ev.room_id !== roomId) return;

    switch (ev.type) {
      case "join_request":
        setJoinQueue((q) => [...q, ev.applicant_uid]);
        break;
      case "join_approved":
      case "join_rejected":
        setJoinQueue((q) => q.filter((uid) => uid !== ev.applicant_uid));
        break;
      case "join_request_cancelled":
        setJoinQueue((q) => q.filter((uid) => uid !== ev.user_id));
        break;
      case "point_round_started":
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
        cancelPointRound(ev.reason);
        break;
      case "settle_requested":
        if (ev.to_uid === me.uid) {
          setPendingReq({ from_uid: ev.from_uid, amount: ev.amount });
        }
        break;
      case "settle_rejected":
        if (ev.from_uid === me.uid) {
          const rejecter = userMap[ev.to_uid]?.display_name || ev.to_uid;
          alert(`${rejecter} さんに拒否されました`);
          setPendingReq(null);
          setSettleInput({ to_uid: "", amount: 0 });
          setAmountInput("");
        }
        break;
      case "settle_completed":
        break;
      default:
        break;
    }
  });
  return off;
}, [onEvent, me, roomId, userMap]);

  if (!token || !me)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                  <p className="text-gray-400">Loading…</p>
        </div>
      </div>
    );
  if (!room)
    return <p className="text-center mt-20 text-red-400">Room not found.</p>;

  const handleLeaveRoom = async () => {
    try {
      await api.leaveRoom(token, roomId);
      router.replace("/c420");
    } catch (err: any) {
      setErrorMessage(err.message || "退出に失敗しました。");
    }
  };

  const handleDecision = async (action: "approve" | "reject", uid: string) => {
    try {
      if (action === "approve") {
        await api.approveMember(token!, roomId!, uid);
      } else {
        await api.rejectMember(token!, roomId!, uid);
      }
    } catch (e: any) {
      console.error(`${action} に失敗:`, e);
      if (action === "approve") alert("承認に失敗しました");
    } finally {
      setJoinQueue((q) => q.filter((u) => u !== uid));
    }
  };
  const handleDeleteRoom = async () => {
    try {
      await api.deleteRoom(token, roomId);
      router.replace("/c420");
    } catch (err: any) {
      setErrorMessage(err.message || "ルーム削除に失敗しました。");
    }
  };

  if (!token || !me)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                  <p className="text-gray-400">Loading…</p>
        </div>
      </div>
    );

  const myUid = me.uid;
  const onlineCount = ctxOnlineUsers[roomId]?.size || 0;
  const canStartRound = onlineCount >= 2;
      return (
  <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-gray-100 flex flex-col relative overflow-hidden">
    {/* 背景エフェクト */}
    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-pulse"></div>
    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)]"></div>
    
{/* Header */}
<header className="relative z-10 px-4 sm:px-8 py-4 backdrop-blur-lg bg-gray-900/70 border-b border-gray-700/50">
  <div className="max-w-[1150px] mx-auto flex items-center justify-between">
    {/* Back Button */}
    <button
      onClick={() => router.push("/c420")}
      className="p-2 rounded-lg hover:bg-gray-800/50 transition-all duration-200 hover:scale-105"
    >
      <span className="material-symbols-outlined text-white text-2xl">
        arrow_back
      </span>
    </button>

    {/* Title + Online Count */}
    <div className="flex flex-col items-center">
      <h1 className="text-xl sm:text-2xl font-bold tracking-wide bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
        {room.name}
      </h1>
      <div className="flex items-center gap-2 mt-1">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        <span className="text-xs text-gray-400">{onlineCount} online</span>
      </div>
    </div>

    {/* Settings Button */}
    <button
      onClick={() => setShowSettingsModal(true)}
      className="p-2 rounded-lg hover:bg-gray-800/50 transition-all duration-200 hover:scale-105"
    >
      <span className="material-symbols-outlined text-white text-2xl">
        settings
      </span>
    </button>
  </div>
</header>
<div className="w-full">
    <main className="max-w-[1200px] mx-auto relative z-10 flex-grow overflow-auto px-4 sm:px-8 py-6">
{/* Player Card */}
<div className="relative mb-8">
  {/* background glow */}
  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-3xl blur-xl" />

  {/* card container */}
  <div className="relative bg-gray-800/80 backdrop-blur-lg rounded-3xl p-4 sm:p-6 border border-gray-700/50">
    <div className="flex items-center flex-wrap sm:space-x-6">
      {/* avatar */}
      <div className="relative flex-shrink-0 mr-4">
        <div className="absolute inset-0 rounded-full blur-md opacity-50 bg-gradient-to-r from-blue-400 to-purple-500" />
        <div className="relative w-16 h-16 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-blue-600 to-purple-700 border-4 border-gray-700 overflow-hidden flex items-center justify-center shadow-2xl">
          {me.icon_url ? (
            <img
              src={me.icon_url}
              alt="Your avatar"
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <span className="text-3xl sm:text-5xl text-white font-bold">
              {me.display_name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* stats */}
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
          {/* balance */}
          <div className="flex items-center gap-1 bg-gray-700/50 rounded-full px-3 py-3 text-sm">
            <span className="material-symbols-outlined text-yellow-400 text-base">monetization_on</span>
            <span className={`font-semibold ${
                myBalance > 0 ? "text-yellow-400" :
                myBalance < 0 ? "text-red-500" :
                "text-gray-300"
              }`}>
              {myBalance.toLocaleString()}
            </span>
            <span className="text-xs text-gray-400">sato</span>
          </div>

          {/* rank */}
          <div className="flex items-center gap-1 bg-gray-700/50 rounded-full px-3 py-3 text-sm">
            <span className="material-symbols-outlined text-purple-400 text-base">trending_up</span>
            <span className="font-semibold text-purple-400">
              {(() => {
                const sorted = Object.entries(balances).sort(([,a],[,b]) => b - a);
                return sorted.findIndex(([uid]) => uid === myUid)! + 1;
              })()}
            </span>
            <span className="text-xs text-gray-400">rank</span>
          </div>

          {/* wins */}
          <div className="flex items-center gap-1 bg-gray-700/50 rounded-full px-3 py-3 text-sm">
            <span className="material-symbols-outlined text-green-500 text-base">Add</span>
            <span className="font-semibold text-green-500">
              {(() => {
                const pon = pointHistory.filter(r => r.round_id.startsWith("PON"));
                const w = pon.reduce((c, rec) => {
                  const meP = rec.points.find(p => p.uid === myUid);
                  return meP && meP.value > 0 ? c+1 : c;
                }, 0);
                return `${w}/${pon.length}`;
              })()}
            </span>
            <span className="text-xs text-gray-400">plus</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
{/* ゲームアクション */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-8">
        {/* SATO */}
        <button
          onClick={() => canStartRound && setShowSettleModal(true)}
          disabled={!canStartRound}
          className={`group relative overflow-hidden rounded-2xl transition-all duration-300 transform hover:scale-105 ${
            canStartRound
              ? "bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-lg hover:shadow-purple-500/25"
              : "bg-gray-700/50 cursor-not-allowed opacity-50"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
          <div className="relative flex flex-col items-center p-4 sm:p-6">
            <span className="material-symbols-outlined text-white text-2xl sm:text-3xl mb-2">
              payments
            </span>
            <span className="text-sm sm:text-base font-bold text-white">SATO</span>
          </div>
        </button>

        {/* History */}
        <button
          onClick={() => setShowHistoryModal(true)}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
          <div className="relative flex flex-col items-center p-4 sm:p-6">
            <span className="material-symbols-outlined text-blue-400 text-2xl sm:text-3xl mb-2">
              history
            </span>
            <span className="text-sm sm:text-base font-bold text-white">History</span>
          <span className="text-xs text-gray-400 mt-1 hidden sm:block">
  {pointHistory.filter(r => r.round_id.startsWith("PON")).length} games
</span>
</div>
        </button>

        {/* PON */}
        <button
          onClick={() => canStartRound && setShowPointModal(true)}
          disabled={!canStartRound}
          className={`group relative overflow-hidden rounded-2xl transition-all duration-300 transform hover:scale-105 ${
            canStartRound
              ? isRoundActive
                ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white ring-2 ring-purple-400 animate-pulse shadow-lg shadow-purple-500/50"
                : "bg-gradient-to-br from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-lg hover:shadow-indigo-500/25"
              : "bg-gray-700/50 cursor-not-allowed opacity-50"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
          <div className="relative flex flex-col items-center p-4 sm:p-6">
            <span className="material-symbols-outlined text-white text-2xl sm:text-3xl mb-2">
              leaderboard
            </span>
            <span className="text-sm sm:text-base font-bold text-white">
              {isRoundActive ? "Active" : "PON"}
            </span>
          </div>
        </button>
      </div>

      {/* 待機中のリクエスト */}
{/* Pending Join Requests */}
{joinQueue.length > 0 && (
  <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
    {/* header */}
    <h3 className="flex items-center gap-2 text-lg font-bold text-amber-400 mb-3">
      <span className="material-symbols-outlined">notification_important</span>
      Join Requests ({joinQueue.length})
    </h3>
    {/* list */}
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {joinQueue.map((uid) => {
        const user = userMap[uid] || { display_name: uid };
        const online = ctxOnlineUsers[roomId]?.has(uid);
        return (
          <div
            key={uid}
            className="flex items-center justify-between bg-gray-800/50 hover:bg-gray-800/70 rounded-xl p-3 transition-colors"
          >
            {/* user info */}
            <div className="flex items-center gap-3">
              {/* online indicator */}
              <span
                className={`w-3 h-3 rounded-full border-2 border-gray-800 ${
                  online ? "bg-green-400" : "bg-gray-600"
                }`}
                title={online ? "Online" : "Offline"}
              />
              {/* avatar */}
              {user.icon_url ? (
                <img
                  src={user.icon_url}
                  alt={user.display_name}
                  className="w-10 h-10 rounded-full object-cover shadow-lg"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                  {user.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              {/* name */}
              <span className="font-medium text-white truncate">
                {user.display_name}
              </span>
            </div>
            {/* actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleDecision("approve", uid)}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => handleDecision("reject", uid)}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}

    {/* Members*/}
{/* Leaderboard as Members (section and cards) */}
<section>
  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
    <span className="material-symbols-outlined text-green-400">group</span>
    Members ({room.members.length})
  </h2>
  <div className="flex gap-3 overflow-x-auto pb-1 snap-x sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:overflow-visible sm:snap-none">
    {Object.entries(balances)
      .sort(([, a], [, b]) => b - a)
      .map(([uid, bal], idx) => {
        const info = userMap[uid] || { display_name: uid, icon_url: undefined };
        const online = ctxOnlineUsers[roomId]?.has(uid);
        const isMe = uid === myUid;
        return (
          <div
            key={uid}
            className={`mt-2 relative flex-shrink-0 w-40 sm:w-auto snap-start bg-gray-800/50 backdrop-blur-lg rounded-2xl p-4 border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 ${
              isMe ? 'ring-2 ring-blue-500/50' : ''
            }`}
          >
            {/* medal badge */}
            {idx < 3 && (
              <span className={`
                material-symbols-outlined absolute top-2 left-2 text-2xl
                ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-400' : 'text-amber-200'}
              `}>
                {idx === 0 ? 'trophy' : idx === 1 ? 'military_tech' : 'workspace_premium'}
              </span>
            )}

            {/* online dot */}
            <div className={`absolute top-2 right-2 w-3 h-3 rounded-full border-2 border-gray-800 ${
              online ? 'bg-green-400' : 'bg-gray-600'
            }`} />

<div className="flex flex-col items-center mt-4 text-center">
  {/* avatar */}
  <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center shadow-lg mb-2">
    {info.icon_url ? (
      <img
        src={info.icon_url}
        alt={info.display_name}
        className="w-full h-full object-cover"
      />
    ) : (
      <span className="text-xl font-bold text-white">
        {info.display_name.charAt(0)}
      </span>
    )}
  </div>
  {/* name */}
  <h3 className="w-full max-w-[5.5rem] truncate font-medium text-sm text-white mb-1">
    {info.display_name}
  </h3>
  {/* score */}
  <div
    className={`px-3 py-1 rounded-full text-xs font-bold ${
      bal > 0
        ? 'bg-yellow-500/20 text-yellow-400'
        : bal < 0
        ? 'bg-red-500/20 text-red-400'
        : 'bg-gray-600/50 text-gray-300'
    }`}
  >
    {bal.toLocaleString()}pt
  </div>
</div>
          </div>
        );
      })}
  </div>
</section>
</main>{/* ポイントラウンドモーダル */}
</div>
      {showPointModal && (
        <div className="fixed inset-0 bg-gradient-to-br from-black/60 via-black/50 to-purple-900/30 backdrop-blur-xl flex items-center justify-center z-50 animate-fade-in">
          <div className="w-full max-w-md bg-gradient-to-br from-gray-900/90 via-gray-800/80 to-gray-900/90 backdrop-blur-2xl rounded-3xl p-8 border border-gray-600/30 shadow-2xl transform animate-scale-up relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-yellow-400/10 to-transparent rounded-full blur-xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-xl"></div>

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
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

                <button
                  onClick={() => {
                    sendEvent({ type: "cancel_point_round", room_id: roomId });
                    cancelPointRound();
                  }}
                  className="w-10 h-10 flex items-center justify-center hover:bg-gray-700/60 rounded-xl transition-all duration-200 hover:scale-105 group"
                >
                  <span className="material-symbols-outlined text-gray-400 group-hover:text-white text-lg transition-colors">
                    close
                  </span>
                </button>
              </div>

              {!isRoundActive &&
                !finalTable &&
                (canStartRound ? (
                  <button
                    onClick={async () => {
                      cancelPointRound();
                      await api.startPointRound(token!, roomId!);
                    }}
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
                        {submittedBy.size} / {onlineCount}
                      </p>
                    </div>
                    <div className="w-full h-4 bg-gray-700/50 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700 ease-out rounded-full shadow-lg relative"
                        style={{
                          width: `${(submittedBy.size / onlineCount) * 100}%`,
                        }}
                      >
                        <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>
                      </div>
                    </div>
                  </div>

                  {!submittedBy.has(me.uid) && (
                    <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl p-5 border border-gray-600/30">
                      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-400">
                          edit
                        </span>
                        Your Point
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
                              value
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
                  {submittedBy.size === onlineCount && (
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
                <div className="space-y-3">
                  {/* 結果表示 */}
                  <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-2xl p-5 border border-gray-600/30">
                    <h3 className="text-white font-bold text-xl mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-yellow-400">
                        trophy
                      </span>
                      Results
                    </h3>
                    <div
                      className={`
         ${
           Object.keys(finalTable).length > 3
             ? "max-h-60 overflow-y-auto space-y-2"
             : "space-y-2"
         }
      `}
                    >
                      {Object.entries(finalTable)
                        .sort((a, b) => b[1] - a[1]) // スコア順にソート
                        .map(([uid, v], i) => (
                          <div
                            key={uid}
                            className={`
             flex-shrink-0 flex justify-between items-center px-4 py-3 rounded-xl
              transition-all duration-300 transform hover:scale-[1.01] relative overflow-hidden
              ${
                i === 0
                  ? "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-400/40 text-yellow-300 shadow-lg"
                  : i === 1
                    ? "bg-gradient-to-r from-gray-400/10 to-gray-500/10 border border-gray-400/30 text-gray-200"
                    : i === 2
                      ? "bg-gradient-to-r from-amber-600/10 to-orange-600/10 border border-amber-600/30 text-amber-200"
                      : "bg-gray-700/40 border border-gray-600/20 text-gray-300"
              }
            `}
                            style={{
                              ...(Object.keys(finalTable).length >= 4
                                ? { minWidth: 200 }
                                : {}),
                            }}
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
                              {/* ← new avatar + display_name */}
                              {userMap[uid]?.icon_url ? (
                                <img
                                  src={userMap[uid].icon_url}
                                  alt={userMap[uid].display_name}
                                  className="w-6 h-6 rounded-full"
                                />
                              ) : (
                                <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-xs text-white">
                                  {userMap[uid]?.display_name.charAt(0)}
                                </div>
                              )}
                              <span className="font-medium truncate max-w-[8rem]">
                                {userMap[uid]?.display_name || uid}
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

                  <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-2xl p-5 border border-indigo-500/20">
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium text-indigo-300">
                            Approved
                          </p>
                          <p className="text-sm font-bold text-white tabular-nums">
                            {approvedBy.size} / {onlineCount}
                          </p>
                        </div>
                        <div className="w-full h-4 bg-gray-700/50 rounded-full overflow-hidden shadow-inner">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700 ease-out rounded-full shadow-lg relative"
                            style={{
                              width: `${(approvedBy.size / onlineCount) * 100}%`,
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
<div className="
  w-full h-full
  sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:h-[80vh]
  bg-gray-900/90 … 
  rounded-none sm:rounded-2xl
  overflow-hidden flex flex-col
">
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

              <div className="flex space-x-8">
                {["PON", "SATO"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setHistoryType(type as "PON" | "SATO")}
                    className={`
                                                             relative pb-2 text-sm font-medium transition
                                                             ${
                                                               historyType ===
                                                               type
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
[...filteredHistory]
  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  .map((rec) => {
    const sender = rec.points.find((p) => p.value > 0)!;
    const receiver = rec.points.find((p) => p.value < 0)!;
    const amount = Math.abs(sender.value);

    if (historyType === "SATO") {
      return (
        <div
          key={rec.round_id}
          className="mx-auto max-w-2xl bg-gray-900/80 border border-gray-700 rounded-2xl p-6 flex flex-col items-center space-y-4"
        >
          <div className="w-full flex justify-between items-center mb-2">
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
<div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 w-full">
  <div className="flex">
    {/* From */}
    <div className="flex-1 flex flex-col items-center">
      {userMap[sender.uid]?.icon_url ? (
        <img
          src={userMap[sender.uid].icon_url}
          alt={userMap[sender.uid].display_name}
          className="w-10 h-10 rounded-full object-cover mb-2"
        />
      ) : (
        <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center mb-2 text-white">
          {userMap[sender.uid]?.display_name.charAt(0)}
        </div>
      )}
      <span
        className="
          text-sm md:text-base font-medium text-green-300 
          truncate whitespace-nowrap 
          max-w-[5rem] sm:max-w-[6rem] lg:max-w-[8rem] 
          text-center
        "
        title={userMap[sender.uid]?.display_name}
      >
        {userMap[sender.uid]?.display_name || sender.uid}
      </span>
    </div>


{/* → & Amount */}
<div className="flex-1 flex flex-col items-center justify-center space-y-1">
  {/* 大きめの矢印アイコン */}
  <span className="material-symbols-outlined text-blue-300 text-2xl md:text-3xl">
    arrow_forward
  </span>

  {/* 金額バッジ */}
  <div className="inline-flex items-center justify-center bg-yellow-600/20 border border-yellow-500 rounded-full px-4 py-2 min-w-[4rem] md:min-w-[5rem]">
    <span className="text-yellow-300 font-extrabold text-base md:text-lg leading-none truncate">
      {amount}
      <span className="text-xs md:text-sm opacity-80 ml-1">sato</span>
    </span>
  </div>
</div>

    {/* To */}
    <div className="flex-1 flex flex-col items-center">
      {userMap[receiver.uid]?.icon_url ? (
        <img
          src={userMap[receiver.uid].icon_url}
          alt={userMap[receiver.uid].display_name}
          className="w-10 h-10 rounded-full object-cover mb-2"
        />
      ) : (
        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center mb-2 text-white">
          {userMap[receiver.uid]?.display_name.charAt(0)}
        </div>
      )}
      <span
        className="
          text-sm md:text-base font-medium text-blue-300 
          truncate whitespace-nowrap 
          max-w-[5rem] sm:max-w-[6rem] lg:max-w-[8rem] 
          text-center
        "
        title={userMap[receiver.uid]?.display_name}
      >
        {userMap[receiver.uid]?.display_name || receiver.uid}
      </span>
    </div>
  </div>
</div>
        </div>
      );
    }
                    return (
                      <div
                        key={rec.round_id}
                        className="mx-auto max-w-2xl bg-gray-900/80 border border-gray-700 rounded-2xl p-6"
                      >
                        {/* ヘッダー */}
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                              <span className="material-symbols-outlined text-white text-sm">
                              leaderboard
                              </span>
                            </div>
                            <span className="text-sm font-mono text-sky-400 font-semibold">
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
                              {new Date(rec.created_at).toLocaleString(
                                "ja-JP",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </span>
                          </div>
                        </div>

                        {/* 結果リスト */}
                        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                          <div className="grid gap-3">
                            {rec.points
                              .sort((a, b) => b.value - a.value)
                              .map((p, idx) => (
                                <div
                                  key={p.uid}
                                  className={`flex justify-between items-center px-3 py-2 rounded-lg ${
                                    idx === 0
                                      ? "bg-yellow-500/15 border-yellow-400/30 border"
                                      : idx === 1
                                        ? "bg-gray-400/10 border-gray-400/30 border"
                                        : idx === 2
                                          ? "bg-amber-600/10 border-amber-600/30 border"
                                          : "bg-gray-700/30 border-gray-600/20 border"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {/* アイコン */}
                                    {idx === 0 && (
                                      <span className="material-symbols-outlined text-yellow-400">
                                        trophy
                                      </span>
                                    )}
                                    {idx === 1 && (
                                      <span className="material-symbols-outlined text-gray-400">
                                        military_tech
                                      </span>
                                    )}
                                    {idx === 2 && (
                                      <span className="material-symbols-outlined text-amber-200">
                                        workspace_premium
                                      </span>
                                    )}

                                    {/* アバター */}
                                    {userMap[p.uid]?.icon_url ? (
                                      <img
                                        src={userMap[p.uid].icon_url}
                                        alt={userMap[p.uid].display_name}
                                        className="w-6 h-6 rounded-full"
                                      />
                                    ) : (
                                      <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-xs text-white">
                                        {userMap[p.uid]?.display_name.charAt(0)}
                                      </div>
                                    )}
                                    {/* 名前 */}
                                    <span className="truncate max-w-[8rem] font-medium">
                                      {userMap[p.uid]?.display_name || p.uid}
                                    </span>
                                  </div>

                                  {/* スコア */}
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
                  Who?
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
    // userMap から情報を取得
    const user = userMap[m.uid] ?? { display_name: m.uid, icon_url: "" };
    const maxPay = Math.min(-myBalance, balances[m.uid] || 0);
    const isSel = settleInput.to_uid === m.uid;

    return (
      <button
        key={m.uid}
        onClick={() => setSettleInput({ to_uid: m.uid, amount: 0 })}
        className={`relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 group ${
          isSel
            ? "border-purple-400/60 bg-gradient-to-br from-purple-600/20 to-indigo-600/20 shadow-lg shadow-purple-500/20"
            : "border-gray-600/40 bg-gradient-to-br from-gray-700/40 to-gray-800/40 hover:border-purple-400/40"
        }`}
      >
        {isSel && (
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-2xl animate-pulse" />
        )}

        {/* アイコン or イニシャル */}
        <div className="w-12 h-12 rounded-full overflow-hidden mb-2">
          {user.icon_url ? (
            <img
              src={user.icon_url}
              alt={user.display_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-600 text-white font-bold text-lg">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* 表示名 */}
        <span
          className={`text-sm font-medium truncate w-full text-center ${
            isSel ? "text-purple-300" : "text-gray-300"
          }`}
        >
          {user.display_name}
        </span>

        {/* Max */}
        <div
          className={`text-xs mt-1 px-2 py-0.5 rounded-full ${
            isSel ? "bg-purple-500/20 text-purple-300" : "bg-gray-600/40 text-gray-400"
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

                  {(() => {
                    const maxPay = Math.min(
                      -myBalance,
                      balances[settleInput.to_uid] || 0
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
                                String.fromCharCode(s.charCodeAt(0) - 65248)
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
                              settleInput.amount
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

{showSettingsModal && (
  <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
    <div className="w-full h-full sm:w-full sm:max-w-lg sm:h-auto bg-gray-800/90 rounded-none sm:rounded-2xl shadow-2xl animate-scale-up overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center bg-gray-900/80 px-6 py-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Room Settings</h2>
        <button
          onClick={() => setShowSettingsModal(false)}
          className="p-2 rounded hover:bg-gray-700/40"
        >
          <span className="material-symbols-outlined text-white">close</span>
        </button>
      </div>
      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Name</label>
          {room.created_by === me.uid ? (
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              maxLength={20}
              className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 transition"
            />
          ) : (
            <p className="text-white">{room.name}</p>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Description</label>
          {room.created_by === me.uid ? (
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              maxLength={100}
              rows={3}
              className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 transition"
            />
          ) : (
            <p className="text-gray-200">{room.description || "None"}</p>
          )}
        </div>
        {/* Controls */}
        <div className="flex flex-col space-y-3">
          {room.created_by === me.uid && (
            <button
              onClick={handleUpdateRoom}
              disabled={updating}
              className={`w-full py-2 rounded-full text-white font-medium transition ${
                updating ? "bg-indigo-600/50 cursor-not-allowed" : "bg-indigo-500 hover:bg-indigo-600"
              }`}
            >
              {updating ? "Updating..." : "Update"}
            </button>
          )}
          <button
            onClick={room.created_by === me.uid ? handleDeleteRoom : handleLeaveRoom}
            className="w-full py-2 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium transition"
          >
            {room.created_by === me.uid ? "Delete Room" : "Leave Room"}
          </button>
        </div>
        {errorMessage && <p className="text-red-400 text-sm text-center">{errorMessage}</p>}
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
  {(() => {
    // ユーザー情報を取得
    const user = userMap[pendingReq.from_uid] ?? {
      display_name: pendingReq.from_uid,
      icon_url: "",
    };
    return (
      <div className="flex items-center gap-4 mb-4">
        {/* アバター */}
        <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
          {user.icon_url ? (
            <img
              src={user.icon_url}
              alt={user.display_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        {/* 表示名 */}
        <div>
          <p className="text-white font-semibold">
            {user.display_name}
          </p>
        </div>
      </div>
    );
  })()}

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
                      pendingReq.from_uid
                    );
                    setPendingReq(null);
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
                    await api.approveSettlementRequest(
                      token!,
                      roomId!,
                      pendingReq.from_uid
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
