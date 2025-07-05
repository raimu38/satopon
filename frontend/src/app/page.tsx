"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import AnimationSplash from "@/components/auth/AnimationSplash";

// Import Firebase auth client and functions instead of Supabase
import { auth } from "@/lib/firebaseClient";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

export default function AuthPage() {
  const router = useRouter();
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimer = useRef<NodeJS.Timeout | null>(null);

  const handleStart = async () => {
    // Check if user is already signed in with Firebase
    if (auth.currentUser) {
      setIsAnimating(true);
      console.log("anima");
      animationTimer.current = setTimeout(() => {
        router.replace("/c420"); // Use http://10.225.246.225/c420 if needed
      }, 2000);
      return;
    }

    // If not signed in, start Google sign-in flow with Firebase
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // On success, trigger animation and redirect
      setIsAnimating(true);
      animationTimer.current = setTimeout(() => {
        router.replace("/c420");
      }, 2000);
    } catch (error) {
      alert("Google sign-in error: " + (error as Error).message);
      console.error("Google sign-in error: ", error);
    }
  };

  // cleanup: clear timer on component unmount
  useEffect(() => {
    return () => {
      if (animationTimer.current) {
        clearTimeout(animationTimer.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {isAnimating && <AnimationSplash />}
      {/* App Name */}
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
          disabled={isAnimating} // Disable button during animation
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
