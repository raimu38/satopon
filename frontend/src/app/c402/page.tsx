// app/c402/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as api from "@/lib/api";
import { usePresence } from "@/context/PresenceContext";
import styles from "./Header.module.css";

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

  // Modal states
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [roomModalTab, setRoomModalTab] = useState<
    "joined" | "created" | "all"
  >("joined");

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

  useEffect(() => {
    const off = onEvent((ev) => {
      switch (ev.type) {
        case "user_entered":
        case "user_left":
        case "join_request":
        case "join_request_cancelled":
        case "join_approved":
          setMsg((m) => m + "x");
          break;
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

  const handleCreateRoom = async () => {
    if (!newRoom.name) {
      alert("ルーム名を入力してください");
      return;
    }
    if (newRoom.name.length > 20) {
      alert("ルーム名は20文字以内で入力してください");
      return;
    }
    if (newRoom.description.length > 100) {
      alert("説明は100文字以内で入力してください");
      return;
    }
    await api.createRoom(token, newRoom);
    setNewRoom({ name: "", description: "" });
    setShowCreateModal(false);
    setMsg("new-room");
  };

  const myRooms = rooms.filter((r) => r.created_by === me?.uid);
  const joinedRooms = rooms;
  const availableRooms = allRooms.filter(
    (r) => !rooms.some((x) => x.room_id === r.room_id),
  );

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
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-bold text-white bg-clip-text text-transparent">
                  SATOPON
                </h1>
                {!wsReady && (
                  <p className="text-xs text-yellow-400 animate-pulse">
                    Connecting…
                  </p>
                )}
              </div>
            </div>

            {/* Profile Avatar */}
            <div className="relative">
              <button
                onClick={() => setShowProfileModal(true)}
                className="w-10 h-10 rounded-full   overflow-hidden border-2 border-gray-600 hover:border-gray-800 transition-all duration-700 "
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
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Room List Card */}
          <div
            onClick={() => setShowRoomModal(true)}
            className="group cursor-pointer bg-gradient-to-br from-gray-800/50 to-gray-700/30 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50 hover:border-blue-500/50 transition-all duration-300 hover:scale-101 hover:shadow-2xl hover:shadow-blue-500/20"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center group-hover:scale-101 transition-transform duration-300">
                <span className="material-symbols-outlined text-white text-[28px]">
                  meeting_room
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Room List</h3>
                <p className="text-gray-400 text-sm">Browse and manage rooms</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-blue-400">
                {rooms.length}
              </span>
              <span className="text-gray-400 text-sm">Joined Rooms</span>
            </div>
          </div>

          {/* Create Room Card */}
          <div
            onClick={() => setShowCreateModal(true)}
            className="group cursor-pointer bg-gradient-to-br from-green-800/30 to-emerald-700/20 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50 hover:border-green-500/50 transition-all duration-300 hover:scale-101 hover:shadow-2xl hover:shadow-green-500/20"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center group-hover:scale-101 transition-transform duration-300">
                <span className="material-symbols-outlined text-white text-[28px]">
                  add
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Create Room
                </h3>
                <p className="text-gray-400 text-sm">Start a new room</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-green-400 text-sm font-medium">
                New Room
              </span>
              <span className="material-symbols-outlined text-green-400 text-[20px] group-hover:translate-x-1 transition-transform duration-300">
                arrow_forward_ios
              </span>
            </div>
          </div>
          {/* Stats Card */}
          <div className="bg-gradient-to-br from-purple-800/30 to-pink-700/20 backdrop-blur-lg rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[28px]">
                  bolt
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Activity</h3>
                <p className="text-gray-400 text-sm">Online status</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-purple-400">
                {Object.values(onlineUsers).reduce(
                  (sum, users) => sum + users.size,
                  0,
                )}
              </span>
              <span className="text-gray-400 text-sm">Online Users</span>
            </div>
          </div>
        </div>
      </main>

      {/* Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50">
          <div className="w-full h-screen bg-gray-800/5 flex justify-center  ">
            <div className="max-w-3xl w-full h-full flex flex-col">
              <div className="p-6 border-b border-gray-600">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-white">SATORU</h2>
                  <button
                    onClick={() => setShowRoomModal(false)}
                    className="w-8 h-8 hover:bg-gray-800/90 rounded-full flex items-center justify-center transition-colors"
                    title="Close"
                  >
                    <span className="material-symbols-outlined text-white text-[20px]">
                      close
                    </span>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex space-x-3  ">
                  {[
                    { key: "joined", label: `Joined (${joinedRooms.length})` },
                    { key: "all", label: `Rooms (${availableRooms.length})` },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() =>
                        setRoomModalTab(tab.key as typeof roomModalTab)
                      }
                      className={`
        px-4 py-2 rounded-md text-sm font-medium
        transition-colors duration-300 ease-in-out
        ${
          roomModalTab === tab.key
            ? "bg-gray-700/80 text-white"
            : "text-gray-400 hover:text-white hover:bg-gray-700/40"
        }
      `}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 overflow-y-auto h-full flex-1  scrollbar-hide">
                {roomModalTab === "joined" && (
                  <div className="space-y-3 max-w-2xl mx-auto">
                    {joinedRooms.map((r) => {
                      const count = onlineUsers[r.room_id]?.size ?? 0;
                      const hasPending = r.pending_members?.length > 0;
                      const isOwner = r.created_by === me.uid;
                      return (
                        <Link
                          key={r.room_id}
                          href={`/rooms/${r.room_id}`}
                          className={`
        block p-4 rounded-xl transition-colors border w-full
        ${isOwner ? "border-blue-400/30 bg-blue-400/10 hover:bg-blue-400/20" : "border-gray-600/50 hover:bg-gray-600/50"}
      `}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-3">
                              {/* アイコン */}
                              <div className="w-9 h-9 bg-gray-600/60 rounded-full flex items-center justify-center">
                                <span className="text-gray-200 font-semibold text-sm">
                                  {r.name.charAt(0)}
                                </span>
                              </div>
                              <div>
                                <h3 className="font-medium text-white flex items-center gap-1">
                                  <span>{r.name}</span>
                                  {isOwner && (
                                    <span
                                      className="material-symbols-outlined text-blue-300 text-[18px] opacity-70 hover:opacity-100 transition-opacity"
                                      title="Owner"
                                    >
                                      shield_person
                                    </span>
                                  )}
                                </h3>
                                <p className="text-gray-400 text-sm">
                                  ID: {r.room_id}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {/* 申請あり：点滅する黄色い丸 + テキスト */}
                              {hasPending && (
                                <div className="flex items-center space-x-1">
                                  <div
                                    className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"
                                    title="Request"
                                  ></div>
                                  <span className="text-yellow-400 text-sm font-medium">
                                    Join Request
                                  </span>
                                </div>
                              )}
                              {/* 緑のオンライン人数 */}
                              {count > 0 && (
                                <div className="flex items-center space-x-1">
                                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                                  <span className="text-green-400 text-sm">
                                    {count}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {joinedRooms.length === 0 && (
                      <p className="text-gray-500 text-center py-8">
                        No Joined Room. Let's Join!
                      </p>
                    )}
                  </div>
                )}

                {roomModalTab === "all" && (
                  <div className="space-y-3 max-w-2xl mx-auto">
                    {availableRooms.map((r) => {
                      const pending = r.pending_members?.some(
                        (m: any) => m.uid === me.uid,
                      );
                      return (
                        <div
                          key={r.room_id}
                          className="p-4 bg-gray-700/50 rounded-xl border border-gray-600/50"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-600 text-white text-lg font-semibold">
                                {r.name.charAt(0)}
                              </div>
                              <div className="space-y-0.5">
                                <h3 className="text-white font-semibold text-base">
                                  {r.name}
                                </h3>
                                <p className="text-gray-500 text-xs">
                                  ID: {r.room_id}
                                </p>
                              </div>
                            </div>
                            {pending ? (
                              <button
                                onClick={async () => {
                                  await api.cancelJoinRequest(token, r.room_id);
                                  setMsg("cancel-req");
                                }}
                                title="Cancel Request"
                              >
                                <span
                                  className={`
        material-symbols-outlined text-[22px] 
        text-yellow-400 hover:text-yellow-300 
        transition-colors duration-300
        animate-pulse
      `}
                                >
                                  radio_button_checked
                                </span>
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  await api.joinRoom(token, r.room_id);
                                  setMsg("join-req");
                                }}
                                title="Request to Join"
                              >
                                <span
                                  className={`
        material-symbols-outlined text-[22px]
        text-emerald-400 hover:text-emerald-300 
        transition-colors duration-200
      `}
                                >
                                  radio_button_checked
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {availableRooms.length === 0 && (
                      <p className="text-gray-500 text-center py-8">No room</p>
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-gradient-to-br from-gray-800/60 to-gray-700/50 border border-gray-600/40 rounded-2xl shadow-xl backdrop-blur-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Create New Room</h2>
            </div>

            <div className="space-y-5">
              <div>
                <input
                  type="text"
                  placeholder="Enter room name ※"
                  value={newRoom.name}
                  onChange={(e) =>
                    setNewRoom({ ...newRoom, name: e.target.value })
                  }
                  maxLength={20}
                  className="w-full px-4 py-3 bg-gray-800/60 text-white placeholder-gray-400 rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                />
                <p className="text-gray-400 text-xs mt-1">
                  {newRoom.name.length} / 20
                </p>
              </div>

              <div>
                <textarea
                  placeholder="Enter description"
                  value={newRoom.description}
                  onChange={(e) =>
                    setNewRoom({ ...newRoom, description: e.target.value })
                  }
                  maxLength={100}
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-800/60 text-white placeholder-gray-400 rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition resize-none"
                />
                <p className="text-gray-400 text-xs mt-1">
                  {newRoom.description.length} / 100
                </p>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRoom}
                  className="flex-1 px-4 py-3 bg-green-700 hover:bg-green-600 text-white rounded-md shadow-md hover:shadow-lg transition"
                >
                  Create Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-2xl w-full max-w-md border border-gray-600">
            <div className="p-6">
              <div className="flex justify-end items-center mb-6">
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="w-8 h-8 bg-gray-600 hover:bg-gray-500 rounded-lg flex items-center justify-center transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 overflow-hidden border-4 border-gray-600">
                  {me.icon_url ? (
                    <img
                      src={me.icon_url}
                      alt={me.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                      {me.display_name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {me.display_name}
                </h3>
                <p className="text-gray-400 text-sm">{me.email}</p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                  <span className="text-gray-300">Joined Rooms</span>
                  <span className="text-blue-400 font-semibold">
                    {rooms.length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                  <span className="text-gray-300">Created Rooms</span>
                  <span className="text-green-400 font-semibold">
                    {myRooms.length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                  <span className="text-gray-300">Status</span>
                  <span className="text-green-400 font-semibold flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                    Online
                  </span>
                </div>
              </div>

              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace("/");
                }}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors flex items-center justify-center space-x-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
