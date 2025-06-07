'use client'
import React, { useEffect } from "react";
import CustomSpeedBar from './CutomSpeedBar.js';
import { drawTimelineCanvas, drawSummaryBarCanvas } from "./canvasDrawFns"

function TimelineUI({
  indexToFrame,
  currentIndex,
  isPanning,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleContextMenu,
  containerRef,
  canvasRef,
  summaryBarRef,
  BAR_HEIGHT,
  dragBarMode,
  handleSummaryBarMouseDown,
  handleSummaryBarMouseMove,
  handleSummaryBarMouseUp,
  canvasWidth,
  isPlaying,
  setIsPlaying,
  playSpeed,
  setPlaySpeed,
  indexToTimestamp,
  FRAME_COUNT,
  annotations,
  viewStart,
  scale,
  visibleFrames,
  isDragging,
  dragStart,
  dragEnd,
  isDeleting,
}){ useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawTimelineCanvas({
      ctx,
      canvasWidth,
      visibleFrames,
      scale,
      viewStart,
      FRAME_COUNT,
      indexToFrame,
      annotations,
      isDragging,
      dragStart,
      BAR_HEIGHT,
      dragEnd,
      isDeleting,
      currentIndex,
    });
  }, [
    canvasWidth, visibleFrames, scale, viewStart, FRAME_COUNT,
    indexToFrame, annotations, isDragging, dragStart, dragEnd, isDeleting, currentIndex, canvasRef
  ])
useEffect(() => {
    const canvas = summaryBarRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawSummaryBarCanvas({
      ctx,
      canvasWidth,
      BAR_HEIGHT,
      annotations,
      viewStart,
      scale,
      visibleFrames,
      FRAME_COUNT,
    });
  }, [
    canvasWidth, BAR_HEIGHT, annotations, viewStart, scale, visibleFrames, FRAME_COUNT, summaryBarRef
  ]);


  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-0 sm:p-6">
      {/* URLバー */}
      <div className="w-full max-w-4xl mt-4 mb-6">
        <div className="bg-gradient-to-r from-slate-800/90 to-slate-700/90 backdrop-blur-xl border border-slate-600/30 rounded-xl h-12 flex items-center px-6 shadow-2xl font-mono text-sm text-slate-300 select-all relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <div className="w-px h-6 bg-slate-600/50 mx-2"></div>
            <span className="truncate text-slate-200">
              https://example.com/frame/{indexToFrame[currentIndex] ?? ""}
            </span>
          </div>
        </div>
      </div>

      {/* タイムライン */}
      <div ref={containerRef} className="w-full max-w-4xl relative group">
        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-slate-600/30 rounded-t-2xl shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5"></div>
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={100}
            className="block rounded-t-2xl relative z-10"
            style={{
              cursor: isPanning ? 'grabbing' : 'pointer',
              width: '100%',
              height: '120px',
              background: 'transparent',
              userSelect: 'none'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
          />
        </div>
        
        {/* サマリーバー */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl border-x border-b border-slate-600/30 rounded-b-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-cyan-500/5"></div>
          <canvas
            ref={summaryBarRef}
            width={canvasWidth}
            height={BAR_HEIGHT}
            className="block rounded-b-2xl relative z-10"
            style={{
              width: '100%',
              height: `${BAR_HEIGHT + 8}px`,
              background: 'transparent',
              userSelect: 'none',
              cursor: dragBarMode ? 'grabbing' : 'pointer'
            }}
            onMouseDown={handleSummaryBarMouseDown}
            onMouseMove={handleSummaryBarMouseMove}
            onMouseUp={handleSummaryBarMouseUp}
            onMouseLeave={handleSummaryBarMouseUp}
          />
        </div>
      </div>

      {/* 再生・速度 */}
      <div className="flex items-center gap-8 mt-8 mb-4">
        {/* 再生ボタン */}
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full blur-lg opacity-75 group-hover:opacity-100 transition-opacity duration-300"></div>
          <button
            className="relative w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 active:from-blue-600 active:to-purple-700 shadow-2xl text-white text-2xl focus:outline-none transform hover:scale-105 active:scale-95 transition-all duration-200"
            title={isPlaying ? "Stop" : "Play"}
            onClick={() => setIsPlaying(v => !v)}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-transparent"></div>
            <span className="relative z-10">
              {isPlaying ? '⏸' : '▶'}
            </span>
          </button>
        </div>

        {/* スピードバー */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-xl border border-slate-600/30 rounded-xl px-6 py-3 shadow-xl">
          <span className="text-slate-300 text-sm font-medium">Speed</span>
          <CustomSpeedBar value={playSpeed} min={1} max={60} onChange={v => setPlaySpeed(v)} />
          <span className="text-slate-200 text-sm font-mono font-bold min-w-8 text-right">{playSpeed}x</span>
        </div>
      </div>

      {/* 現在地表示 */}
      <div className="mt-4 mb-6 flex items-center justify-center w-full max-w-lg">
        <div className="bg-gradient-to-r from-slate-800/60 to-slate-700/60 backdrop-blur-xl border border-slate-600/30 rounded-2xl px-8 py-4 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="flex items-center gap-6 relative z-10">
            <div className="text-center">
              <div className="text-4xl font-mono font-bold text-transparent bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text select-none">
                {currentIndex ?? "-"} / {FRAME_COUNT}
              </div>
              <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Frame Position</div>
            </div>
            {indexToTimestamp[currentIndex] && (
              <div className="flex flex-col items-end">
                <div className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-slate-700/80 to-slate-600/80 text-slate-300 font-mono border border-slate-500/30">
                  {new Date(indexToTimestamp[currentIndex] * 1000).toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Timestamp</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TimelineUI;
