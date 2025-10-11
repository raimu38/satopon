// app/c420/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { auth } from "@/lib/firebaseClient";
import { signOut } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import * as api from "@/lib/api";
import { usePresence } from "@/context/PresenceContext";
import styles from "./Header.module.css";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  Tooltip,
} from "recharts";
export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [allRooms, setAllRooms] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [newRoom, setNewRoom] = useState({
    name: "",
    color_id: 1,
    description: "",
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  // タブ切り替え用のステートを定義
  const [activeTab, setActiveTab] = useState<
    "overview" | "recent_battles" | "sato_transactions"
  >("overview");

  // Modal states
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userList, setUserList] = useState<any[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userPointHistory, setUserPointHistory] = useState<any[]>([]);
  const [roomModalTab, setRoomModalTab] = useState<
    "joined" | "created" | "all"
  >("joined");
  const [initializing, setInitializing] = useState(true);
  const {
    wsReady,
    subscribePresence,
    unsubscribePresence,
    onlineUsers,
    onEvent,
  } = usePresence();

  useEffect(() => {
    if (!token) return;
    api
      .getUserPointHistory(token)
      .then((history) => {
        setUserPointHistory(history);
      })
      .catch((error) => {
        console.error("Failed to fetch user point history:", error);
      });
  }, [token]);

  useEffect(() => {
    if (!token) return;

    api
      .getListUsers(token)
      .then((users) => {
        setUserList(users);
      })
      .catch((err) => {
        console.error("Failed to fetch user list:", err);
      });
  }, [token]);

  const performanceData = useMemo(() => {
    if (!me) return [];

    const ponRoundsHistory = userPointHistory
      .filter((r) => r.round_id.startsWith("PON") && r.created_at) // created_at が存在するPONラウンドのみ
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ); // 古い順にソート

    let runningWins = 0;
    return ponRoundsHistory.map((round, index) => {
      const myValue = round.points.find((p) => p.uid === me.uid)?.value || 0;
      if (myValue > 0) runningWins++;
      return {
        round: index + 1, // 各ラウンドに時系列順のインデックスを割り当て
        score: myValue, // そのラウンドのユーザーのスコア
        winRate: Math.round((runningWins / (index + 1)) * 100), // 累積勝率
      };
    });
  }, [userPointHistory, me]); // userPointHistoryとmeが変更されたときに再計算
  const stats = useMemo(() => {
    // ログインユーザー情報または履歴データがなければ、すべて0を返す
    if (!me || userPointHistory.length === 0) {
      return {
        // PONゲームのカウント
        ponRounds: 0,
        wins: 0,
        totalPonPts: 0,
        winRate: 0,
        avgPonPts: 0,

        // 最大・最小・連勝記録
        maxPon: 0,
        minPon: 0,
        bestStreak: 0,

        // SATO取引の合計
        satoIn: 0,
        satoOut: 0,
        satoNet: 0,
        avgSato: 0,
        maxSato: 0,

        // 新規：対戦相手をグループ化したデータ
        groupedOpponents: [],
      };
    }

    // ヘルパー関数: このユーザーのポイント値を取得 (見つからなければ0)
    const myValue = (rec: any) => {
      const p = rec.points.find((p: any) => p.uid === me.uid);
      return p ? p.value : 0;
    };

    // --- PONの統計情報 ---
    const pon = userPointHistory.filter((r) => r.round_id.startsWith("PON"));
    const sato = userPointHistory.filter((r) => r.round_id.startsWith("SATO"));

    const ponRounds = pon.length; // PONラウンド数
    const valuesPon = pon.map(myValue); // このユーザーのPONポイント値の配列
    const wins = valuesPon.filter((v) => v > 0).length; // プラス得点のラウンド数
    const totalPonPts = valuesPon.reduce((sum, v) => sum + v, 0); // 純PONポイント
    const winRate = ponRounds
      ? Math.round((wins / ponRounds) * 100) // 勝率を整数パーセントで
      : 0;
    const avgPonPts = ponRounds
      ? Math.round(totalPonPts / ponRounds) // PONラウンドあたりの平均ポイント
      : 0;
    const maxPon = ponRounds
      ? Math.max(...valuesPon) // 最高の単一ラウンドPONポイント
      : 0;
    const minPon = ponRounds
      ? Math.min(...valuesPon) // 最悪の単一ラウンドPONポイント
      : 0;

    // 最長連勝記録の計算
    let bestStreak = 0;
    let cur = 0;
    valuesPon.forEach((v) => {
      if (v > 0) {
        cur += 1;
        bestStreak = Math.max(bestStreak, cur);
      } else {
        cur = 0;
      }
    });

    // --- SATOの統計情報 ---
    const valuesSato = sato.map(myValue); // このユーザーのSATOポイント値の配列
    const satoIn = valuesSato
      .filter((v) => v > 0) // 入金のみ
      .reduce((sum, v) => sum + v, 0); // 受取額の合計
    const satoOut = valuesSato
      .filter((v) => v < 0) // 出金のみ
      .reduce((sum, v) => sum + Math.abs(v), 0); // 支払額の合計
    const satoNet = satoIn - satoOut; // 純残高
    const avgSato = sato.length
      ? Math.round(satoNet / sato.length) // SATOラウンドあたりの平均
      : 0;
    const maxSato = sato.length
      ? Math.max(...valuesSato) // 最大の単一ラウンドSATO変動
      : 0;

    // --- 新規: 対戦相手をグループ化したデータ ---
    const groupedOpponents: {
      roundId: string;
      roomId: string;
      date: string;
      participants: {
        uid: string;
        displayName: string;
        iconUrl: string | null;
        score: number;
      }[];
    }[] = pon
      .map((round) => {
        // `created_at` が存在すればそれを使用、なければ現在の時刻をフォールバックとして使用
        const date = round.created_at
          ? new Date(round.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "Unknown Date";
        const participants = round.points.map((point: any) => {
          const user = userList.find((u) => u.uid === point.uid);
          return {
            uid: point.uid,
            displayName: user?.display_name || "Unknown User",
            iconUrl: user?.icon_url || null,
            score: point.value,
          };
        });
        return {
          roundId: round.round_id,
          roomId: round.room_id,
          date: date,
          participants: participants,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // 最新のものを上位にソート

    // 計算されたすべてのメトリクスを一つのオブジェクトとして返す
    return {
      ponRounds,
      wins,
      totalPonPts,
      winRate,
      avgPonPts,
      maxPon,
      minPon,
      bestStreak,
      satoIn,
      satoOut,
      satoNet,
      avgSato,
      maxSato,
      groupedOpponents, // 新しく追加した対戦相手データ
    };
  }, [userPointHistory, me, userList]); // userListも依存配列に含める
  useEffect(() => {
    if (token) {
      api
        .getUserPointHistory(token)
        .then((history) => {
          console.log("User Point History:", history);
        })
        .catch((error) => {
          console.error("Failed to fetch user point history:", error);
        });
    }
  }, [token]); // token が変更された時にこの処理が実行されます
  // New logic to handle Firebase auth state and user setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/");
        return;
      }
      try {
        const idToken = await user.getIdToken();
        setToken(idToken);

        // 既存ユーザー API 取得
        try {
          const appUser = await api.getMe(idToken);
          setMe(appUser);
        } catch {
          // ユーザーが存在しなければ作成
          const newUser = await api.createUser(idToken, {
            display_name: user.displayName || user.email!.split("@")[0],
            email: user.email!,
            icon_url: user.photoURL ?? "",
          });
          setMe(newUser);
        }
      } catch (err) {
        console.error("ユーザー情報の取得・作成に失敗", err);
      } finally {
        // 認証まわりの初期化は一度だけ
        setInitializing(false);
      }
    });

    return () => unsubscribe();
  }, [router]);
  useEffect(() => {
    if (showProfileModal) {
      setEditedName(me?.display_name || "");
      setIsEditingName(false);
    }
  }, [showProfileModal, me?.display_name]);
  useEffect(() => {
    const off = onEvent((ev) => {
      switch (ev.type) {
        case "user_entered":
        case "user_left":
        case "join_request":
        case "join_request_cancelled":
        case "join_rejected":
        case "join_approved":
          setMsg((m) => m + "x");
          break;
        default:
          break;
      }
    });
    return off;
  }, [onEvent]);

  useEffect(() => {
    if (!token) return;
    api.listRooms(token).then(setRooms);
  }, [token, msg]);

  useEffect(() => {
    if (!token) return;
    api.getAllRooms(token).then(setAllRooms);
  }, [token, msg]);

  useEffect(() => {
    rooms.forEach((r) => subscribePresence(r.room_id));
    return () => {
      rooms.forEach((r) => unsubscribePresence(r.room_id));
    };
  }, [rooms, subscribePresence, unsubscribePresence]);

  const handleCreateRoom = async () => {
    if (!newRoom.name) {
      setFormError("ルーム名を入力してください");
      return;
    }
    if (newRoom.name.length > 20) {
      setFormError("ルーム名は20文字以内で入力してください");
      return;
    }
    if (newRoom.description.length > 100) {
      setFormError("説明は100文字以内で入力してください");
      return;
    }
    setFormError(null);
    await api.createRoom(token, newRoom);
    setNewRoom({ name: "", description: "" });
    setShowCreateModal(false);
    setMsg("new-room");
  };

  const joinedRooms = rooms;
  const availableRooms = allRooms.filter(
    (r) => !rooms.some((x) => x.room_id === r.room_id)
  );
  const q = searchQuery.trim().toLowerCase();

  const filteredJoined = joinedRooms.filter((r) => {
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) || r.room_id.toLowerCase().includes(q)
    );
  });

  const filteredAll = availableRooms.filter((r) => {
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) || r.room_id.toLowerCase().includes(q)
    );
  });

  const myRooms = rooms.filter((r) => r.created_by === me?.uid);
  const StatItem = ({
    icon,
    label,
    value,
    color,
  }: {
    icon: string;
    label: string;
    value: string | number;
    color: string;
  }) => (
    <div className="flex flex-col items-center bg-gray-900/60 rounded-lg p-3 border border-gray-700/50 shadow-inner">
      <span className={`material-symbols-outlined text-2xl ${color}`}>
        {icon}
      </span>
      <span className="mt-1 text-lg font-semibold text-white">{value}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );

  if (initializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }
  if (!token || !me)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading…</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100">
      {/* Header */}
      <header
        className={`relative backdrop-blur-lg bg-gray-900/60 border-b border-gray-700/40 ${styles.headerBackground}`}
      >
        <div className="max-w-7xl  mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            {/* 左側: SATOPON ロゴと status */}
            <div className="flex items-center space-x-4">
              <Link
                href="https://sites.google.com/view/jsato/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <h1 className="text-xl font-bold text-white bg-clip-text text-transparent cursor-pointer hover:underline">
                  SATOPON
                </h1>
              </Link>
              {!wsReady && (
                <p className="text-xs text-yellow-400 animate-pulse">
                  Connecting…
                </p>
              )}
            </div>

            {/* 右側: GitHub + Avatar */}
            <div className="flex items-center space-x-4">
              {/* GitHub */}
              <Link
                href="https://github.com/raimu38/satopon"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition"
                title="View source on GitHub"
              >
                <span className="material-symbols-outlined text-[24px]">
                  code
                </span>
              </Link>

              {/* Avatar */}
              <div className="relative">
                <button
                  onClick={() => setShowProfileModal(true)}
                  className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-600 hover:border-gray-800 transition-all duration-700"
                >
                  {me.icon_url ? (
                    <img
                      src={me.icon_url}
                      alt={me.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {me.display_name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 min-h-[80vh] flex flex-col justify-center">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Home</h1>
        </header>

        <div className="grid grid-cols-1 gap-6 h-full">
          <div
            onClick={() => setShowRoomModal(true)}
            className="group cursor-pointer bg-gradient-to-br from-gray-800/50 to-gray-700/30 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50 hover:border-blue-500/50 transition-all duration-300 hover:scale-101 hover:shadow-2xl hover:shadow-blue-500/20 h-full flex flex-col justify-between"
          >
            {/* 通知バッジ */}
            {rooms.some((r) => r.pending_members?.length > 0) && (
              <div className="absolute top-4 right-4 flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-yellow-400 text-xs font-medium">
                  Request
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center group-hover:scale-101 transition-transform duration-300">
                  <span className="material-symbols-outlined text-white text-[28px]">
                    meeting_room
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Room List
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Browse and manage rooms
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-blue-400">
                {rooms.length}
              </span>
              <span className="text-gray-400 text-sm">Joined Rooms</span>
            </div>
          </div>
        </div>
      </main>

      {/* Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
          <div
            className={`
             w-full h-full max-w-full
              overflow-hidden bg-gray-900/95 border border-gray-700/50 shadow-2xl
              rounded-2xl
              sm:max-w-[95%] lg:max-w-4xl
              sm:h-full lg:h-full
              ${styles.modalSlideUp}
           `}
          >
            <div className="max-w-4xl w-full h-full flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-gray-700/50 bg-gray-800/30">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-3xl font-bold text-white tracking-wide">
                    SATOPON
                  </h2>
                  <button
                    onClick={() => setShowRoomModal(false)}
                    className="w-10 h-10 hover:bg-gray-700/60 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105"
                    title="Close"
                  >
                    <span className="material-symbols-outlined text-gray-300 text-[22px]">
                      close
                    </span>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex space-x-2">
                  {[
                    {
                      key: "joined",
                      label: `Joined`,
                      count: joinedRooms.length,
                    },
                    {
                      key: "all",
                      label: `All Rooms`,
                      count: availableRooms.length,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() =>
                        setRoomModalTab(tab.key as typeof roomModalTab)
                      }
                      className={`
                        relative px-6 py-3 rounded-lg text-sm font-medium
                        transition-all duration-300 ease-out
                        ${
                          roomModalTab === tab.key
                            ? "bg-gray-700/80 text-white shadow-lg"
                            : "text-gray-400 hover:text-white hover:bg-gray-700/40"
                        }
                      `}
                    >
                      <span className="relative z-10">{tab.label}</span>
                      {tab.count > 0 && (
                        <span
                          className={`
                          ml-2 px-2 py-0.5 text-xs rounded-full
                          ${
                            roomModalTab === tab.key
                              ? "bg-blue-500/30 text-blue-200"
                              : "bg-gray-600/50 text-gray-300"
                          }
                        `}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {/* ─── 検索バー ─── */}
              <div className="w-full pb-0">
                {/* 入力欄をカード風に囲む */}
                <div className="bg-gray-800/40 p-2 flex items-center">
                  <span className="material-symbols-outlined text-gray-400 mr-2">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or ID"
                    className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* content */}
              <div className="p-6 overflow-y-auto h-full flex-1 scrollbar-hide">
                {roomModalTab === "joined" && (
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {filteredJoined.length > 0 ? (
                      filteredJoined.map((r) => {
                        const count = onlineUsers[r.room_id]?.size ?? 0;
                        const hasPending = r.pending_members?.length > 0;
                        const isOwner = r.created_by === me.uid;
                        return (
                          <Link
                            key={r.room_id}
                            href={`/rooms/${r.room_id}`}
                            className={`
                group block p-5 rounded-xl transition-all duration-300 border
                hover:scale-[1.02] hover:shadow-lg
                ${
                  isOwner
                    ? "border-blue-400/40 bg-gradient-to-r from-blue-500/10 to-blue-600/5 hover:from-blue-500/15 hover:to-blue-600/10"
                    : "border-gray-600/40 bg-gray-800/30 hover:bg-gray-700/40"
                }
              `}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center space-x-4">
                                <div
                                  className={`
                      w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg
                      ${
                        isOwner
                          ? "bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg"
                          : "bg-gradient-to-br from-gray-600 to-gray-700"
                      }
                    `}
                                >
                                  {r.name.charAt(0)}
                                </div>
                                <div>
                                  <h3 className="font-semibold text-white text-lg sm:text-base">
                                    {r.name}
                                  </h3>
                                  <div className="flex items-center space-x-2 text-gray-400 text-sm sm:text-xs">
                                    <span>ID: {r.room_id}</span>
                                    {isOwner && (
                                      <span
                                        className="material-symbols-outlined text-blue-300 text-[18px] opacity-80 group-hover:opacity-100 transition-opacity"
                                        title="Owner"
                                      >
                                        shield_person
                                      </span>
                                    )}
                                    {hasPending && (
                                      <span className="px-2 py-0.5 rounded-full bg-yellow-400/20 border border-yellow-400/30 text-yellow-300">
                                        Request
                                      </span>
                                    )}
                                    {count > 0 ? (
                                      <span className="px-2 py-0.5 rounded-full bg-green-400/20 border border-green-400/30 text-green-300">
                                        {count} Online
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full bg-gray-600/20 border border-gray-600/30 text-gray-400">
                                        Offline
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      })
                    ) : (
                      <div className="text-center py-16">
                        <p className="text-gray-400">
                          No rooms match “{searchQuery}”.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {roomModalTab === "all" && (
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {filteredAll.length > 0 ? (
                      filteredAll.map((r) => {
                        const pending = r.pending_members?.some(
                          (m: any) => m.uid === me.uid
                        );
                        return (
                          <div
                            key={r.room_id}
                            className="p-5 bg-gray-800/40 rounded-xl border border-gray-600/40 hover:bg-gray-700/50 transition-all duration-300"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-br from-gray-600 to-gray-700 text-white text-lg font-bold shadow-lg">
                                  {r.name.charAt(0)}
                                </div>
                                <div className="space-y-1">
                                  <h3 className="text-white font-semibold text-lg">
                                    {r.name}
                                  </h3>
                                  <p className="text-gray-400 text-sm font-mono">
                                    ID: {r.room_id}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center space-x-3">
                                {pending ? (
                                  <button
                                    onClick={async () => {
                                      await api.cancelJoinRequest(
                                        token,
                                        r.room_id
                                      );
                                      setMsg("cancel-req");
                                    }}
                                    className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 hover:bg-yellow-500/30 transition-all duration-200 hover:scale-105"
                                    title="Cancel Request"
                                  >
                                    <span className="material-symbols-outlined text-yellow-400 text-[20px] animate-pulse">
                                      pending
                                    </span>
                                    <span className="text-yellow-300 text-sm font-medium">
                                      Pending
                                    </span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      await api.joinRoom(token, r.room_id);
                                      setMsg("join-req");
                                    }}
                                    className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all duration-200 hover:scale-105"
                                    title="Request to Join"
                                  >
                                    <span className="material-symbols-outlined text-emerald-400 text-[20px]">
                                      add_circle
                                    </span>
                                    <span className="text-emerald-300 text-sm font-medium">
                                      Join
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-16">
                        <p className="text-gray-400">
                          No rooms match “{searchQuery}”.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Create Room Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4"
        >
          <div
            className={`
              w-full h-full max-w-full rounded-none overflow-hidden
              bg-gray-800/80 border border-gray-600 sm:rounded-2xl shadow-2xl backdrop-blur-xl
              sm:max-w-[95%] sm:h-[95vh]
              lg:max-w-4xl lg:h-[90vh]
              ${styles.modalSlideUp}
              p-6 sm:p-8 lg:p-10 flex flex-col overflow-y-auto
            `}
          >
            {/* Close ボタン */}
            <button
              onClick={() => {
                setShowCreateModal(false);
                setFormError(null);
              }}
              aria-label="Close modal"
              className="absolute top-4 right-4 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full p-2"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>

            {/* ヘッダー */}
            <header className="flex items-center mb-6">
              <span className="material-symbols-outlined text-blue-400 text-3xl mr-3">
                add_circle
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
                Create New Room
              </h2>
            </header>

            {/* 入力フォーム */}
            <form className="flex-1 space-y-6">
              <div>
                <label
                  htmlFor="room-name"
                  className="block text-gray-300 text-sm font-medium mb-2"
                >
                  Room Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="room-name"
                  type="text"
                  placeholder="Enter room name"
                  value={newRoom.name}
                  maxLength={20}
                  onChange={(e) => {
                    setNewRoom({ ...newRoom, name: e.target.value });
                    setFormError(null);
                  }}
                  className="w-full px-4 py-3 bg-gray-900/60 text-white placeholder-gray-400 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 shadow-inner"
                />
                <p className="text-gray-400 text-xs mt-1 text-right">
                  {newRoom.name.length} / 20
                </p>
              </div>

              <div>
                <label
                  htmlFor="room-description"
                  className="block text-gray-300 text-sm font-medium mb-2"
                >
                  Description
                </label>
                <textarea
                  id="room-description"
                  placeholder="Enter a brief description for your room"
                  value={newRoom.description}
                  maxLength={100}
                  rows={4}
                  onChange={(e) => {
                    setNewRoom({ ...newRoom, description: e.target.value });
                    setFormError(null);
                  }}
                  className="w-full px-4 py-3 bg-gray-900/60 text-white placeholder-gray-400 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 resize-none shadow-inner"
                />
                <p className="text-gray-400 text-xs mt-1 text-right">
                  {newRoom.description.length} / 100
                </p>
              </div>

              {formError && (
                <p className="text-red-400 text-sm mt-2 text-center">
                  {formError}
                </p>
              )}
            </form>

            {/* アクションボタン */}
            <div className="flex space-x-4 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setFormError(null);
                }}
                className="flex-1 px-5 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200 font-medium shadow"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoom}
                className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all duration-200 font-bold shadow-lg hover:shadow-xl"
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm w-full h-full flex items-center justify-center z-50 animate-fade-in-up">
          {/* Main Modal Container: 常に全画面表示 */}
          <div className="relative w-full h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            {/* Close Button */}
            <div className="absolute top-4 right-4 z-20">
              <button
                onClick={() => setShowProfileModal(false)}
                className="w-12 h-12 bg-gray-800/80 hover:bg-gray-700/80 rounded-full flex items-center justify-center transition-all duration-300 backdrop-blur-sm border border-gray-600/50 hover:border-gray-500/50 shadow-lg animate-pop"
                title="Close"
              >
                <span className="material-symbols-outlined text-white text-2xl">
                  close
                </span>
              </button>
            </div>

            {/* Header Section: 旧レイアウト ＋ 新統計スタイル */}
            <div className="p-6 sm:p-8 border-b border-gray-700/50">
              <div className="flex items-center space-x-4 sm:space-x-6">
                {/* Avatar */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-700 overflow-hidden border-4 border-gray-600/50 shadow-lg flex-shrink-0">
                  {me.icon_url ? (
                    <img
                      src={me.icon_url}
                      alt={me.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-bold text-3xl">
                      {me.display_name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* User Info & Stats Container */}
                <div className="flex-grow min-w-0">
                  {isEditingName ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        maxLength={50}
                        className="w-full bg-gray-800/50 border border-gray-600/50 rounded-xl px-4 py-2 text-white text-lg placeholder-gray-400 focus:outline-none focus:border-blue-500/50"
                        placeholder="Enter display name"
                      />
                      <div className="flex space-x-3">
                        <button
                          onClick={async () => {
                            const t = editedName.trim();
                            // 名前が空、または変更がない場合は何もしない
                            if (!t || t === me.display_name) {
                              setIsEditingName(false);
                              return;
                            }
                            try {
                              await api.updateMe(token, { display_name: t });
                              setMe({ ...me, display_name: t }); // フロントエンドの状態も更新
                            } catch (err) {
                              console.error("Failed to update name:", err);
                              // ここでエラーメッセージをユーザーに表示することも可能です
                            } finally {
                              setIsEditingName(false); // 成功・失敗にかかわらず編集モードを閉じる
                            }
                          }}
                          className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium"
                        >
                          <span className="material-symbols-outlined text-lg">
                            check_circle
                          </span>
                          <span>Save</span>
                        </button>
                        <button
                          onClick={() => {
                            setEditedName(me.display_name); // 変更をリセット
                            setIsEditingName(false);
                          }}
                          className="flex items-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-medium"
                        >
                          <span className="material-symbols-outlined text-lg">
                            cancel
                          </span>
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2
                        className="text-2xl sm:text-3xl font-bold text-white mb-1 cursor-pointer hover:text-blue-400 transition-colors truncate"
                        onClick={() => setIsEditingName(true)}
                        title="Click to edit display name"
                      >
                        {me.display_name}
                      </h2>
                      <p className="text-gray-400 text-sm sm:text-base mb-3 truncate">
                        {me.email}
                      </p>

                      {/* Quick Stats: 新しいスタイルを適用 */}
                      <div className="flex flex-wrap items-center gap-2">
                        {" "}
                        {/* gapを縮小 */}
                        <div className="flex items-center space-x-1.5 bg-blue-900/30 px-2.5 py-1 rounded-full border border-blue-700/30">
                          {" "}
                          {/* paddingとspaceを縮小 */}
                          <span className="material-symbols-outlined text-blue-400 text-base">
                            meeting_room
                          </span>{" "}
                          {/* text-lg から text-baseへ */}
                          <span className="text-white font-semibold text-sm">
                            {rooms.length}
                          </span>{" "}
                          {/* 文字サイズをsmに */}
                          <span className="text-blue-200 text-xs">
                            Rooms
                          </span>{" "}
                          {/* 文字サイズをxsに */}
                        </div>
                        <div className="flex items-center space-x-1.5 bg-green-900/30 px-2.5 py-1 rounded-full border border-green-700/30">
                          <span className="material-symbols-outlined text-green-400 text-base">
                            add_box
                          </span>
                          <span className="text-white font-semibold text-sm">
                            {myRooms.length}
                          </span>
                          <span className="text-green-200 text-xs">
                            Created
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5 bg-purple-900/30 px-2.5 py-1 rounded-full border border-purple-700/30">
                          <span className="material-symbols-outlined text-purple-400 text-base">
                            people
                          </span>
                          <span className="text-white font-semibold text-sm">
                            {Object.values(onlineUsers).reduce(
                              (s, u) => s + u.size,
                              0
                            )}
                          </span>
                          <span className="text-purple-200 text-xs">
                            Online
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tab Navigation: スマホでラベルを非表示にする修正 */}
            <div className="flex border-b border-gray-700/50 bg-gray-800/20">
              {[
                {
                  id: "overview",
                  label: "Overview",
                  icon: "dashboard",
                  color: "blue",
                },
                {
                  id: "recent_battles",
                  label: "PON",
                  icon: "leaderboard",
                  color: "purple",
                },
                {
                  id: "sato_transactions",
                  label: "SATO",
                  icon: "payments",
                  color: "emerald",
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  // flex-1でスマホ時に均等幅に、sm以上でpaddingを調整
                  className={`flex flex-1 sm:flex-none items-center justify-center space-x-2 px-2 sm:px-6 py-4 border-b-2 transition-all duration-300 font-medium ${
                    activeTab === tab.id
                      ? `border-${tab.color}-500 text-${tab.color}-400 bg-${tab.color}-900/20`
                      : "border-transparent text-gray-400 hover:text-white hover:bg-gray-700/30"
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">
                    {tab.icon}
                  </span>
                  {/* sm以上の画面でのみラベルを表示 */}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              <div className="p-6 sm:p-8">
                {/* Overview Tab Content: 改善版 */}
                {activeTab === "overview" && (
                  <div className="space-y-8 animate-fade-in-up">
                    {/* Layout: Pie on left, stats cards on right (2-col on PC, 1-col on mobile) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* ─── Pie Chart ─── */}
                      <div className="bg-gradient-to-br from-gray-800/60 to-gray-700/30 p-6 rounded-2xl border border-gray-700/50">
                        <div className="flex items-center space-x-3 mb-6">
                          <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-blue-400 text-xl">
                              pie_chart
                            </span>
                          </div>
                          <h3 className="text-2xl font-bold text-white">
                            Win/Loss Ratio
                          </h3>
                        </div>
                        <div className="w-full h-64 relative">
                          {stats.ponRounds > 0 ? (
                            <>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={[
                                      { name: "Wins", value: stats.wins },
                                      {
                                        name: "Losses",
                                        value: stats.ponRounds - stats.wins,
                                      },
                                    ]}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    dataKey="value"
                                    stroke="none"
                                    paddingAngle={3}
                                  >
                                    <Cell fill="#3B82F6" />
                                    <Cell fill="#EF4444" />
                                  </Pie>
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: "rgba(31,41,55,0.8)",
                                      backdropFilter: "blur(4px)",
                                      border: "1px solid rgba(75,85,99,0.5)",
                                      borderRadius: "0.75rem",
                                      color: "#FFF",
                                    }}
                                    cursor={{ fill: "rgba(255,255,255,0.1)" }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-4xl font-bold text-white">
                                  {stats.winRate}%
                                </span>
                                <span className="text-gray-400 text-sm">
                                  Win Rate
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                              <span className="material-symbols-outlined text-6xl">
                                pie_chart_outlined
                              </span>
                              <p className="mt-4">No games played yet</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ─── Stats Cards ─── */}
                      {/* ─── Stats Cards ─── */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {[
                          {
                            icon: "crossword",
                            value: stats.ponRounds,
                            label: "Total Games",
                          },
                          {
                            icon: "emoji_events",
                            value: `${stats.winRate}%`,
                            label: "Win Rate",
                          },
                          {
                            icon: "whatshot",
                            value: stats.bestStreak,
                            label: "Best Streak",
                          },
                          {
                            icon: "leaderboard",
                            value: stats.totalPonPts,
                            label: "Total Points",
                          },
                          {
                            icon: "functions",
                            value: stats.avgPonPts,
                            label: "Average Score",
                          },
                          {
                            icon: "swap_vert",
                            value: `${stats.maxPon} / ${stats.minPon}`,
                            label: "Max / Min Score",
                          },
                        ].map((stat, i) => {
                          // グラデーションを適用するカードのインデックス
                          const specialIndices = [0, 2, 4];
                          const isSpecial = specialIndices.includes(i);

                          const specialBg = [
                            "from-blue-800/40 to-blue-600/20 border-blue-500/30",
                            "from-green-800/40 to-green-600/20 border-green-500/30",
                            "from-purple-800/40 to-purple-600/20 border-purple-500/30",
                          ][specialIndices.indexOf(i) % 3];

                          const baseClass = isSpecial
                            ? `bg-gradient-to-br ${specialBg}`
                            : "bg-gray-800/50 border-gray-700/50";

                          return (
                            <div
                              key={stat.label}
                              className={`${baseClass} p-4 rounded-2xl border shadow-md`}
                            >
                              <div className="text-center space-y-2">
                                <span className="material-symbols-outlined text-3xl text-white">
                                  {stat.icon}
                                </span>
                                <div className="text-2xl font-bold text-white">
                                  {stat.value}
                                </div>
                                <div className="text-gray-300 text-sm font-medium">
                                  {stat.label}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* PON Tab Content */}
                {activeTab === "recent_battles" && (
                  <div className="space-y-8 animate-fade-in-up">
                    {/* Header */}
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-purple-400 text-xl">
                          leaderboard
                        </span>
                      </div>
                      <h3 className="text-2xl font-bold text-white">
                        Recent PON
                      </h3>
                    </div>

                    {/* 履歴リストとグラフを左右並びにするグリッド */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* ─── 履歴リスト ─── */}
                      {stats.groupedOpponents.length > 0 ? (
                        <div className="space-y-4">
                          {stats.groupedOpponents
                            .slice(0, 10)
                            .map((round, index) => (
                              <Link
                                key={index}
                                href={`/rooms/${round.roomId}`}
                                className="block bg-gradient-to-r from-gray-800/60 to-gray-700/30 p-6 rounded-xl border border-gray-700/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300"
                              >
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
                                  <div className="flex items-center space-x-4">
                                    <div className="flex items-center space-x-2 text-gray-400">
                                      <span className="material-symbols-outlined text-sm">
                                        schedule
                                      </span>
                                      <span className="text-sm font-medium">
                                        {round.date}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                      {round.participants.map((p) => (
                                        <div
                                          key={p.uid}
                                          className="flex items-center space-x-2 bg-gray-700/50 px-3 py-1.5 rounded-full border border-gray-600/50"
                                        >
                                          <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-gray-500">
                                            {p.iconUrl ? (
                                              <img
                                                src={p.iconUrl}
                                                alt={p.displayName}
                                                className="w-full h-full object-cover"
                                              />
                                            ) : (
                                              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                                                {p.displayName
                                                  .charAt(0)
                                                  .toUpperCase()}
                                              </div>
                                            )}
                                          </div>
                                          <span
                                            className={`font-bold text-sm ${
                                              p.score > 0
                                                ? "text-emerald-400"
                                                : p.score < 0
                                                  ? "text-red-400"
                                                  : "text-gray-400"
                                            }`}
                                          >
                                            {p.score > 0
                                              ? `+${p.score}`
                                              : p.score}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2 text-purple-400">
                                    <span>Go Room</span>
                                    <span className="material-symbols-outlined text-lg">
                                      arrow_forward
                                    </span>
                                  </div>
                                </div>
                              </Link>
                            ))}
                          {stats.groupedOpponents.length > 10 && (
                            <div className="text-center pt-4">
                              <button className="text-blue-400 hover:text-blue-300 font-semibold">
                                Show More
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-20 col-span-full">
                          <div className="w-20 h-20 mx-auto mb-6 bg-gray-700/30 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-gray-400 text-3xl">
                              leaderboard
                            </span>
                          </div>
                          <h4 className="text-xl font-semibold text-white mb-2">
                            No PON yet
                          </h4>
                          <p className="text-gray-400">
                            Join a room and start playing to see your battle
                            history!
                          </p>
                        </div>
                      )}

                      {/* ─── Performance Timeline ─── */}
                      <div className="bg-gradient-to-br from-gray-800/60 to-gray-700/30 p-8 rounded-2xl border border-gray-700/50 backdrop-blur-sm">
                        <div className="flex items-center space-x-3 mb-6">
                          <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-purple-400 text-xl">
                              show_chart
                            </span>
                          </div>
                          <h3 className="text-2xl font-bold text-white">
                            Performance Timeline
                          </h3>
                        </div>
                        {performanceData.length > 1 ? (
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={performanceData}
                                margin={{
                                  top: 5,
                                  right: 20,
                                  left: -10,
                                  bottom: 5,
                                }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#374151"
                                />
                                <XAxis dataKey="round" stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: "rgba(31, 41, 55, 0.8)",
                                    backdropFilter: "blur(4px)",
                                    border: "1px solid rgba(75, 85, 99, 0.5)",
                                    borderRadius: "0.75rem",
                                    color: "#FFFFFF",
                                  }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="score"
                                  stroke="#A78BFA"
                                  strokeWidth={3}
                                  dot={{ fill: "#8B5CF6", r: 4 }}
                                  activeDot={{
                                    r: 7,
                                    stroke: "#A78BFA",
                                    fill: "#A78BFA",
                                  }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="text-center py-20 text-gray-400">
                            <span className="material-symbols-outlined text-4xl">
                              show_chart
                            </span>
                            <p className="mt-4">
                              At least 2 games needed to show performance chart.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* SATO Transactions Tab Content */}
                {activeTab === "sato_transactions" && (
                  <div className="space-y-8 animate-fade-in-up">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-emerald-400 text-xl">
                          payments
                        </span>
                      </div>
                      <h3 className="text-2xl font-bold text-white">
                        SATO Transactions
                      </h3>
                    </div>

                    {userPointHistory.filter((r) =>
                      r.round_id.startsWith("SATO")
                    ).length > 0 ? (
                      <div className="space-y-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                          {[
                            {
                              icon: "trending_up",
                              value: stats.satoIn,
                              label: "Total Received",
                              color: "emerald",
                            },
                            {
                              icon: "trending_down",
                              value: stats.satoOut,
                              label: "Total Sent",
                              color: "rose",
                            },
                            {
                              icon: "account_balance",
                              value: stats.satoNet,
                              label: "Net Balance",
                              color: "blue",
                            },
                          ].map((stat) => (
                            <div
                              key={stat.label}
                              className={`bg-gradient-to-br from-${stat.color}-900/40 to-${stat.color}-700/20 p-6 rounded-2xl border border-${stat.color}-600/30 backdrop-blur-sm hover:shadow-xl transition-all duration-300`}
                            >
                              <div className="text-center space-y-3">
                                <div
                                  className={`w-16 h-16 mx-auto bg-${stat.color}-500/20 rounded-full flex items-center justify-center`}
                                >
                                  <span
                                    className={`material-symbols-outlined text-${stat.color}-400 text-3xl`}
                                  >
                                    {stat.icon}
                                  </span>
                                </div>
                                <div className="text-3xl font-bold text-white">
                                  {stat.value}
                                </div>
                                <div
                                  className={`text-${stat.color}-200 text-sm font-medium`}
                                >
                                  {stat.label}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="bg-gradient-to-br from-gray-800/60 to-gray-700/30 p-8 rounded-2xl border border-gray-700/50 backdrop-blur-sm">
                          <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-emerald-400 text-xl">
                                receipt_long
                              </span>
                            </div>
                            <h4 className="text-2xl font-bold text-white">
                              Transaction History
                            </h4>
                          </div>
                          <div className="space-y-4">
                            {userPointHistory
                              .filter((r) => r.round_id.startsWith("SATO"))
                              .slice(0, 10)
                              .map((round) => {
                                const myPoint = round.points.find(
                                  (p) => p.uid === me.uid
                                );
                                const isPositive = myPoint && myPoint.value > 0;
                                const date = new Date(
                                  round.created_at || Date.now()
                                ).toLocaleString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                                const otherParticipants = round.points
                                  .filter((p) => p.uid !== me.uid)
                                  .map(
                                    (p) =>
                                      userList.find((u) => u.uid === p.uid)
                                        ?.display_name || "Unknown"
                                  )
                                  .join(", ");

                                return (
                                  <div
                                    key={round.round_id}
                                    className={`p-4 rounded-xl border ${isPositive ? "bg-emerald-900/30 border-emerald-700/40" : "bg-rose-900/30 border-rose-700/40"}`}
                                  >
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                                      <div className="flex-grow mb-2 sm:mb-0">
                                        <span className="font-bold text-white">
                                          SATO Transfer
                                        </span>
                                        <p className="text-gray-300 text-sm">
                                          {date}
                                        </p>
                                        {otherParticipants && (
                                          <p className="text-gray-300 text-sm mt-1">
                                            To/From:{" "}
                                            <span className="font-medium text-gray-200">
                                              {otherParticipants}
                                            </span>
                                          </p>
                                        )}
                                      </div>
                                      <span
                                        className={`text-2xl font-extrabold ${isPositive ? "text-green-400" : "text-red-400"}`}
                                      >
                                        {myPoint
                                          ? myPoint.value > 0
                                            ? `+${myPoint.value}`
                                            : myPoint.value
                                          : "N/A"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            {userPointHistory.filter((r) =>
                              r.round_id.startsWith("SATO")
                            ).length > 10 && (
                              <div className="text-center pt-4">
                                <button className="text-blue-400 hover:text-blue-300 font-semibold">
                                  Show More
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-20">
                        <div className="w-20 h-20 mx-auto mb-6 bg-gray-700/30 rounded-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-gray-400 text-3xl">
                            credit_card_off
                          </span>
                        </div>
                        <h4 className="text-xl font-semibold text-white mb-2">
                          No SATO transactions found
                        </h4>
                        <p className="text-gray-400">
                          Your SATO transaction history will appear here.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer.tsx */}
      <footer className="fixed bottom-0 inset-x-0 bg-gray-900/90 border-t border-gray-300/20 backdrop-blur-lg z-0">
        <div className="max-w-lg mx-auto flex justify-between items-center py-2 px-6 text-white relative">
          {/* Active Users */}
          <div className="flex items-center space-x-1 text-green-400 text-xs bg-gray-700/30 px-2 py-1 rounded-full backdrop-blur-sm">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span>
              {Object.values(onlineUsers).reduce(
                (sum, users) => sum + users.size,
                0
              )}
            </span>
          </div>

          {/* Center Floating + Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            title="Create Room"
            className={`
          absolute -top-6 left-1/2 transform -translate-x-1/2
          w-14 h-14 rounded-full
          ${styles.createButtonBackground}
          border border-white/20
          backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.25)]
          text-white transition-all duration-300
          flex items-center justify-center
          `}
          >
            <span className="material-symbols-outlined text-[28px]">add</span>
          </button>
          {/* Profile Button - ガラス感 + カラフル */}
        </div>
      </footer>
    </div>
  );
}
