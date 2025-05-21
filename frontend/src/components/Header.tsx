// components/Header.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function Header() {
  const [session, setSession] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
  };

  return (
    <header className="w-full px-4 py-2 bg-white shadow flex justify-between items-center">
      <Link href="/" className="text-xl font-bold">
        satopon
      </Link>
      {session?.user ? (
        <div className="relative">
          <button onClick={() => setMenuOpen((o) => !o)}>
            <img
              src={
                session.user.user_metadata.avatar_url ?? "/default-avatar.png"
              }
              alt="avatar"
              className="w-10 h-10 rounded-full border"
            />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow z-10">
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2 hover:bg-gray-100"
              >
                詳細
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      ) : (
        <Link
          href="/auth"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          ログイン
        </Link>
      )}
    </header>
  );
}
