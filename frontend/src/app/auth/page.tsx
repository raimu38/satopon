// page.tsx

"use client";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRef, useState, useEffect } from "react";
import AnimationSplash from "@/components/auth/AnimationSplash";

export default function AuthPage() {
  const router = useRouter();
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimer = useRef<NodeJS.Timeout | null>(null);

  const handleStart = async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      setIsAnimating(true);
      console.log("anima")
      animationTimer.current = setTimeout(() => {
        router.replace("/c402");
      }, 2000);
      return;
    }
    // 未認証ならGoogle認証フロー
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL,
      },
    });
    if (error) alert("Google sign-in error: " + error.message);
  };

  // cleanup: ページ離脱時にタイマー破棄
  useEffect(() => {
    return () => {
      if (animationTimer.current) clearTimeout(animationTimer.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {isAnimating && <AnimationSplash />}
      {/* 左上アプリ名 */}
      <div className="absolute top-0 left-0 p-4 z-10">
        <span className="text-white font-bold text-lg">satopon</span>
      </div>
      <div className="flex flex-1 flex-col justify-center items-center z-0">
        <p className="text-gray-300 text-sm mb-12 text-center max-w-xs">
          Track and settle scores with friends—fast, simple, and fair.
        </p>
        <button
          onClick={handleStart}
          className="
            w-44 py-3
            bg-gradient-to-tr from-blue-500 to-indigo-600
            text-white font-semibold
            rounded-full shadow
            hover:from-blue-600 hover:to-indigo-700
            transition
            text-lg
          "
          disabled={isAnimating} // アニメ中は多重押し不可
        >
          Get Started
        </button>
        <div className="mt-2 text-xs text-gray-400 text-center">
          Start with Google
        </div>
      </div>
    </div>
  );
}
