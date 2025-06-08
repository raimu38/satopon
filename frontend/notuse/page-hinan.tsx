// src/app/page.tsx

"use client";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import * as api from "../lib/api";

type Room = any;
type User = any;
type PointRecord = any;
type Settlement = any;

export default function MainPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [roomDetail, setRoomDetail] = useState<Room | null>(null);
  const [pointHistory, setPointHistory] = useState<PointRecord[]>([]);
  const [settleHistory, setSettleHistory] = useState<Settlement[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [newRoom, setNewRoom] = useState({ name: "", color_id: 1 });
  const [pointInputs, setPointInputs] = useState<Record<string, number>>({});
  const [settleInput, setSettleInput] = useState({ to_uid: "", amount: 0 });
  const wsRef = useRef<WebSocket | null>(null);

  const [isRoundActive, setIsRoundActive] = useState(false);
  const [submissions, setSubmissions] = useState<Record<string, number>>({});
  const [submittedBy, setSubmittedBy] = useState<Set<string>>(new Set());
  const [finalTable, setFinalTable] = useState<Record<string, number> | null>(
    null,
  );

  // ルームＩＤと同じく、現在のラウンドＩＤも追う
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);

  const [approvedBy, setApprovedBy] = useState<Set<string>>(new Set());
  // --- 認証 ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token;
      setToken(t ?? null);
    });
  }, []);

  // --- 自分情報/APIユーザー ---
  // src/app/page.tsx
  const [allRooms, setAllRooms] = useState<Room[]>([]);

  // 追加: 全ルーム一覧
  useEffect(() => {
    if (!token) return;
    api.getAllRooms(token).then(setAllRooms);
  }, [token, msg]);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function setupUser() {
      try {
        // まず既存ユーザーを探す
        const me = await api.getMe(token);
        if (!cancelled) setMe(me);
      } catch (e) {
        // いなければ supabase から情報取得し createUser
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) return;
        const display_name =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "";
        const email = user.email;
        const icon_url = user.user_metadata?.avatar_url || "";
        const me = await api.createUser(token, {
          display_name,
          email,
          icon_url,
        });
        if (!cancelled) setMe(me);
      }
    }
    setupUser();
    return () => {
      cancelled = true;
    };
  }, [token]);
  // --- ルーム一覧 ---
  useEffect(() => {
    if (!token) return;
    api.listRooms(token).then(setRooms);
  }, [token, msg]);

  // --- 選択ルーム詳細/履歴 ---
  useEffect(() => {
    if (!token || !currentRoomId) return;
    api.getRoom(token, currentRoomId).then(setRoomDetail);
    api.getPointHistory(token, currentRoomId).then(setPointHistory);
    api.getSettlementHistory(token, currentRoomId).then(setSettleHistory);
  }, [token, currentRoomId, msg]);

  // --- WebSocketリアルタイム通知 ---
  // イベント受信でreloadCountをインクリメント
  const [reloadCount, setReloadCount] = useState(0);
  // --- WebSocket リアルタイム通知 ---
  useEffect(() => {
    if (!token) return;
    // 既存の WS があれば閉じる
    if (wsRef.current) wsRef.current.close();

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws"}?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "point_round_started" && ev.room_id) {
        setCurrentRoomId(ev.room_id);
        setCurrentRoundId(ev.round_id); // ←ここで round_id を state に
        setIsRoundActive(true);
        setSubmissions({});
        setSubmittedBy(new Set());
        setFinalTable(null);
        setApprovedBy(new Set());
        return;
      }
      // ─────────── 参加申請まわり ───────────
      if (ev.type === "join_request_cancelled" && ev.room_id) {
        if (roomDetail?.room_id === ev.room_id) {
          setRoomDetail({
            ...roomDetail,
            pending_members: roomDetail.pending_members.filter(
              (m: any) => m.uid !== ev.user_id,
            ),
          });
        }
        setReloadCount((c) => c + 1);
      }
      if (ev.type === "join_request" && ev.room_id) {
        setCurrentRoomId(ev.room_id);
        setReloadCount((c) => c + 1);
      }
      if (ev.type === "join_approved") {
        setReloadCount((c) => c + 1);
      }

      // ─────────── ポイントラウンドまわり ───────────
      switch (ev.type) {
        case "point_round_started":
          if (ev.room_id === currentRoomId) {
            setIsRoundActive(true);
            setSubmissions({});
            setSubmittedBy(new Set());
            setFinalTable(null);
          }
          break;

        case "point_submitted":
          if (ev.room_id === currentRoomId) {
            // ev.value も一緒に飛んでくるようにバック実装を調整してください
            setSubmissions((s) => ({ ...s, [ev.uid]: ev.value }));
            setSubmittedBy((s) => new Set(s).add(ev.uid));
          }
          break;

        case "point_final_table":
          if (ev.room_id === currentRoomId) {
            setIsRoundActive(false);
            setFinalTable(ev.table);
          }
          break;

        case "point_round_cancelled":
          if (ev.room_id === currentRoomId) {
            alert("ポイントラウンドが中止されました: " + ev.reason);
            setIsRoundActive(false);
            setSubmissions({});
            setSubmittedBy(new Set());
          }
          break;
        case "point_approved":
          if (ev.room_id === currentRoomId) {
            setApprovedBy((s) => {
              const next = new Set(s);
              next.add(ev.uid);
              return next;
            });
          }
          break;
      }
    };

    wsRef.current = ws;
    return () => {
      ws.close();
    };
  }, [token, currentRoomId, roomDetail, currentRoundId]);

  useEffect(() => {
    if (!token || !currentRoomId) {
      return;
    }
    api.getRoom(token, currentRoomId).then((data) => {
      setRoomDetail(data);
    });
    api.getPointHistory(token, currentRoomId).then(setPointHistory);
    api.getSettlementHistory(token, currentRoomId).then(setSettleHistory);
  }, [token, currentRoomId, reloadCount]);

  // --- UI ---
  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          Satopon - ポイント管理
        </h1>
        <button
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: window.location.href },
            });
            if (error) alert("Google認証エラー: " + error.message);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Googleでログイン
        </button>
      </div>
    );
  }

  if (!me)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-700">
        Loading...
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto my-8 bg-white p-6 rounded-lg shadow-xl">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <div className="text-lg font-semibold text-gray-800">
          <b>{me?.display_name}</b> ({me.email})
        </div>
        <button
          onClick={() => {
            supabase.auth.signOut().then(() => {
              location.reload();
            });
          }}
          className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75"
        >
          ログアウト
        </button>
      </div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-gray-800">
          他のルームに参加
        </h2>
        <div className="space-y-2">
          {allRooms
            .filter((r) => !rooms.some((mine) => mine.room_id === r.room_id))
            .map((room) => {
              const isPending = room.pending_members?.some(
                (m: any) => m.uid === me.uid,
              );
              return (
                <div
                  key={room.room_id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50"
                >
                  <span>{room.room_id}</span>
                  <span className="text-gray-700">{room.name}</span>
                  {!isPending ? (
                    <button
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition"
                      onClick={async () => {
                        try {
                          await api.joinRoom(token, room.room_id);
                          setMsg("ルーム参加申請");
                        } catch (e: any) {
                          alert(e.message);
                        }
                      }}
                    >
                      参加
                    </button>
                  ) : (
                    <button
                      className="bg-red-400 hover:bg-red-500 text-white px-4 py-2 rounded transition"
                      onClick={async () => {
                        try {
                          await api.cancelJoinRequest(token, room.room_id);
                          setMsg("申請キャンセル");
                        } catch (e: any) {
                          alert(e.message);
                        }
                      }}
                    >
                      申請キャンセル
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
      <h2 className="text-2xl font-bold mb-4 text-gray-800">自分のルーム</h2>
      <div className="space-y-3 mb-6">
        {rooms.map((room) => (
          <div
            key={room.room_id}
            className={`flex items-center justify-between p-4 border border-gray-200 rounded-lg shadow-sm transition-all duration-200 ease-in-out ${
              currentRoomId === room.room_id
                ? "bg-blue-50 border-blue-300 ring-1 ring-blue-300"
                : "bg-gray-50 hover:bg-gray-100"
            }`}
          >
            <span className="font-medium text-gray-700">{room.name}</span>
            <div className="flex space-x-2">
              <button
                className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 px-3 rounded-md transition"
                onClick={() => setCurrentRoomId(room.room_id)}
              >
                詳細
              </button>
              <button
                className="bg-red-400 hover:bg-red-500 text-white text-sm py-1 px-3 rounded-md transition"
                onClick={async () => {
                  try {
                    await api.deleteRoom(token, room.room_id);
                    setMsg("削除完了");
                    if (currentRoomId === room.room_id) setCurrentRoomId(null);
                  } catch (e: any) {
                    alert(e.message);
                  }
                }}
              >
                ルーム削除
              </button>
            </div>
          </div>
        ))}
      </div>

      <h3 className="text-xl font-bold mb-3 text-gray-800">新規ルーム作成</h3>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="ルーム名"
          value={newRoom.name}
          onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
        />
        <input
          type="number"
          min={1}
          max={12}
          className="w-20 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          value={newRoom.color_id}
          onChange={(e) =>
            setNewRoom({ ...newRoom, color_id: Number(e.target.value) })
          }
        />
        <button
          className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm transition"
          onClick={async () => {
            try {
              await api.createRoom(token, newRoom);
              setNewRoom({ name: "", color_id: 1 });
              setMsg("ルーム作成");
            } catch (e: any) {
              alert(e.message);
            }
          }}
        >
          作成
        </button>
      </div>

      <hr className="my-6 border-gray-300" />

      {roomDetail && (
        <div>
          <p>Hello!!</p>
        </div>
      )}
      {roomDetail &&
        roomDetail.pending_members &&
        roomDetail.pending_members.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-gray-700 mb-2">
              参加申請中メンバー
            </h4>

            {roomDetail.pending_members.map((pending: any) => (
              <div key={pending.uid} className="flex items-center gap-2 mb-2">
                <span className="text-gray-700">{pending.uid}</span>
                {/* 申請者本人はキャンセルできる */}
                {pending.uid === me.uid && (
                  <button
                    className="bg-red-400 hover:bg-red-500 text-white text-xs px-2 py-1 rounded"
                    onClick={async () => {
                      try {
                        await api.cancelJoinRequest(token, currentRoomId);
                        setMsg("申請キャンセル");
                      } catch (e: any) {
                        alert(e.message);
                      }
                    }}
                  >
                    申請キャンセル
                  </button>
                )}
                {/* ルームの作成者だけが承認/拒否できる */}
                {roomDetail.created_by === me.uid && pending.uid !== me.uid && (
                  <>
                    <button
                      className="bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1 rounded"
                      onClick={async () => {
                        try {
                          await api.approveMember(
                            token,
                            currentRoomId,
                            pending.uid,
                          );
                          setMsg("申請承認");
                        } catch (e: any) {
                          alert(e.message);
                        }
                      }}
                    >
                      承認
                    </button>
                    <button
                      className="bg-red-400 hover:bg-red-500 text-white text-xs px-2 py-1 rounded"
                      onClick={async () => {
                        try {
                          await api.rejectMember(
                            token,
                            currentRoomId,
                            pending.uid,
                          );
                          setMsg("申請拒否");
                        } catch (e: any) {
                          alert(e.message);
                        }
                      }}
                    >
                      拒否
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      {currentRoomId && roomDetail && (
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">
            ルーム: {roomDetail.name}
          </h2>
          <p className="text-gray-600 mb-2">
            **説明:** {roomDetail.description}
          </p>
          <p className="text-gray-600 mb-2">
            **作成者:** {roomDetail.created_by}
          </p>
          <div className="mb-4">
            <span className="font-semibold text-gray-700">メンバー: </span>
            {roomDetail.members.map((m: any) => (
              <span
                key={m.uid}
                className={`inline-block mr-2 px-2 py-1 rounded-full text-sm ${
                  m.uid === me.uid
                    ? "bg-blue-100 text-blue-800 font-bold"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {m.uid}
              </span>
            ))}
          </div>
          <div className="flex space-x-3 mb-6">
            <button
              className="bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-md shadow-sm transition"
              onClick={() => setCurrentRoomId(null)}
            >
              ルーム一覧に戻る
            </button>
            <button
              className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm transition"
              onClick={async () => {
                try {
                  await api.leaveRoom(token, currentRoomId);
                  setCurrentRoomId(null);
                  setMsg("退会");
                } catch (e: any) {
                  alert(e.message);
                }
              }}
            >
              ルーム退会
            </button>
          </div>

          <h3 className="text-xl font-bold mb-3">ポイントラウンド</h3>

          {!isRoundActive && finalTable === null && (
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded"
              onClick={async () => {
                await api.startPointRound(token!, currentRoomId);
                setIsRoundActive(true);
              }}
            >
              ラウンド開始
            </button>
          )}

          {isRoundActive && (
            <div className="mb-4">
              <p>参加者全員の提出を待っています…</p>
              {roomDetail.members.map((m: any) => (
                <div key={m.uid} className="flex items-center gap-2">
                  <span className="w-24">{m.uid}</span>
                  {submittedBy.has(m.uid) ? (
                    <span className="text-green-600">提出済</span>
                  ) : m.uid === me.uid ? (
                    <button
                      className="bg-green-500 text-white px-3 py-1 rounded"
                      onClick={async () => {
                        const value = Number(
                          prompt("あなたのスコアを入力してください", "0"),
                        );
                        if (isNaN(value)) return;
                        await api.submitPoint(
                          token!,
                          currentRoomId,
                          me.uid,
                          value,
                        );
                      }}
                    >
                      提出
                    </button>
                  ) : (
                    <span className="text-gray-500">未提出</span>
                  )}
                </div>
              ))}

              {submittedBy.size === roomDetail.members.length && (
                <button
                  className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded"
                  onClick={async () => {
                    await api.finalizePointRound(token!, currentRoomId);
                  }}
                >
                  提出結果を集計
                </button>
              )}
            </div>
          )}

          {finalTable && (
            <div className="mt-4 p-4 border rounded bg-gray-50">
              <h4 className="font-semibold mb-2">最終スコア表</h4>
              {/* テーブル */}
              {Object.entries(finalTable!).map(([uid, val]) => (
                <div key={uid} className="flex justify-between">
                  <span>{uid}</span>
                  <span>{val}pt</span>
                </div>
              ))}

              <h5 className="mt-4 font-medium">承認状況</h5>
              <div className="mb-3">
                {roomDetail.members.map((m) => (
                  <div key={m.uid} className="flex items-center gap-2">
                    <span className="w-24">{m.uid}</span>
                    {approvedBy.has(m.uid) ? (
                      <span className="text-green-600">承認済</span>
                    ) : (
                      <span className="text-gray-500">未承認</span>
                    )}
                  </div>
                ))}
              </div>

              {/* 自分がまだ承認していなければボタンを出す */}
              {!approvedBy.has(me.uid) && (
                <button
                  className="bg-indigo-600 text-white px-4 py-2 rounded mb-2"
                  onClick={async () => {
                    await api.approvePoint(
                      token!,
                      currentRoomId!,
                      currentRoundId!,
                    );
                    // 成功時はWS経由で point_approved イベントを受け取って approvedBy が自動更新されます
                  }}
                >
                  承認する
                </button>
              )}

              {/* 全員承認したら自動で確定登録 */}
              {approvedBy.size === roomDetail.members.length && (
                <button
                  className="bg-green-600 text-white px-4 py-2 rounded"
                  onClick={async () => {
                    const pts = Object.entries(finalTable!).map(
                      ([uid, value]) => ({ uid, value }),
                    );
                    const approvers = Array.from(approvedBy);
                    setFinalTable(null);
                    setApprovedBy(new Set());
                    setIsRoundActive(false);
                  }}
                >
                  全員承認済み → 登録を確定
                </button>
              )}
            </div>
          )}

          {/* ────────── ここから常に表示する「ポイント履歴」セクション ────────── */}
          <h3 className="text-xl font-bold mt-8 mb-3 text-gray-800">
            ポイント履歴
          </h3>
          {pointHistory.length === 0 ? (
            <p className="text-gray-500">まだ履歴がありません。</p>
          ) : (
            <div className="space-y-4">
              {pointHistory.map((rec) => (
                <div
                  key={rec._id ?? rec.round_id}
                  className="p-4 border border-gray-200 rounded-lg bg-white"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">
                      ラウンド ID: {rec.round_id}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(rec.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {rec.points.map((p: any) => (
                      <div key={p.uid} className="flex justify-between">
                        <span>{p.uid}</span>
                        <span>{p.value > 0 ? `+${p.value}` : p.value} pt</span>
                      </div>
                    ))}
                  </div>
                  {rec.approved_by.length > 0 && (
                    <div className="mt-2 text-sm text-gray-600">
                      承認者: {rec.approved_by.join("、")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <h3 className="text-xl font-bold mb-3 text-gray-800">精算</h3>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <select
              value={settleInput.to_uid}
              onChange={(e) =>
                setSettleInput((s) => ({ ...s, to_uid: e.target.value }))
              }
              className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">--相手を選ぶ--</option>
              {roomDetail.members
                .filter((m: any) => m.uid !== me.uid)
                .map((m: any) => (
                  <option value={m.uid} key={m.uid}>
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
              className="w-24 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={async () => {
                try {
                  if (!settleInput.to_uid || !settleInput.amount)
                    throw new Error("相手と金額は必須");
                  await api.settle(
                    token,
                    currentRoomId,
                    settleInput.to_uid,
                    settleInput.amount,
                  );
                  setSettleInput({ to_uid: "", amount: 0 });
                  setMsg("精算");
                } catch (e: any) {
                  alert(e.message);
                }
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm transition"
            >
              精算リクエスト
            </button>
          </div>
          <h4 className="text-lg font-bold mb-3 text-gray-800">精算履歴</h4>
          <div className="space-y-3">
            {settleHistory.length === 0 && (
              <p className="text-gray-500">精算履歴はありません。</p>
            )}
            {settleHistory.map((s, i) => (
              <div
                key={i}
                className="p-3 border border-gray-200 rounded-lg bg-white flex justify-between items-center"
              >
                <span className="text-gray-700">
                  <span className="font-medium">{s.from_uid}</span> →{" "}
                  <span className="font-medium">{s.to_uid}</span> :{" "}
                  <span className="font-bold">{s.amount}</span>円 [
                  {s.approved ? "承認済" : "未承認"}]
                </span>
                {!s.approved && (
                  <button
                    onClick={async () => {
                      try {
                        await api.approveSettlement(
                          token,
                          currentRoomId,
                          s._id || s.settlement_id,
                        );
                        setMsg("精算承認");
                      } catch (e: any) {
                        alert(e.message);
                      }
                    }}
                    className="bg-green-500 hover:bg-green-600 text-white text-sm py-1 px-3 rounded-md transition"
                  >
                    承認
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
