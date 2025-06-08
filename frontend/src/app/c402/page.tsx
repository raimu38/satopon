"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // ←自分のプロジェクトのパスで
import AccountModal from "./AccountModal.tsx";
import { useRouter } from "next/navigation"; // useRouterをインポート

type UserProfile = {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
};

export default function HomePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showModal, setShowModal] = useState(false);
  const router = useRouter(); // useRouterを初期化

  useEffect(() => {
    (async () => {
      // Supabaseのユーザー情報取得
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        // ユーザーがいない場合はログインページにリダイレクト
        router.push("/");
        return;
      }
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
  }, [router]); // routerを依存配列に追加

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert("ログアウト中にエラーが発生しました: " + error.message);
    } else {
      router.push("/"); // ログアウト後にトップページへリダイレクト
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* 右上アカウントアイコンとログアウトボタン */}
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        {" "}
        {/* flexboxで横並びに */}
        <button
          className="w-10 h-10 bg-blue-500 text-white rounded-full overflow-hidden flex items-center justify-center text-lg font-bold"
          onClick={() => setShowModal(true)}
          title="アカウント情報"
        >
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt="avatar"
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            (user?.name?.[0] ?? "?")
          )}
        </button>
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2 px-3 rounded-md shadow-sm transition duration-200 ease-in-out"
          title="ログアウト"
        >
          ログアウト
        </button>
      </div>
      <div className="flex-1 flex flex-col justify-center items-center">
        <h1 className="text-2xl font-bold mb-4">Home</h1>
        {/* 他のUI */}
      </div>
      {showModal && user && (
        <AccountModal user={user} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
