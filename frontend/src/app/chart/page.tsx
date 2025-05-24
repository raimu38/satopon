'use client'

import React, { useState, useRef, useEffect } from 'react';

const FRAME_COUNT = 3000;
const MIN_SCALE = 0;
const MAX_SCALE = 100;
const INITIAL_SCALE = 8;
const BAR_HEIGHT = 50;
const LONG_PRESS_DELAY = 200; // ms


function Timeline() {
  const canvasRef = useRef(null);
  const summaryBarRef = useRef(null);
  const containerRef = useRef(null);

  const [canvasWidth, setCanvasWidth] = useState(800);
  const [scale, setScale] = useState(INITIAL_SCALE);

  const [viewStart, setViewStart] = useState(0);

  const [annotations, setAnnotations] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isDeleting, setIsDeleting] = useState(false);
  // 再生関連
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10); // 10fps相当
const [isArrowLongPress, setIsArrowLongPress] = useState(false);
const longPressTimerRef = useRef(null);
  // サマリーバー関連
  const [dragBarMode, setDragBarMode] = useState(null); // 'move', 'left', 'right', null
  const [barDragStartX, setBarDragStartX] = useState(null);
  const [barDragStartView, setBarDragStartView] = useState(null);
  const [barDragStartScale, setBarDragStartScale] = useState(null);

const [autoScrollState, setAutoScrollState] = useState({ direction: null, distance: 0 });
const autoScrollStateRef = useRef({ direction: null, distance: 0 });
const [autoScrollDirection, setAutoScrollDirection] = useState(null); // 'left' | 'right' | null
const autoScrollDirectionRef = useRef(null);
const [isSettingCurrentIndex, setIsSettingCurrentIndex] = useState(false);
const scrollDirectionRef = useRef(null); // 'left' | 'right' | null
const scrollIntervalRef = useRef(null);
const [barDragStartLeftFrame, setBarDragStartLeftFrame] = useState(null);
const [barDragStartRightFrame, setBarDragStartRightFrame] = useState(null);
  // visibleFramesは状態を持たず、scale/canvasWidthから常に計算
// visibleFramesは最大FRAME_COUNTまで
const visibleFrames = Math.min(FRAME_COUNT, Math.floor(canvasWidth / scale));
const arrowScrollIntervalRef = useRef(null);
const [arrowScrollDirection, setArrowScrollDirection] = useState(null); // 'left' | 'right' | null

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setCanvasWidth(w);
        setViewStart((vs) => Math.max(0, Math.min(FRAME_COUNT - Math.floor(w / scale), vs)));
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scale]);

  // --- メインタイムラインの描画 ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasWidth, 100);

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

    annotations.forEach(({ start, end }) => {
      if (end < viewStart || start > viewStart + visibleFrames - 1) return;
      const s = Math.max(start, viewStart);
      const e = Math.min(end, viewStart + visibleFrames - 1);
      const x = (s - viewStart) * scale;
      const w = (e - s + 1) * scale;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.fillRect(x, 0, w, 100);
    });

    if (isDragging && dragStart !== null && dragEnd !== null) {
      const s = Math.max(Math.min(dragStart, dragEnd), viewStart);
      const e = Math.min(Math.max(dragStart, dragEnd), viewStart + visibleFrames - 1);
      const x = (s - viewStart) * scale;
      const w = (e - s + 1) * scale;
      ctx.fillStyle = isDeleting
        ? 'rgba(253, 224, 71, 0.4)'
        : 'rgba(239, 68, 68, 0.20)';
      ctx.fillRect(x, 0, w, 100);
    }

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
  }, [scale, annotations, currentIndex, viewStart, canvasWidth, isDragging, dragEnd, isDeleting, visibleFrames]);

// 1. キーボードハンドラのuseEffectは一つだけ
// component の中
const currentIndexRef = useRef(currentIndex);
useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

useEffect(() => {
  let longPressTimer = null;
  let scrollInterval = null;
  const onKeyDown = (e) => {
    if (isPlaying || e.repeat) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const dir = e.key === 'ArrowRight' ? 'right' : 'left';
    setArrowScrollDirection(dir);
    setIsArrowLongPress(false);
    // 1回進める
    currentIndexRef.current =
      dir === 'right'
        ? Math.min(FRAME_COUNT - 1, currentIndexRef.current + 1)
        : Math.max(0, currentIndexRef.current - 1);
setCurrentIndex(idx => {
    const next = dir === 'right'
      ? Math.min(FRAME_COUNT - 1, idx + 1)
      : Math.max(0, idx - 1);
    ensureCurrentIndexVisible(next); // ★追加
    return next;
  });
    longPressTimer = setTimeout(() => {
      setIsArrowLongPress(true);
scrollInterval = setInterval(() => {
  setCurrentIndex(idx => {
    const next = dir === 'right'
      ? Math.min(FRAME_COUNT - 1, idx + 1)
      : Math.max(0, idx - 1);
    ensureCurrentIndexVisible(next); // ★追加
    return next;
  });
}, 1000 / playSpeed);
      arrowScrollIntervalRef.current = scrollInterval;
    }, LONG_PRESS_DELAY);
    longPressTimerRef.current = longPressTimer;
  };
  const onKeyUp = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    clearTimeout(longPressTimerRef.current);
    clearInterval(arrowScrollIntervalRef.current);
    setArrowScrollDirection(null);
    setIsArrowLongPress(false);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    clearTimeout(longPressTimer);
    clearInterval(scrollInterval);
  };
}, [isPlaying, playSpeed]);
// サマリーバー描画（角丸・グラデ・ハンドルつき）
useEffect(() => {
  const canvas = summaryBarRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvasWidth, BAR_HEIGHT);

  // アノテーションの赤
  annotations.forEach(({ start, end }) => {
    const x = (start / FRAME_COUNT) * canvasWidth;
    const w = ((end - start + 1) / FRAME_COUNT) * canvasWidth;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.fillRect(x, 6, w, BAR_HEIGHT - 12);
  });

  // 新仕様：青色範囲は「ハンドルの内側」
  const handleW = 5, handleH = BAR_HEIGHT - 8;
  // 範囲端（ハンドル間）
const minSelW = 4; // 青バーの最小幅
  let selW = (visibleFrames / FRAME_COUNT) * canvasWidth - handleW;
  if (selW < minSelW) selW = minSelW;
  const selX = (viewStart / FRAME_COUNT) * canvasWidth + handleW / 2;
  const radius = 1;

  ctx.beginPath();
  ctx.roundRect(selX, 4, selW, BAR_HEIGHT - 8, radius);

  // グラデーション
  const grad = ctx.createLinearGradient(selX, 0, selX + selW, 0);
  grad.addColorStop(0, 'rgba(37,99,235,0.18)');
  grad.addColorStop(0.5, 'rgba(37,99,235,0.36)');
  grad.addColorStop(1, 'rgba(37,99,235,0.18)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2563eb';
  ctx.stroke();

  // ハンドル
  const leftHandleX = selX - handleW / 2;
  const rightHandleX = selX + selW - handleW / 2;

  // 左ハンドル
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(leftHandleX, 4, handleW, handleH, 4);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#2563eb';
  ctx.stroke();
  ctx.restore();

  // 右ハンドル
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rightHandleX, 4, handleW, handleH, 4);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#2563eb';
  ctx.stroke();
  ctx.restore();
}, [canvasWidth, annotations, viewStart, scale, visibleFrames]);

const ensureCurrentIndexVisible = (index) => {
  if (index < viewStart) {
    setViewStart(index);
  } else if (index >= viewStart + visibleFrames) {
    setViewStart(Math.min(FRAME_COUNT - visibleFrames, index - visibleFrames + 1));
  }
};

// 再生
useEffect(() => {
  if (!isPlaying) return;
  const interval = setInterval(() => {
    setCurrentIndex(prev => {
      if (prev >= FRAME_COUNT - 1) {
        setIsPlaying(false);
        return prev;
      }
      const next = prev + 1;
      ensureCurrentIndexVisible(next);
      return next;
    });
  }, 1000 / playSpeed);
  return () => clearInterval(interval);
}, [isPlaying, playSpeed, viewStart, visibleFrames]);
// キーボード（長押し含む） も同じく
const onKeyDown = (e) => {
  // ...
  setCurrentIndex(idx => {
    const next = dir === 'right' ? Math.min(FRAME_COUNT - 1, idx + 1) : Math.max(0, idx - 1);
    ensureCurrentIndexVisible(next);
    return next;
  });
  // ...
}
  // 再生処理
useEffect(() => {
  if (!isPlaying) return;
  const interval = setInterval(() => {
    setCurrentIndex(prev => {
      if (prev === null) return 0;
      if (prev >= FRAME_COUNT - 1) {
        setIsPlaying(false);
        return prev;
      }
      const nextIndex = prev + 1;
      // 現在地が画面右端を超えたらviewStartを“必要なだけ”進める
      if (nextIndex >= viewStart + visibleFrames) {
        setViewStart(Math.min(FRAME_COUNT - visibleFrames, nextIndex - visibleFrames + 1));
      }
      return nextIndex;
    });
  }, 1000 / playSpeed);
  return () => clearInterval(interval);
}, [isPlaying, playSpeed, viewStart, visibleFrames]);




useEffect(() => {
  if (!isSettingCurrentIndex) return;

  const handleGlobalMouseMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (!canvas || !rect) return;

    let direction = null, distance = 0;

    if (e.clientX < rect.left) {
      direction = 'left';
      distance = rect.left - e.clientX;
      setCurrentIndex(viewStart);
    } else if (e.clientX > rect.right) {
      direction = 'right';
      distance = e.clientX - rect.right;
      setCurrentIndex(viewStart + visibleFrames - 1);
    } else {
      setCurrentIndex(getFrameIndexAtX(e.clientX));
    }
    setAutoScrollState({ direction, distance });
    autoScrollStateRef.current = { direction, distance };

    // ここでdirectionも保存
    setAutoScrollDirection(direction);
    autoScrollDirectionRef.current = direction;
  };

  const handleGlobalMouseUp = () => {
    setIsSettingCurrentIndex(false);
    setAutoScrollDirection(null);
    autoScrollDirectionRef.current = null;
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  window.addEventListener('mousemove', handleGlobalMouseMove);
  window.addEventListener('mouseup', handleGlobalMouseUp);

  return () => {
    window.removeEventListener('mousemove', handleGlobalMouseMove);
    window.removeEventListener('mouseup', handleGlobalMouseUp);
  };
}, [isSettingCurrentIndex, viewStart, visibleFrames]);

useEffect(() => {
  if (!isSettingCurrentIndex || !autoScrollDirection) {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    return;
  }

  if (scrollIntervalRef.current) {
    clearInterval(scrollIntervalRef.current);
    scrollIntervalRef.current = null;
  }

  scrollIntervalRef.current = setInterval(() => {
    setViewStart((vs) => {
      if (autoScrollDirectionRef.current === 'left') {
        if (vs > 0) {
          setCurrentIndex(idx => Math.max(0, idx - 1));
          return vs - 1;
        }
      } else if (autoScrollDirectionRef.current === 'right') {
        if (vs < FRAME_COUNT - visibleFrames) {
          setCurrentIndex(idx => Math.min(FRAME_COUNT - 1, idx + 1));
          return vs + 1;
        }
      }
      return vs;
    });
  }, 16);

  return () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };
}, [isSettingCurrentIndex, autoScrollDirection, visibleFrames]);

  // --- 補助関数 ---
const getFrameIndexAtX = (clientX) => {
  const canvas = canvasRef.current;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  let x = (clientX - rect.left) * scaleX;
  // 範囲外ならはみ出し量に応じて計算
  if (x < 0) x = 0;
  if (x > canvas.width) x = canvas.width;
  return Math.max(0, Math.min(FRAME_COUNT - 1, Math.floor(x / scale) + viewStart));
};

  const addAnnotation = (start, end) => {
    let s = Math.min(start, end);
    let e = Math.max(start, end);
    let newAnnotations = [];
    annotations.forEach(a => {
      if (e + 1 >= a.start && s - 1 <= a.end) {
        s = Math.min(s, a.start);
        e = Math.max(e, a.end);
      } else {
        newAnnotations.push(a);
      }
    });
    newAnnotations.push({ start: s, end: e });
    newAnnotations.sort((a, b) => a.start - b.start);
    setAnnotations(newAnnotations);
  };

  // --- メインタイムライン：マウス操作 ---
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(null);
  const [panViewStart, setPanViewStart] = useState(0);

const handleMouseDown = (e) => {
  if (e.button === 1) { // 中ボタン（スクロール開始）
    e.preventDefault();
    setIsPanning(true);
    setPanStartX(e.clientX);
    setPanViewStart(viewStart);
    return;
  }
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
    return;
  }
if (e.button === 0) {
    e.preventDefault();
    setIsSettingCurrentIndex(true);
    // 最初にcurrentIndexを設定
    const index = getFrameIndexAtX(e.clientX);
    setCurrentIndex(index);
  }
};
const handleMouseMove = (e) => {
  if (isPanning) {
    // 中ボタンでのみスクロール
    const dx = e.clientX - panStartX;
    const frameShift = -Math.round(dx / scale);
    let next = panViewStart + frameShift;
    next = Math.max(0, Math.min(FRAME_COUNT - visibleFrames, next));
    setViewStart(next);
    // currentIndexは変えない（必要ならここに追従処理入れても良いが、今は要求されていない）
  }
  if (isSettingCurrentIndex) {
    // 左ボタンドラッグ中はcurrentIndexのみ更新
    const index = getFrameIndexAtX(e.clientX);
    setCurrentIndex(index);
  }
  if (!isDragging) return;
  const index = getFrameIndexAtX(e.clientX);
  setDragEnd(index);
  setCurrentIndex(index);
};


const handleMouseUp = (e) => {
  setIsPanning(false);
  setIsSettingCurrentIndex(false); // 追加
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

  const handleContextMenu = (e) => {
    e.preventDefault();
    const index = getFrameIndexAtX(e.clientX);
    setCurrentIndex(index);
  };


// 2. ズーム時のscale制約
const handleWheel = (e) => {
  e.preventDefault();
  const { left } = canvasRef.current.getBoundingClientRect();
  const x = e.clientX - left;
  const mouseFrame = Math.floor(x / scale) + viewStart;

  let minScale = canvasWidth / FRAME_COUNT;
  let newScale = scale + (e.deltaY < 0 ? 1 : -1);
  newScale = Math.max(minScale, Math.min(MAX_SCALE, newScale));
  if (newScale === scale) return;

  const newVisible = Math.min(FRAME_COUNT, Math.floor(canvasWidth / newScale));
  let newViewStart = mouseFrame - Math.floor((x / canvasWidth) * newVisible);
  newViewStart = Math.max(0, Math.min(FRAME_COUNT - newVisible, newViewStart));
  setScale(newScale);
  setViewStart(newViewStart);
};

  // --- サマリーバーの操作 ---
const handleSummaryBarMouseDown = (e) => {
  const rect = summaryBarRef.current.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const selX = (viewStart / FRAME_COUNT) * canvasWidth;
  const selW = (visibleFrames / FRAME_COUNT) * canvasWidth;

  if (Math.abs(x - selX) < 8) {
    setDragBarMode('left');
    setBarDragStartX(x);
    setBarDragStartView(viewStart);
    setBarDragStartScale(scale);
    setBarDragStartRightFrame(viewStart + visibleFrames); // 右端固定
    setBarDragStartLeftFrame(null);
  } else if (Math.abs(x - (selX + selW)) < 8) {
    setDragBarMode('right');
    setBarDragStartX(x);
    setBarDragStartView(viewStart);
    setBarDragStartScale(scale);
    setBarDragStartLeftFrame(viewStart); // 左端固定
    setBarDragStartRightFrame(null);
  } else if (x > selX && x < selX + selW) {
    setDragBarMode('move');
    setBarDragStartX(x);
    setBarDragStartView(viewStart);
    setBarDragStartScale(scale);
    setBarDragStartLeftFrame(null);
    setBarDragStartRightFrame(null);
  }
};
const handleSummaryBarMouseMove = (e) => {
  const canvas = summaryBarRef.current;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const totalFrames = FRAME_COUNT;

  // --- カーソル変更 ---
const handleW = 6; // 少し広めに。これを判定にも描画にも使う
const minSelW = handleW * 2; // 両端ハンドル分の幅は常に確保
let selW = (visibleFrames / FRAME_COUNT) * canvasWidth - handleW;
if (selW < minSelW) selW = minSelW;
const selX = (viewStart / FRAME_COUNT) * canvasWidth + handleW / 2;

 // --- カーソル変更 ---
  if (dragBarMode) {
    // ドラッグ中は状態に応じて強制
    if (dragBarMode === 'move') {
      canvas.style.cursor = 'grabbing';
    } else if (dragBarMode === 'left' || dragBarMode === 'right') {
      canvas.style.cursor = 'ew-resize';
    }
  } else {
    // ドラッグしていない時だけ、ハンドル範囲で判定
    if (Math.abs(x - selX) < handleW || Math.abs(x - (selX + selW)) < handleW) {
      canvas.style.cursor = 'ew-resize';
    } else if (x > selX && x < selX + selW) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'pointer';
    }
  }

  if (!dragBarMode) return;

  if (dragBarMode === 'move' && barDragStartX !== null) {
    const dx = x - barDragStartX;
    const frameShift = Math.round((dx / canvasWidth) * totalFrames);
    let newStart = barDragStartView + frameShift;
    newStart = Math.max(0, Math.min(FRAME_COUNT - visibleFrames, newStart));
    setViewStart(newStart);
  }
  if (dragBarMode === 'left') {
    // 右端は固定
    let rightFrame = barDragStartRightFrame ?? (barDragStartView + visibleFrames);
    let leftFrame = Math.round((x / canvasWidth) * totalFrames);
    leftFrame = Math.max(0, Math.min(rightFrame - 1, leftFrame));
    let newFrames = rightFrame - leftFrame;
    newFrames = Math.max(1, Math.min(FRAME_COUNT, newFrames));
    let newScale = canvasWidth / newFrames;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    setScale(newScale);
    setViewStart(leftFrame);
  }
  if (dragBarMode === 'right') {
    // 左端は固定
    let leftFrame = barDragStartLeftFrame ?? barDragStartView;
    let rightFrame = Math.round((x / canvasWidth) * totalFrames);
    rightFrame = Math.max(leftFrame + 1, Math.min(FRAME_COUNT, rightFrame));
    let newFrames = rightFrame - leftFrame;
    newFrames = Math.max(1, Math.min(FRAME_COUNT, newFrames));
    let newScale = canvasWidth / newFrames;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    setScale(newScale);
    setViewStart(leftFrame);
  }
};
const handleSummaryBarMouseUp = (e) => {
  setDragBarMode(null);
  setBarDragStartX(null);
  setBarDragStartView(null);
  setBarDragStartScale(null);
  setBarDragStartLeftFrame(null);
  setBarDragStartRightFrame(null);
};

  return (
    <div className="flex flex-col items-center space-y-4 p-4 select-none">
      {/* URL表示 */}
      <div className="mb-2 w-full flex flex-col items-center">
        <div className="p-2 bg-gray-100 rounded font-mono text-gray-700 text-xs w-full text-center">
          現在地URL: <span className="font-bold text-blue-800">https://example.com/frame/{currentIndex ?? 0}</span>
        </div>
      </div>
      <div ref={containerRef} className="w-4/5">
        {/* 上部：詳細タイムライン */}
        <div className="border border-gray-300 rounded shadow bg-white">
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={100}
            className="block"
            style={{ cursor: isPanning ? 'grabbing' : 'pointer', width: '100%', height: '100px', userSelect: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
          />
        </div>
        {/* 下部：全体サマリーバー */}
        <div className="mt-2 w-full">
<canvas
  ref={summaryBarRef}
  width={canvasWidth}
  height={BAR_HEIGHT}
  className="block"
  style={{ width: '100%', height: `${BAR_HEIGHT}px`, userSelect: 'none', background: '#f3f4f6', cursor: dragBarMode ? 'grabbing' : 'pointer' }}
  onMouseDown={handleSummaryBarMouseDown}
  onMouseMove={handleSummaryBarMouseMove}
  onMouseUp={handleSummaryBarMouseUp}
  onMouseLeave={handleSummaryBarMouseUp} // ←これを追加
/>
        </div>
      </div>
      {/* 再生・スピード調整 */}
      <div className="flex items-center gap-4 mt-4">
        <button
          className="px-4 py-1 rounded bg-blue-500 text-white font-bold hover:bg-blue-600"
          onClick={() => setIsPlaying(v => !v)}
        >
          {isPlaying ? '停止' : '再生'}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">スピード</span>
          <input
            type="range"
            min="1"
            max="60"
            value={playSpeed}
            onChange={e => setPlaySpeed(Number(e.target.value))}
            className="accent-blue-500"
          />
          <span className="text-xs font-mono w-10 text-right">{playSpeed} fps</span>
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
