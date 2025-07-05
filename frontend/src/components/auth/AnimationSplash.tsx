import React, { useEffect, useState } from "react";
import styles from "./AnimationSplash.module.css"; // CSSモジュールをインポート

const LETTERS = ["S", "A", "T", "O"];

export default function AnimationSplash({ show = true }: { show?: boolean }) {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);

  useEffect(() => {
    if (!show) return;
    const timers: NodeJS.Timeout[] = [];
    timers.push(setTimeout(() => setPhase(1), 100));
    timers.push(setTimeout(() => setPhase(2), 300));
    timers.push(setTimeout(() => setPhase(3), 500));
    timers.push(setTimeout(() => setPhase(4), 700));
    timers.push(setTimeout(() => setPhase(5), 900));
    timers.push(setTimeout(() => setPhase(6), 2500));
    return () => timers.forEach(clearTimeout);
  }, [show]);

  if (!show || phase === 0) return null;

  return (
    <div
      className={`
        ${phase === 0 ? "hidden" : "fixed inset-0"}
        w-screen h-screen
        flex items-center justify-center
        bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950
        z-[9999]
      `}
    >
      <div
        className={`
          flex
          font-extrabold text-[8rem] md:text-[5rem] sm:text-[3rem]
          text-white
          drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]
          perspective-[1000px]
          space-x-2
          ${phase >= 6 ? styles.fadeOutShrink : ""}
        `}
      >
        {LETTERS.map((ch, i) => (
          <span
            key={i}
            className={`
              ${styles.satoChar}
              ${phase >= i + 2 ? styles.charAppear : ""}
            `}
            style={{
              animationDelay: phase >= i + 2 ? `${i * 0.1}s` : "0s",
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}
