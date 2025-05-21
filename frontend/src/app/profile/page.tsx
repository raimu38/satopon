// app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const [session, setSession] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/auth");
      } else {
        setSession(data.session);
      }
    });
  }, [router]);

  if (!session) {
    return <p className="text-center mt-10">読み込み中...</p>;
  }

  const { user } = session;

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">ユーザー詳細</h2>
      <div className="flex items-center space-x-4 mb-4">
        {user.user_metadata.avatar_url ? (
          <img
            src={user.user_metadata.avatar_url}
            alt="avatar"
            className="w-16 h-16 rounded-full border"
          />
        ) : (
          <div className="w-16 h-16 rounded-full border flex items-center justify-center text-2xl">
            {user.email![0]}
          </div>
        )}
        <div>
          <p className="text-lg font-semibold">
            {user.user_metadata.full_name ?? "No Name"}
          </p>
          <p className="text-gray-600">{user.email}</p>
        </div>
      </div>
      <p className="text-sm text-gray-400">
        この情報は Google OAuth から取得しています
      </p>
    </div>
  );
}
