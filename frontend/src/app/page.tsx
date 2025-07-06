"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect, useCallback } from "react";
import AnimationSplash from "@/components/auth/AnimationSplash"; // Assuming this is a pre-existing splash animation

// Import Firebase auth client and functions
import { auth } from "@/lib/firebaseClient";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

export default function AuthPage() {
  const router = useRouter();
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimer = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Ref for our canvas background

  // Function to draw and animate "SATO" text particles on canvas
  const drawSatoBackground = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let animationFrameId: number;
    const particles: SatoParticle[] = [];
    const maxParticles = 30; // Number of "SATO" particles
    const colors = ["#A020F0", "#DA70D6", "#9370DB", "#C0C0C0", "#F0E68C"]; // Purple, Orchid, MediumPurple, Silver, Khaki

    class SatoParticle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;
      rotation: number;
      rotationSpeed: number;
      text: string;
      alpha: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 30 + 40; // Larger text sizes for impact
        this.speedX = Math.random() * 0.5 - 0.25; // Slow, subtle horizontal movement
        this.speedY = Math.random() * 0.5 - 0.25; // Slow, subtle vertical movement
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.rotation = Math.random() * Math.PI * 2; // Initial random rotation
        this.rotationSpeed = Math.random() * 0.003 - 0.0015; // Very slow rotation
        this.text = "SATO"; // The text to animate
        this.alpha = Math.random() * 0.4 + 0.1; // Varying transparency (10% to 50%)
      }

      // Update particle position, rotation, and potentially fade (optional)
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;

        // Wrap particles around the screen
        if (this.x < -100) this.x = canvas.width + 100;
        if (this.x > canvas.width + 100) this.x = -100;
        if (this.y < -100) this.y = canvas.height + 100;
        if (this.y > canvas.height + 100) this.y = -100;
      }

      // Draw particle on the canvas
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y); // Move origin to particle center for rotation
        ctx.rotate(this.rotation); // Apply rotation
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.size}px 'Arial', sans-serif`; // Bold font for impact
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = this.color;
        ctx.shadowBlur = this.size / 5; // Subtle glow effect based on size
        ctx.globalAlpha = this.alpha; // Apply individual transparency

        ctx.fillText(this.text, 0, 0); // Draw the "SATO" text

        ctx.restore(); // Restore previous canvas state
      }
    }

    // Initialize particles
    for (let i = 0; i < maxParticles; i++) {
      particles.push(new SatoParticle());
    }

    // Animation loop
    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height); // Clear the entire canvas each frame

      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      animationFrameId = requestAnimationFrame(animate); // Request next frame
    }

    animate(); // Start the animation

    return () => {
      cancelAnimationFrame(animationFrameId); // Stop the animation
    };
  }, []);

  useEffect(() => {
    const cleanupCanvas = drawSatoBackground();
    window.addEventListener("resize", drawSatoBackground);
    return () => {
      if (cleanupCanvas) cleanupCanvas(); // Clean up canvas animation
      window.removeEventListener("resize", drawSatoBackground); // Remove resize listener
    };
  }, [drawSatoBackground]); // Re-run if drawSatoBackground changes (though it's memoized with useCallback)

  const handleStart = async () => {
    // Check if user is already signed in with Firebase
    if (auth.currentUser) {
      setIsAnimating(true);
      console.log("anima");
      animationTimer.current = setTimeout(() => {
        router.replace("/c420");
      }, 3500);
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
      }, 3500);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900  flex flex-col relative overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 z-0"></canvas>
      {isAnimating && <AnimationSplash className="absolute inset-0 z-40" />}
      <div className="relative z-10 flex flex-1 flex-col justify-center items-center p-4 text-white">
        <div className="absolute top-0 left-0 p-4">
          <span className="text-white font-bold text-xl md:text-2xl tracking-wide">
            satopon
          </span>
        </div>

        <p className="text-gray-300 text-base md:text-lg mb-12 text-center max-w-xs md:max-w-md leading-relaxed drop-shadow-lg">
          Welcome to SATOPON.
        </p>

        <button
          onClick={handleStart}
          className="
            w-48 py-3.5
            bg-gradient-to-tr from-blue-500 to-indigo-600
            text-white font-semibold
            rounded-full shadow-xl
            hover:from-blue-600 hover:to-indigo-700
            transition-all duration-300 transform hover:scale-105 active:scale-95
            text-lg md:text-xl
            flex items-center justify-center gap-2
          "
          disabled={isAnimating} // Disable button during animation
        >
          <span className="material-symbols-outlined text-xl">
            rocket_launch
          </span>
          Get Started
        </button>

        <div className="mt-3 text-sm text-gray-400 text-center drop-shadow">
          Connect with Google
        </div>
      </div>
    </div>
  );
}
