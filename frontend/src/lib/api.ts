// src/lib/api.ts
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

type ApiOptions = {
  method?: string;
  body?: any;
  token?: string;
  headers?: Record<string, string>;
};

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let token = options.token;
  if (!token) throw new Error("JWT token required");
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  return await res.json();
}

// --- ユーザー ---
export const getMe = (token: string) => api("/users/me", { token });
export const updateMe = (token: string, display_name: string) =>
  api("/users/me", { method: "PUT", token, body: { display_name } });
export const getUserPointHistory = (token: string) =>
  api("/users/me/points/history", { token });
export const getUserSettleHistory = (token: string) =>
  api("/users/me/settle/history", { token });

export async function createUser(
  token: string,
  { display_name, email, icon_url },
) {
  return api("/users", {
    method: "POST",
    token,
    body: { display_name, email, icon_url },
  });
}
// --- ルーム ---
export const createRoom = (
  token: string,
  room: { name: string; description?: string; color_id: number },
) => api("/rooms", { method: "POST", token, body: room });
export const listRooms = (token: string) => api("/rooms", { token });

// --- Presence ---
export const getPresence = (token: string, room_id: string) =>
  api<string[]>(`/rooms/${room_id}/presence`, { token });
export const getAllRooms = (token: string) => api("/rooms/all", { token });
export const getRoom = (token: string, room_id: string) =>
  api(`/rooms/${room_id}`, { token });
export const updateRoom = (
  token: string,
  room_id: string,
  updates: Partial<{ name: string; description: string; color_id: number }>,
) => api(`/rooms/${room_id}`, { method: "PUT", token, body: updates });
export const deleteRoom = (token: string, room_id: string) =>
  api(`/rooms/${room_id}`, { method: "DELETE", token });
export const joinRoom = (token: string, room_id: string) =>
  api(`/rooms/${room_id}/join`, { method: "POST", token });
export const cancelJoinRequest = (token: string, room_id: string) =>
  api(`/rooms/${room_id}/cancel_join`, { method: "POST", token });
export const leaveRoom = (token: string, room_id: string) =>
  api(`/rooms/${room_id}/leave`, { method: "POST", token });
export const approveMember = (
  token: string,
  room_id: string,
  applicant_user_id: string,
) =>
  api(`/rooms/${room_id}/approve`, {
    method: "POST",
    token,
    body: { applicant_user_id },
  });
export const rejectMember = (
  token: string,
  room_id: string,
  applicant_user_id: string,
) =>
  api(`/rooms/${room_id}/reject`, {
    method: "POST",
    token,
    body: { applicant_user_id },
  });

// --- ポイント ---
export const addPoints = (
  token: string,
  room_id: string,
  points: Array<{ uid: string; value: number }>,
  approved_by: string[],
) =>
  api(`/rooms/${room_id}/points`, {
    method: "POST",
    token,
    body: { points, approved_by },
  });
export const getPointHistory = (token: string, room_id: string) =>
  api(`/rooms/${room_id}/points/history`, { token });
export const approvePoint = (
  token: string,
  room_id: string,
  round_id: string,
) =>
  api(`/rooms/${room_id}/points/${round_id}/approve`, {
    method: "POST",
    token,
  });
export const getPointStatus = (
  token: string,
  room_id: string,
  round_id: string,
) => api(`/rooms/${room_id}/points/${round_id}/status`, { token });
export const deletePointRecord = (
  token: string,
  room_id: string,
  round_id: string,
) => api(`/rooms/${room_id}/points/${round_id}`, { method: "DELETE", token });

export const startPointRound = (token: string, room_id: string) =>
  api(`/rooms/${room_id}/points/start`, { method: "POST", token });

export const submitPoint = (
  token: string,
  room_id: string,
  uid: string,
  value: number,
) =>
  api(`/rooms/${room_id}/points/submit`, {
    method: "POST",
    token,
    body: { uid, value },
  });

export const finalizePointRound = (token: string, room_id: string) =>
  api(`/rooms/${room_id}/points/finalize`, { method: "POST", token });
// --- 精算 ---
export const settle = (
  token: string,
  room_id: string,
  to_uid: string,
  amount: number,
) =>
  api(`/rooms/${room_id}/settle`, {
    method: "POST",
    token,
    body: { to_uid, amount },
  });
export const approveSettlement = (
  token: string,
  room_id: string,
  settlement_id: string,
) =>
  api(`/rooms/${room_id}/settle/${settlement_id}/approve`, {
    method: "POST",
    token,
  });
export const getSettlementHistory = (token: string, room_id: string) =>
  api(`/rooms/${room_id}/settle/history`, { token });
