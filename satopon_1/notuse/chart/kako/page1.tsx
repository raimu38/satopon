
'use client'

import React, { useState, useRef, useEffect } from 'react';

const FRAME_COUNT = 1000;
const MIN_SCALE = 2;
const MAX_SCALE = 200;
const INITIAL_SCALE = 8;

function Timeline() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // 画面幅の80%をキャンバス幅に
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [viewStart, setViewStart] = useState(0); // 表示の先頭フレームindex
  const [annotations, setAnnotations] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(null);

const [isDeleting, setIsDeleting] = useState(false);
  // リサイズでcanvasWidth更新
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setCanvasWidth(containerRef.current.offsetWidth);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 表示できるフレーム数
  const visibleFrames = Math.floor(canvasWidth / scale);

  // 描画
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasWidth, 100);

    // グリッド & インデックス
    for (let i = 0; i < visibleFrames; i++) {
      const frameIndex = viewStart + i;
      if (frameIndex >= FRAME_COUNT) continue;
      const x = i * scale;
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(x, 0, scale - 2, 100);
      ctx.fillStyle = '#111827';
      ctx.font = '12px sans-serif';
      if (scale >= 10 || frameIndex % Math.ceil(10 / scale) === 0) {
        ctx.fillText(frameIndex, x + 4, 30);
      }
    }

    // アノテーション
    annotations.forEach(({ start, end }) => {
      // 表示範囲外なら描画しない
      if (end < viewStart || start > viewStart + visibleFrames - 1) return;
      const s = Math.max(start, viewStart);
      const e = Math.min(end, viewStart + visibleFrames - 1);
      const x = (s - viewStart) * scale;
      const w = (e - s + 1) * scale;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.fillRect(x, 0, w, 100);
    });

    // ドラッグ中のアノテーション（リアルタイム）
if (isDragging && dragStart !== null && dragEnd !== null) {
  const s = Math.max(Math.min(dragStart, dragEnd), viewStart);
  const e = Math.min(Math.max(dragStart, dragEnd), viewStart + visibleFrames - 1);
  const x = (s - viewStart) * scale;
  const w = (e - s + 1) * scale;
  ctx.fillStyle = isDeleting
    ? 'rgba(253, 224, 71, 0.4)' // 黄色(Tailwind yellow-300)
    : 'rgba(239, 68, 68, 0.20)'; // 赤
  ctx.fillRect(x, 0, w, 100);
}

    // 現在地表示
    if (currentIndex !== null && currentIndex >= viewStart && currentIndex < viewStart + visibleFrames) {
      const x = (currentIndex - viewStart) * scale + scale / 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 100);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(currentIndex, x + 6, 90);
    }
  };

  useEffect(() => {
    draw();
  }, [scale, annotations, currentIndex, viewStart, canvasWidth, isDragging, dragEnd]);

const getFrameIndexAtX = (clientX) => {
  const canvas = canvasRef.current;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const x = (clientX - rect.left) * scaleX;
  return Math.max(0, Math.min(FRAME_COUNT - 1, Math.floor(x / scale) + viewStart));
};

const addAnnotation = (start, end) => {
  let s = Math.min(start, end);
  let e = Math.max(start, end);
  let newAnnotations = [];
  annotations.forEach(a => {
    // 重複または隣接していたらマージ
    if (e + 1 >= a.start && s - 1 <= a.end) {
      s = Math.min(s, a.start);
      e = Math.max(e, a.end);
    } else {
      newAnnotations.push(a);
    }
  });
  newAnnotations.push({ start: s, end: e });
  // ソートして管理したい場合はここでsort
  newAnnotations.sort((a, b) => a.start - b.start);
  setAnnotations(newAnnotations);
};
  // 右クリックドラッグ or ワンクリック
// 右クリック押下
const handleMouseDown = (e) => {
  if (e.button === 2) {
    e.preventDefault();
    const index = getFrameIndexAtX(e.clientX);

    if (e.ctrlKey) {
      setIsDeleting(true);
      setIsDragging(true);
      setDragStart(index);
      setDragEnd(index);
      return;
    }

    setIsDragging(true);
    setDragStart(index);
    setDragEnd(index);
    setIsDeleting(false);
  }
if (e.button === 0) {
    e.preventDefault();
    setIsPanning(true);
    setPanStartX(e.clientX);
    setPanViewStart(viewStart);

    // 追加: 左クリックで現在地を更新
    const index = getFrameIndexAtX(e.clientX);
    setCurrentIndex(index);
  }
};

const handleMouseMove = (e) => {
  if (!isDragging) return;
  const index = getFrameIndexAtX(e.clientX);
  setDragEnd(index);
  setCurrentIndex(index); // ここを追加
};

const handleMouseUp = (e) => {
  if (isDragging && dragStart !== null && dragEnd !== null) {
    const start = Math.min(dragStart, dragEnd);
    const end = Math.max(dragStart, dragEnd);

if (isDeleting) {
  setAnnotations(prev => {
    let next = [];
    prev.forEach(a => {
      if (a.end < start || a.start > end) {
        next.push(a);
      }
      if (a.start < start && a.end >= start) {
        next.push({ start: a.start, end: start - 1 });
      }
      if (a.end > end && a.start <= end) {
        next.push({ start: end + 1, end: a.end });
      }
    });
    return next.sort((a, b) => a.start - b.start);
  });

    } else {
      addAnnotation(start, end);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setIsDeleting(false);
  }
};

  // 右クリックワンクリックで現在地も表示
const handleContextMenu = (e) => {
  e.preventDefault();
  const index = getFrameIndexAtX(e.clientX);
  setCurrentIndex(index);
};

  // 左ドラッグやクリックでパン
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(null);
  const [panViewStart, setPanViewStart] = useState(0);

  const handleLeftMouseDown = (e) => {
    if (e.button === 0) {
      e.preventDefault();
      setIsPanning(true);
      setPanStartX(e.clientX);
      setPanViewStart(viewStart);
    }
  };
  const handleLeftMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const frameShift = -Math.round(dx / scale);
      let next = panViewStart + frameShift;
      next = Math.max(0, Math.min(FRAME_COUNT - visibleFrames, next));
      setViewStart(next);
    }
  };
  const handleLeftMouseUp = (e) => {
    setIsPanning(false);
  };

  // ホイールでズーム
  const handleWheel = (e) => {
    e.preventDefault();
    const { left } = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - left;
    const mouseFrame = Math.floor(x / scale) + viewStart;

    let newScale = scale + (e.deltaY < 0 ? 1 : -1);
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (newScale === scale) return;

    // 拡大縮小してもカーソル位置のフレームが固定されるようにviewStart調整
    const newVisible = Math.floor(canvasWidth / newScale);
    let newViewStart = mouseFrame - Math.floor((x / canvasWidth) * newVisible);
    newViewStart = Math.max(0, Math.min(FRAME_COUNT - newVisible, newViewStart));
    setScale(newScale);
    setViewStart(newViewStart);
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-4 select-none">
      <div ref={containerRef} className="w-4/5">
        <div className="border border-gray-300 rounded shadow bg-white">
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={100}
            className="block"
            style={{ cursor: isPanning ? 'grabbing' : 'pointer', width: '100%', height: '100px', userSelect: 'none' }}
            onMouseDown={e => { handleMouseDown(e); handleLeftMouseDown(e); }}
            onMouseMove={e => { handleMouseMove(e); handleLeftMouseMove(e); }}
            onMouseUp={e => { handleMouseUp(e); handleLeftMouseUp(e); }}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
          />
        </div>
      </div>
      <div className="w-full max-w-md">
        {currentIndex !== null && (
          <span className="font-bold text-blue-600">現在地: {currentIndex}</span>
        )}
      </div>
    </div>
  );
}

export default Timeline;
