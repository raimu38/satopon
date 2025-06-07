'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // ←自分のプロジェクトのパスで
import AccountModal from "./AccountModal.tsx"

type UserProfile = {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
};

export default function HomePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    (async () => {
      // Supabaseのユーザー情報取得
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return;
      const userData = data.user;
      setUser({
        id: userData.id,
        email: userData.email ?? "",
        name:
          userData.user_metadata?.full_name ||
          userData.user_metadata?.name ||
          userData.email?.split("@")[0] ||
          "",
        avatar_url: userData.user_metadata?.avatar_url || "", // Googleログインなどの場合のみ
      });
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* 右上アカウントアイコン */}
      <div className="absolute top-4 right-4">
        <button
          className="w-10 h-10 bg-blue-500 text-white rounded-full overflow-hidden"
          onClick={() => setShowModal(true)}
        >
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt="avatar"
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            user?.name?.[0] ?? "?"
          )}
        </button>
      </div>
      <div className="flex-1 flex flex-col justify-center items-center">
        <h1 className="text-2xl font-bold mb-4">Home</h1>
        {/* 他のUI */}
      </div>
      {showModal && user && (
        <AccountModal
          user={user}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
