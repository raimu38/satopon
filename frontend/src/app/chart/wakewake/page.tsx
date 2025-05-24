'use client'

import React from 'react';
import { useTimelineLogic, FRAME_COUNT } from './useTimelineLogic';

function Timeline() {
  const logic = useTimelineLogic();

  return (
    <div className="flex flex-col items-center space-y-4 p-4 select-none">
      <div className="mb-2 w-full flex flex-col items-center">
        <div className="p-2 bg-gray-100 rounded font-mono text-gray-700 text-xs w-full text-center">
          現在地URL: <span className="font-bold text-blue-800">https://example.com/frame/{logic.currentIndex ?? 0}</span>
        </div>
      </div>
      <div ref={logic.containerRef} className="w-4/5">
        <div className="border border-gray-300 rounded shadow bg-white">
          <canvas
            ref={logic.canvasRef}
            width={logic.canvasWidth}
            height={100}
            className="block"
            style={{
              cursor: logic.isPanning ? 'grabbing' : 'pointer',
              width: '100%',
              height: '100px',
              userSelect: 'none'
            }}
            onMouseDown={logic.handleMouseDown}
            onMouseMove={logic.handleMouseMove}
            onMouseUp={logic.handleMouseUp}
            onWheel={logic.handleWheel}
            onContextMenu={logic.handleContextMenu}
          />
        </div>
        <div className="mt-2 w-full">
          <canvas
            ref={logic.summaryBarRef}
            width={logic.canvasWidth}
            height={logic.BAR_HEIGHT}
            className="block"
            style={{
              width: '100%',
              height: `${logic.BAR_HEIGHT}px`,
              userSelect: 'none',
              background: '#f3f4f6',
              cursor: logic.dragBarMode ? 'grabbing' : 'pointer'
            }}
            onMouseDown={logic.handleSummaryBarMouseDown}
            onMouseMove={logic.handleSummaryBarMouseMove}
            onMouseUp={logic.handleSummaryBarMouseUp}
            onMouseLeave={logic.handleSummaryBarMouseUp}
          />
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4">
        <button
          className="px-4 py-1 rounded bg-blue-500 text-white font-bold hover:bg-blue-600"
          onClick={() => logic.setIsPlaying((v: boolean) => !v)}
        >
          {logic.isPlaying ? '停止' : '再生'}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">スピード</span>
          <input
            type="range"
            min="1"
            max="60"
            value={logic.playSpeed}
            onChange={e => logic.setPlaySpeed(Number(e.target.value))}
            className="accent-blue-500"
            tabIndex={-1}
            onKeyDown={e => e.preventDefault()}
          />
          <span className="text-xs font-mono w-10 text-right">{logic.playSpeed} fps</span>
        </div>
      </div>
      <div className="w-full max-w-md">
        {logic.currentIndex !== null && (
          <span className="font-bold text-blue-600">現在地: {logic.currentIndex}</span>
        )}
      </div>
    </div>
  );
}

export default Timeline;
