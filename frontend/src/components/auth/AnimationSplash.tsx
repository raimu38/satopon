import React from "react";
import styles from "./AnimationSplash.module.css";

type Coin = {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  angle: number;
};

export default function AnimationSplash({ show = true }: { show?: boolean }) {
  const coins = React.useMemo(() => {
    if (!show) return [];
    const arr: Coin[] = [];
    for (let i = 0; i < 48; ++i) {
      arr.push({
        id: i,
        left: 5 + Math.random() * 90,
        size: 42 + Math.random() * 36,
        delay: Math.random() * 0.4,
        duration: 0.85 + Math.random() * 0.65,
        angle: -24 + Math.random() * 48,
      });
    }
    return arr;
  }, [show]);
  if (!show) return null;
  return (
    <div className={styles.splashRoot}>
      <div className={styles.satoponSpin}>satopon</div>
      {coins.map((c) => (
        <div
          key={c.id}
          className={styles.coin}
          style={
            {
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              "--angle": `${c.angle}deg`,
              animation: `coin-drop ${c.duration}s ${c.delay}s cubic-bezier(0.28,0.7,0.45,1.12) forwards`,
            } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 64 64" width={c.size} height={c.size}>
            <defs>
              <radialGradient id={`gold-main${c.id}`} cx="50%" cy="30%" r="60%">
                <stop offset="0%" stopColor="#f7fafc" />
                <stop offset="45%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#b45309" />
              </radialGradient>
              <radialGradient id={`gold-edge${c.id}`} cx="50%" cy="70%" r="50%">
                <stop offset="0%" stopColor="#fef9c3" />
                <stop offset="100%" stopColor="#facc15" />
              </radialGradient>
              <filter
                id={`coin-glow${c.id}`}
                x="-30%"
                y="-30%"
                width="160%"
                height="160%"
              >
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* コインふち */}
            <ellipse
              cx="32"
              cy="32"
              rx="30"
              ry="30"
              fill={`url(#gold-edge${c.id})`}
              filter={`url(#coin-glow${c.id})`}
              stroke="#fef9c3"
              strokeWidth="3"
            />
            {/* 本体 */}
            <ellipse
              cx="32"
              cy="32"
              rx="26"
              ry="26"
              fill={`url(#gold-main${c.id})`}
              stroke="#facc15"
              strokeWidth="1"
            />
            {/* 刻印 */}
            <text
              x="32"
              y="44"
              textAnchor="middle"
              fontSize="30"
              fontWeight="bold"
              fill="#fffbe7"
              stroke="#facc15"
              strokeWidth="1.2"
              filter={`url(#coin-glow${c.id})`}
              style={{
                textShadow: "0 1px 6px #fbbf24, 0 2px 12px #fbbf24cc",
              }}
            >
              S
            </text>
          </svg>
        </div>
      ))}
    </div>
  );
}
