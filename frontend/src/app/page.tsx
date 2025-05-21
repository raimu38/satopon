"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const LoginPage = () => {
  const router = useRouter();

  const handleClick = async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      // すでにログイン済み
      router.push("/point");
    } else {
      // 未ログイン・アカウント未作成
      router.push("/auth");
    }
  };

  return (
    <div className="flex w-full h-screen justify-center items-center rotating-gradient">
      <button
        className="hover:bg-white/20 px-4 py-2 font-semibold rounded-full"
        onClick={handleClick}
      >
        Satopon
      </button>
    </div>
  );
};

export default LoginPage;
