import React, { useRef, useState, useEffect } from "react";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export default function SpeedMeterBar({
  value,
  min = 1,
  max = 30,
  onChange,
  width = 280,
  height = 56,
  color = "#3b82f6", // 青系
  bgColor = "#e5e7eb", // track
}) {
  const sliderRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [animatedValue, setAnimatedValue] = useState(value);

  // アニメーション
  useEffect(() => {
    const diff = value - animatedValue;
    if (Math.abs(diff) > 0.3) {
      const timer = setTimeout(() => {
        setAnimatedValue(prev => prev + diff * 0.15);
      }, 16);
      return () => clearTimeout(timer);
    } else {
      setAnimatedValue(value);
    }
  }, [value, animatedValue]);

  const trackPadding = 32;
  const trackWidth = width - trackPadding * 2;
  const percent = (animatedValue - min) / (max - min);
  const knobPosition = trackPadding + percent * trackWidth;

  // 目盛り（5個、端と中央だけラベルつき）
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p, i) => ({
    x: trackPadding + p * trackWidth,
    label: [0, 2, 4].includes(i)
      ? Math.round(min + p * (max - min))
      : null,
  }));

  // グラデ色
  const gradientId = "speedMeterGradient";
  const barColorA = color;
  const barColorB = "#60a5fa"; // 薄め青

  const handleChange = (e) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const newPercent = clamp((x - trackPadding) / trackWidth, 0, 1);
    const newValue = Math.round(min + newPercent * (max - min));
    onChange(newValue);
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    handleChange(e);

    const handleMove = (ev) => handleChange(ev);
    const handleUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchend", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchend", handleUp);
  };

  return (
    <div style={{ width, userSelect: "none" }}>
      <svg
        ref={sliderRef}
        width={width}
        height={height}
        style={{ cursor: isDragging ? "grabbing" : "pointer", touchAction: "none", display: "block" }}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={barColorA} />
            <stop offset="100%" stopColor={barColorB} />
          </linearGradient>
        </defs>
        {/* トラック背景 */}
        <rect
          x={trackPadding}
          y={height / 2 - 8}
          width={trackWidth}
          height={16}
          rx={8}
          fill={bgColor}
        />
        {/* アクティブバー */}
        <rect
          x={trackPadding}
          y={height / 2 - 8}
          width={percent * trackWidth}
          height={16}
          rx={8}
          fill={`url(#${gradientId})`}
        />
        {/* 目盛り */}
        {ticks.map((tick, i) => (
          <g key={i}>
            <rect
              x={tick.x - 1}
              y={height / 2 - 14}
              width={2}
              height={28}
              rx={1}
              fill={i === 2 ? "#2563eb" : "#94a3b8"}
              opacity={i === 2 ? 0.9 : 0.6}
            />
            {tick.label !== null && (
              <text
                x={tick.x}
                y={height / 2 + 26}
                textAnchor="middle"
                fontSize="12"
                fill="#64748b"
                fontFamily="monospace"
              >
                {tick.label}
              </text>
            )}
          </g>
        ))}
        {/* ノブ */}
        <circle
          cx={knobPosition}
          cy={height / 2}
          r={13}
          fill="#fff"
          stroke={color}
          strokeWidth={3}
          style={{
            filter: isDragging ? "drop-shadow(0 0 8px #3b82f666)" : "",
            transition: "filter 0.12s",
          }}
        />
        {/* 値 */}
        <text
          x={knobPosition}
          y={height / 2 + 5}
          textAnchor="middle"
          fontSize="15"
          fontFamily="monospace"
          fill={color}
          fontWeight="bold"
          opacity={0.85}
        >
          {Math.round(animatedValue)}
        </text>
      </svg>
    </div>
  );
}
