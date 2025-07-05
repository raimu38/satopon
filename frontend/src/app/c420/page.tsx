// app/c420/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { signOut } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  // Modal states
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center ">
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

        {showProfileModal && (
          <div className="fixed inset-0 bg-black/20  w-full h-screen flex items-center justify-center z-50 ">
          <div className=" w-full  h-full  backdrop-blur-md">
          <div className="p-6">
          {/* 閉じるボタン */}
          <div className="flex justify-end mb-6">
          <button
          onClick={() => setShowProfileModal(false)}
          className="w-8 h-8  hover:bg-gray-900 rounded-full flex items-center justify-center transition-colors"
          title="Close"
          >
          <span className="material-symbols-outlined text-white text-xl">
          close
          </span>
          </button>
          </div>

          {/* アバターと名前編集 */}
          <div className="text-center mb-8">
          <div
          onClick={() => setIsEditingName(true)}
          className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 overflow-hidden border-4 border-gray-600 cursor-pointer hover:bg-gray-900/80 transition-colors duration-700"
          title="Click to edit display name"
          >
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

          <div className="mx-auto max-w-4xl greid-col-3 p-4 rounded-xl bg-gradient-to-br from-gray-800/30 to-gray-600/20 backdrop-blur-md shadow-md">
          {isEditingName ? (
            <div className="space-y-2">
            <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            maxLength={50}
            className="w-full bg-gray-800/70 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors text-center"
            />
            <div className="flex justify-center space-x-4">
            <button
              onClick={async () => {
                const trimmed = editedName.trim();
               if (trimmed === me.display_name) {
                  setIsEditingName(false);
                  return;
                }
                if (!trimmed) {
                 alert("表示名を入力してください");
                  return;
                }
                await api.updateMe(token, { display_name: trimmed });
                setMe({ ...me, display_name: trimmed });
                setIsEditingName(false);
              }}
            className="text-green-400 hover:text-green-300 transition-colors"
            title="Save"
            >
            <span className="material-symbols-outlined text-[28px]">
            check
            </span>
            </button>
            <button
            onClick={() => {
              setEditedName(me.display_name);
              setIsEditingName(false);
            }}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            title="Cancel"
            >
            <span className="material-symbols-outlined text-[28px]">
            close
            </span>
            </button>
            </div>
            </div>
          ) : (
          <>
          <h3 className="text-xl font-semibold text-white">
          {me.display_name}
          </h3>
          <p className="text-gray-400 text-sm">{me.email}</p>
          </>
          )}
          </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-4xl mx-auto">
          {/* Joined */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-800/30 to-blue-600/20 border border-blue-500/20 backdrop-blur-md shadow-md">
          <div className="flex items-center space-x-3">
          <span className="material-symbols-outlined text-blue-300 text-2xl">
          meeting_room
          </span>
          <div>
          <div className="text-xl font-semibold text-white">
          {rooms.length}
          </div>
          <div className="text-sm text-blue-200">Joined Rooms</div>
          </div>
          </div>
          </div>

          {/* Created */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-green-800/30 to-emerald-600/20 border border-green-500/20 backdrop-blur-md shadow-md">
          <div className="flex items-center space-x-3">
          <span className="material-symbols-outlined text-green-300 text-2xl">
          add_box
          </span>
          <div>
          <div className="text-xl font-semibold text-white">
          {myRooms.length}
          </div>
          <div className="text-sm text-green-200">
          Created Rooms
          </div>
          </div>
          </div>
          </div>

          {/* Active */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-800/30 to-pink-600/20 border border-purple-500/20 backdrop-blur-md shadow-md">
          <div className="flex items-center space-x-3">
          <span className="material-symbols-outlined text-purple-300 text-2xl">
          visibility
          </span>
          <div>
          <div className="text-xl font-semibold text-white">
          {Object.values(onlineUsers).reduce(
            (s, u) => s + u.size,
              0,
          )}
          </div>
          <div className="text-sm text-purple-200">
          Active Users
          </div>
          </div>
          </div>
          </div>
          </div>

          {/* Logout */}
          <button
          onClick={async () => {
            await signOut(auth);
            router.replace("/");
          }}
          className="w-full max-w-4xl mx-auto px-4 py-2 mt-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-200 hover:text-white text-sm font-medium transition-colors flex items-center justify-center space-x-2"
          >
          <span className="material-symbols-outlined text-[20px]">
          logout
          </span>
          <span>Logout</span>
          </button>
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
            0,
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
          <button
          onClick={() => setShowProfileModal(true)}
          title="Profile"
          className="
          px-2.5 py-1.5 rounded-lg
          bg-white/5 hover:bg-white/10
          border border-white/10
          backdrop-blur
          text-white text-sm
          flex items-center gap-1
          transition duration-200
          "
          >
          <span className="material-symbols-outlined text-[18px]">
          person
          </span>
          </button>
          </div>
          </footer>
          </div>
      );
}
