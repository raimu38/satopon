import React, { useEffect, useState } from "react";
import styles from "./AnimationSplash.module.css"; // Import CSS module

const LETTERS = ["S", "A", "T", "O"]; // Characters to animate

export default function AnimationSplash({ show = true }: { show?: boolean }) {
  const [shouldFadeOut, setShouldFadeOut] = useState(false);
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);

  // Animation parameters
  const CHAR_ANIMATION_DURATION_S = 0.7; // Duration of individual character animation in seconds
  const CHAR_DELAY_INCREMENT_S = 0.25; // Delay between each character's animation start in seconds
  const FADE_OUT_START_DELAY_S = 1.0; // Delay before the whole splash fades out after all characters appear
  const FADE_OUT_DURATION_S = 1.2; // Duration of the fade-out animation in seconds

  useEffect(() => {
    if (!show) {
      setShouldFadeOut(false);
      setIsAnimationComplete(false);
      return;
    }

    const totalCharAppearTime = (LETTERS.length - 1) * CHAR_DELAY_INCREMENT_S + CHAR_ANIMATION_DURATION_S;
    const fadeOutTriggerTime = totalCharAppearTime + FADE_OUT_START_DELAY_S;
    const totalAnimationTime = fadeOutTriggerTime + FADE_OUT_DURATION_S;

    const fadeOutTimer = setTimeout(() => {
      setShouldFadeOut(true);
    }, fadeOutTriggerTime * 1000);

    const completeTimer = setTimeout(() => {
      setIsAnimationComplete(true);
    }, totalAnimationTime * 1000);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(completeTimer);
    };
  }, [show]);

  if (!show || isAnimationComplete) return null;

  return (
    <div
      className={`
        fixed inset-0
        w-screen h-screen
        flex items-center justify-center
        bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950
        z-[9999]
      `}
    >
      <div
        className={`
          flex
          font-extrabold text-8xl md:text-7xl sm:text-5xl
          text-white
          drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]
          perspective-[1000px]
          space-x-2
          ${shouldFadeOut ? styles.fadeOutShrink : ""}
        `}
      >
        {LETTERS.map((ch, i) => (
          <span
            key={i}
            className={`${styles.satoChar} ${styles.charAppear}`}
            style={{
              animationDelay: `${i * CHAR_DELAY_INCREMENT_S}s`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}
