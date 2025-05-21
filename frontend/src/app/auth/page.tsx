"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthPage() {
  const router = useRouter();

  // 認証状態チェック
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        router.replace("/point"); // すでにログインならリダイレクト
      }
    };
    checkAuth();
  }, [router]);

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL,
      },
    });
    if (error) {
      console.error("Google sign-in error:", error.message);
    }
  };

  return (
    <div className="flex w-full h-screen justify-center items-center rotating-gradient">
      <button
        onClick={handleGoogleSignIn}
        className="px-6 py-3 bg-gradient-to-r from-neutral-800 to-gray-600 text-white rounded-full shadow-lg hover:from-neutral-700 hover:to-gray-800 hover:scale-105 transition-all duration-200 font-semibold tracking-wide border border-white/10"
      >
        Google でログイン
      </button>
    </div>
  );
}
