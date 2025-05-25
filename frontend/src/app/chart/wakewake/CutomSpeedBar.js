import React, { useState, useRef, useEffect } from "react";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function SpeedSlider({ value, min = 1, max = 60, onChange, width = 500, height = 120 }) {
  const sliderRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [animatedValue, setAnimatedValue] = useState(value);
  const [particles, setParticles] = useState([]);

  // スムーズなアニメーション
  useEffect(() => {
    const diff = value - animatedValue;
    if (Math.abs(diff) > 0.1) {
      const timer = setTimeout(() => {
        setAnimatedValue(prev => prev + diff * 0.12);
      }, 16);
      return () => clearTimeout(timer);
    } else {
      setAnimatedValue(value);
    }
  }, [value, animatedValue]);

  // パーティクル効果
  useEffect(() => {
    const interval = setInterval(() => {
      const percent = (animatedValue - min) / (max - min);
      if (percent > 0.3) {
        const newParticles = Array.from({ length: Math.floor(percent * 5) }, (_, i) => ({
          id: Date.now() + i,
          x: Math.random() * width,
          y: height / 2 + (Math.random() - 0.5) * 20,
          life: 1,
          speed: 2 + Math.random() * 3
        }));
        setParticles(prev => [...prev.slice(-20), ...newParticles]);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [animatedValue, min, max, width, height]);

  // パーティクルアニメーション
  useEffect(() => {
    const animateParticles = () => {
      setParticles(prev => 
        prev.map(p => ({ ...p, x: p.x + p.speed, life: p.life - 0.02 }))
            .filter(p => p.life > 0 && p.x < width + 50)
      );
    };

    const interval = setInterval(animateParticles, 16);
    return () => clearInterval(interval);
  }, [width]);

  const percent = (animatedValue - min) / (max - min);
  const trackPadding = 40;
  const trackWidth = width - trackPadding * 2;
  const knobPosition = trackPadding + percent * trackWidth;

  // 速度に応じた色とエフェクト
  const getSpeedColor = (percent) => {
    if (percent < 0.25) return { main: "#00ff88", glow: "#00ff8840" };
    if (percent < 0.5) return { main: "#ffdd00", glow: "#ffdd0040" };
    if (percent < 0.75) return { main: "#ff6600", glow: "#ff660040" };
    return { main: "#ff0066", glow: "#ff006640" };
  };

  const speedColors = getSpeedColor(percent);
  const glowIntensity = Math.min(percent * 1.5, 1);

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
    
    const handleMove = (e) => handleChange(e);
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
    <div className="flex flex-col items-center p-8">
      <div className="relative" style={{ width, height }}>
        <svg
          ref={sliderRef}
          width={width}
          height={height}
          style={{ 
            touchAction: "none", 
            cursor: isDragging ? "grabbing" : "grab",
          }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          className="transition-all duration-300"
        >
          <defs>
            {/* グラデーション定義 */}
            <linearGradient id="trackGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1a1a2e" />
              <stop offset="50%" stopColor="#16213e" />
              <stop offset="100%" stopColor="#0f3460" />
            </linearGradient>
            
            <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00ff88" />
              <stop offset="25%" stopColor="#ffdd00" />
              <stop offset="75%" stopColor="#ff6600" />
              <stop offset="100%" stopColor="#ff0066" />
            </linearGradient>

            <linearGradient id="knobGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>

            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            <filter id="innerGlow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            <filter id="dropShadow">
              <feDropShadow dx="0" dy="4" stdDeviation="3" floodOpacity="0.3"/>
            </filter>
          </defs>

          {/* 背景トラック */}
          <rect
            x={trackPadding}
            y={height / 2 - 15}
            width={trackWidth}
            height={30}
            rx={15}
            fill="url(#trackGradient)"
            stroke="#374151"
            strokeWidth={2}
            filter="url(#dropShadow)"
          />

          {/* 目盛り */}
          {Array.from({ length: 11 }, (_, i) => {
            const x = trackPadding + (i * trackWidth) / 10;
            const isMain = i % 5 === 0;
            const tickHeight = isMain ? 25 : 15;
            const y1 = height / 2 - tickHeight / 2;
            const y2 = height / 2 + tickHeight / 2;

            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke={isMain ? "#64748b" : "#475569"}
                  strokeWidth={isMain ? 3 : 2}
                  strokeLinecap="round"
                />
                {isMain && (
                  <text
                    x={x}
                    y={y2 + 20}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#64748b"
                    fontFamily="monospace"
                  >
                    {Math.round(min + (i / 10) * (max - min))}
                  </text>
                )}
              </g>
            );
          })}

          {/* アクティブトラック */}
          <rect
            x={trackPadding}
            y={height / 2 - 12}
            width={percent * trackWidth}
            height={24}
            rx={12}
            fill="url(#speedGradient)"
            filter="url(#glow)"
            style={{
              filter: `url(#glow) drop-shadow(0 0 ${5 + glowIntensity * 20}px ${speedColors.main})`
            }}
          />

          {/* 速度インジケーター */}
          {Array.from({ length: Math.floor(percent * 20) }, (_, i) => {
            const x = trackPadding + (i * trackWidth) / 20;
            const opacity = Math.max(0.3, 1 - i / 20);
            return (
              <rect
                key={i}
                x={x}
                y={height / 2 - 8}
                width={3}
                height={16}
                rx={1.5}
                fill={speedColors.main}
                opacity={opacity}
                filter="url(#innerGlow)"
              />
            );
          })}

          {/* パーティクル */}
          {particles.map(particle => (
            <circle
              key={particle.id}
              cx={particle.x}
              cy={particle.y}
              r={2 * particle.life}
              fill={speedColors.main}
              opacity={particle.life * 0.8}
              filter="url(#glow)"
            />
          ))}

          {/* メインノブ */}
          <g transform={`translate(${knobPosition}, ${height / 2})`}>
            <circle
              cx={0}
              cy={0}
              r={20}
              fill="url(#knobGradient)"
              stroke={speedColors.main}
              strokeWidth={3}
              filter="url(#dropShadow)"
              style={{
                filter: `url(#dropShadow) drop-shadow(0 0 ${8 + glowIntensity * 15}px ${speedColors.main})`
              }}
            />
            
            {/* ノブの中央インジケーター */}
            <circle
              cx={0}
              cy={0}
              r={6}
              fill={speedColors.main}
              opacity={0.8}
              filter="url(#innerGlow)"
            />

            {/* ノブのハイライト */}
            <circle
              cx={-5}
              cy={-5}
              r={3}
              fill="white"
              opacity={0.6}
            />
          </g>

          {/* 値表示 */}
          <text
            x={width / 2}
            y={height - 25}
            textAnchor="middle"
            fontSize="24"
            fill={speedColors.main}
            fontFamily="monospace, 'Courier New'"
            fontWeight="bold"
            style={{
              filter: `drop-shadow(0 0 ${3 + glowIntensity * 8}px ${speedColors.main})`
            }}
          >
            {Math.round(animatedValue)} FPS
          </text>
        </svg>

        {/* 背景グロー効果 */}
        <div 
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${speedColors.glow} ${percent * 100}%, transparent 100%)`,
            opacity: glowIntensity * 0.6
          }}
        />

        {/* 端っこのフレア効果 */}
        {percent > 0.5 && (
          <div 
            className="absolute pointer-events-none"
            style={{
              left: knobPosition - 20,
              top: height / 2 - 20,
              width: 40,
              height: 40,
              background: `radial-gradient(circle, ${speedColors.main}40 0%, transparent 70%)`,
              borderRadius: '50%',
              opacity: glowIntensity * 0.8
            }}
          />
        )}
      </div>

      {/* ステータス表示 */}
      <div className="mt-8 flex items-center space-x-6">
        <div className="text-center">
          <div className="text-sm text-gray-400 mb-1">Status</div>
          <div 
            className="px-4 py-2 rounded-full text-sm font-bold"
            style={{
              backgroundColor: `${speedColors.main}20`,
              color: speedColors.main,
              border: `2px solid ${speedColors.main}60`,
              boxShadow: `0 0 ${5 + glowIntensity * 10}px ${speedColors.glow}`
            }}
          >
            {percent < 0.25 ? "SMOOTH" : 
             percent < 0.5 ? "OPTIMAL" : 
             percent < 0.75 ? "HIGH SPEED" : "MAXIMUM"}
          </div>
        </div>

        <div className="text-center">
          <div className="text-sm text-gray-400 mb-1">Performance</div>
          <div className="flex space-x-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="w-2 h-6 rounded-full"
                style={{
                  backgroundColor: i < percent * 5 ? speedColors.main : "#374151",
                  boxShadow: i < percent * 5 ? `0 0 5px ${speedColors.glow}` : "none"
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoolSpeedSliderDemo() {
  const [speed, setSpeed] = useState(30);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">
          PERFORMANCE CONTROL
        </h1>
        <p className="text-blue-300 mb-8">Slide to adjust frame rate</p>
        
        <SpeedSlider
          value={speed}
          min={1}
          max={60}
          onChange={setSpeed}
          width={600}
          height={120}
        />
        
        <div className="mt-8 grid grid-cols-3 gap-6 max-w-md mx-auto">
          <div className="text-center">
            <div className="text-gray-400 text-sm">Current</div>
            <div className="text-2xl font-mono font-bold text-white">
              {speed}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-sm">Target</div>
            <div className="text-2xl font-mono font-bold text-green-400">
              60
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-sm">Efficiency</div>
            <div className="text-2xl font-mono font-bold text-blue-400">
              {Math.round((speed / 60) * 100)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
