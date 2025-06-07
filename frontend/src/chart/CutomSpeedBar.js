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
  height = 40,
  bgColor = "#e5e7eb",
}) {
  const sliderRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [animatedValue, setAnimatedValue] = useState(value);

  useEffect(() => {
    const diff = value - animatedValue;
    if (Math.abs(diff) > 0.15) {
      const timer = setTimeout(() => {
        setAnimatedValue(prev => prev + diff * 0.32);
      }, 12);
      return () => clearTimeout(timer);
    } else {
      setAnimatedValue(value);
    }
  }, [value, animatedValue]);

  const trackPadding = 28;
  const trackWidth = width - trackPadding * 2;
  const percent = (animatedValue - min) / (max - min);
  const knobPosition = trackPadding + percent * trackWidth;

  const gradientId = "fixedBlueGradient";

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

  const ticks = [0, 0.25, 0.5, 0.75, 1];

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
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>

<linearGradient id="knobGradient" x1="0%" y1="0%" x2="0%" y2="100%">
  <stop offset="0%" stopColor="#f8fafc" />
  <stop offset="100%" stopColor="#e2e8f0" />
</linearGradient>
        </defs>

        {/* トラック背景 */}
        <rect
          x={trackPadding}
          y={height / 2 - 6}
          width={trackWidth}
          height={12}
          rx={6}
          fill={bgColor}
        />
        {/* アクティブバー */}
        <rect
          x={trackPadding}
          y={height / 2 - 6}
          width={percent * trackWidth}
          height={12}
          rx={6}
          fill={`url(#${gradientId})`}
        />

        {/* メモリ棒（ticks） */}
        {ticks.map((p, i) => {
          const x = trackPadding + p * trackWidth;
          const isCenter = i === 2;
          return (
            <rect
              key={i}
              x={x - 0.5}
              y={height / 2 - 10}
              width={1}
              height={20}
              fill={isCenter ? "#64748b" : "#94a3b8"}
              opacity={isCenter ? 0.8 : 0.5}
              rx={0.5}
            />
          );
        })}

{/* ノブ */}
<g>
  {/* 影 */}
  <circle
    cx={knobPosition}
    cy={height / 2}
    r={10}
    fill="rgba(0,0,0,0.15)"
  />
  {/* 本体（白ベースにグラデ） */}
  <circle
    cx={knobPosition}
    cy={height / 2}
    r={9}
    fill="url(#knobGradient)"
    stroke="#3b82f6"
    strokeWidth={2}
    style={{
      filter: isDragging ? "drop-shadow(0 0 6px #3b82f666)" : "",
      transition: "filter 0.12s",
    }}
  />
  {/* 中心グリップ点 */}
  <circle
    cx={knobPosition}
    cy={height / 2}
    r={2}
    fill="#3b82f6"
    opacity="0.6"
  />
</g>
        {/* ラベル */}
        {[0, 0.5, 1].map((p, i) => {
          const label = Math.round(min + p * (max - min));
          const x = trackPadding + p * trackWidth;
          return (
            <text
              key={i}
              x={x}
              y={height  }
              textAnchor="middle"
              fontSize="9"
              fill="#94a3b8"
              opacity="0.7"
              fontFamily="monospace"
              
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
