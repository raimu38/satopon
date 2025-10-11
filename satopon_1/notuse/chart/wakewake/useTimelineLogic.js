import { useState, useRef, useEffect, useCallback } from 'react';

// ==== 画像パス生成 ====
function generateImagePaths(count = 1000, minFrame = 100, maxFrame = 30000, baseTimestamp = 1684875600) {
  const used = new Set();
  const frames = [];
  while (frames.length < count) {
    const f = Math.floor(Math.random() * (maxFrame - minFrame + 1)) + minFrame;
    if (!used.has(f)) {
      frames.push(f);
      used.add(f);
    }
  }
  frames.sort((a, b) => a - b);
  let t = baseTimestamp;
  return frames.map(frame => {
    const isAnomaly = Math.random() < 0.2;
    const fractionalSec = (Math.random() * 0.999999).toFixed(6);
    const suffix = isAnomaly ? "_anomaly" : "";
    const p = `images/${frame}_${t}.${fractionalSec}${suffix}.jpg`;
    t += Math.floor(Math.random() * 11) + 5;
    return p;
  });
}

// ==== 画像名パース ====
function parseImageName(path) {
  const fn = path.split('/').pop().replace('.jpg', '');
  const [frameStr, timestampStr, ...rest] = fn.split('_');
  const [timestamp, fraction] = timestampStr.split('.');
  return {
    frame: parseInt(frameStr, 10),
    timestamp: parseInt(timestamp, 10),
    isAnomaly: rest.length === 1,
  };
}

// ==== 連続anomaly index配列→range配列 ====
function buildErrorRanges(indices) {
  if (!indices.length) return [];
  indices.sort((a, b) => a - b);
  const ranges = [];
  let start = indices[0], end = indices[0];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === end + 1) end = indices[i];
    else {
      ranges.push({ start, end });
      start = end = indices[i];
    }
  }
  ranges.push({ start, end });
  return ranges;
}

// ==== アノテーションの差分比較（Undo/Redo時のAPI差分検出） ====
function diffAnnotations(oldArr, newArr, indexToFrame) {
  newArr.forEach(n => {
    if (!oldArr.some(o => o.start === n.start && o.end === n.end)) {
      console.log("[API送信: add][undo/redo]", {
        action: "add",
        range: { startFrame: indexToFrame[n.start], endFrame: indexToFrame[n.end] }
      });
    }
  });
  oldArr.forEach(o => {
    if (!newArr.some(n => n.start === o.start && n.end === o.end)) {
      console.log("[API送信: remove][undo/redo]", {
        action: "remove",
        range: { startFrame: indexToFrame[o.start], endFrame: indexToFrame[o.end] }
      });
    }
  });
}

const MIN_SCALE = 0;
const MAX_SCALE = 40;
const INITIAL_SCALE = 8;
const BAR_HEIGHT = 50;
const LONG_PRESS_DELAY = 200;

// ==== カスタムフック ====
export function useTimelineLogic() {
  // 1. データ関連state
  const [imagePaths, setImagePaths] = useState([]);
  const [frameToIndex, setFrameToIndex] = useState({});
  const [indexToFrame, setIndexToFrame] = useState({});
  const [indexToTimestamp, setIndexToTimestamp] = useState({});
  const [FRAME_COUNT, setFRAME_COUNT] = useState(0);

  // 2. タイムライン状態
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [viewStart, setViewStart] = useState(0);
  const [annotations, setAnnotations] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // 3. 操作系状態
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(null);
  const [panViewStart, setPanViewStart] = useState(0);
  const [isSettingCurrentIndex, setIsSettingCurrentIndex] = useState(false);

  // サマリーバー
  const [dragBarMode, setDragBarMode] = useState(null); // 'move', 'left', 'right', null
  const [barDragStartX, setBarDragStartX] = useState(null);
  const [barDragStartView, setBarDragStartView] = useState(null);
  const [barDragStartScale, setBarDragStartScale] = useState(null);
  const [barDragStartLeftFrame, setBarDragStartLeftFrame] = useState(null);
  const [barDragStartRightFrame, setBarDragStartRightFrame] = useState(null);

  // Undo/Redo
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // 自動スクロール
  const [autoScrollState, setAutoScrollState] = useState({ direction: null, distance: 0 });
  const [autoScrollDirection, setAutoScrollDirection] = useState(null);
  const autoScrollStateRef = useRef({ direction: null, distance: 0 });
  const autoScrollDirectionRef = useRef(null);
  const scrollIntervalRef = useRef(null);

  // Refs
  const canvasRef = useRef(null);
  const summaryBarRef = useRef(null);
  const containerRef = useRef(null);

  // visibleFrames（常に最新）
  const visibleFrames = FRAME_COUNT > 0 && scale > 0 && canvasWidth > 0
    ? Math.min(FRAME_COUNT, Math.floor(canvasWidth / scale))
    : 1;

  // ========== 初期化 ========== //
  useEffect(() => {
    const paths = generateImagePaths(1000, 100, 30000, 1684875600);
    setImagePaths(paths);
    const parsed = paths.map(parseImageName);
    const allFrames = Array.from(new Set(parsed.map(p => p.frame))).sort((a, b) => a - b);

    // マッピング
    const frame2idx = {}, idx2frame = {}, idx2timestamp = {};
    allFrames.forEach((f, i) => {
      frame2idx[f] = i;
      idx2frame[i] = f;
      const img = parsed.find(p => p.frame === f);
      idx2timestamp[i] = img?.timestamp ?? null;
    });
    setFrameToIndex(frame2idx);
    setIndexToFrame(idx2frame);
    setFRAME_COUNT(allFrames.length);
    setIndexToTimestamp(idx2timestamp);

    // anomaly
    const anomalyFrames = parsed.filter(p => p.isAnomaly).map(p => frame2idx[p.frame]);
    const initialRanges = buildErrorRanges(anomalyFrames).map(({ start, end }) => ({ start, end }));
    setAnnotations(initialRanges);
    setCurrentIndex(0);
    setViewStart(0);
    setScale(INITIAL_SCALE);
    setHistory([]);
    setRedoStack([]);
  }, []);

  // ========== Undo/Redo管理 ========== //
  const pushHistory = useCallback(() => {
    setHistory(prev => [...prev, annotations]);
    setRedoStack([]);
  }, [annotations]);
  // Undo/Redoショートカット
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (history.length > 0) {
          setRedoStack(rs => [...rs, annotations]);
          const prev = history[history.length - 1];
          diffAnnotations(annotations, prev, indexToFrame);
          setAnnotations(prev);
          setHistory(h => h.slice(0, -1));
        }
      }
      // Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (redoStack.length > 0) {
          setHistory(h => [...h, annotations]);
          const next = redoStack[redoStack.length - 1];
          diffAnnotations(annotations, next, indexToFrame);
          setAnnotations(next);
          setRedoStack(rs => rs.slice(0, -1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [annotations, history, redoStack, indexToFrame]);

  // ========== アノテーション追加/削除 ========== //
  const addAnnotation = useCallback((start, end) => {
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

    // API送信例
    console.log("[API送信: add]", {
      action: "add",
      range: { startFrame: indexToFrame[s], endFrame: indexToFrame[e] }
    });
  }, [annotations, indexToFrame]);

  const handleAddWithHistory = (start, end) => {
    pushHistory();
    addAnnotation(start, end);
  };

  const handleRemoveWithHistory = (start, end) => {
    pushHistory();
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
      // API送信
      console.log("[API送信: remove]", {
        action: "remove",
        range: { startFrame: indexToFrame[start], endFrame: indexToFrame[end] }
      });
      return next.sort((a, b) => a.start - b.start);
    });
  };

  // ========== Index移動/再生/visible管理 ========== //
  const makeFrameVisible = useCallback((idx) => {
    setViewStart(vs => {
      const vis = visibleFrames;
      if (idx < vs) return idx;
      if (idx >= vs + vis) return Math.min(FRAME_COUNT - vis, idx - vis + 1);
      return vs;
    });
  }, [visibleFrames, FRAME_COUNT]);
  const setCurrentIndexWithVisible = useCallback((idx) => {
    setCurrentIndex(() => {
      makeFrameVisible(idx);
      return idx;
    });
  }, [makeFrameVisible]);

  // キーボード左右ステップ移動＋長押しrepeat
  const longPressTimerRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const arrowDirectionRef = useRef(null);
  const stepMove = useCallback((dir) => {
    setCurrentIndex(idx => {
      let nextIdx = idx + (dir === 'right' ? 1 : -1);
      nextIdx = Math.max(0, Math.min(FRAME_COUNT - 1, nextIdx));
      makeFrameVisible(nextIdx);
      return nextIdx;
    });
  }, [FRAME_COUNT, makeFrameVisible, visibleFrames]);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isPlaying) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const dir = e.key === 'ArrowRight' ? 'right' : 'left';
      if (arrowDirectionRef.current === dir) return;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (repeatTimerRef.current) clearInterval(repeatTimerRef.current);
      arrowDirectionRef.current = dir;
      stepMove(dir);
      longPressTimerRef.current = setTimeout(() => {
        repeatTimerRef.current = setInterval(() => stepMove(dir), 1000 / playSpeed);
      }, LONG_PRESS_DELAY);
    };
    const handleKeyUp = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const dir = e.key === 'ArrowRight' ? 'right' : 'left';
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (repeatTimerRef.current) clearInterval(repeatTimerRef.current);
      if (arrowDirectionRef.current === dir) arrowDirectionRef.current = null;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (repeatTimerRef.current) clearInterval(repeatTimerRef.current);
      longPressTimerRef.current = null;
      repeatTimerRef.current = null;
      arrowDirectionRef.current = null;
    };
  }, [playSpeed, isPlaying, visibleFrames, stepMove]);

  // 再生自動送り
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        if (prev >= FRAME_COUNT - 1) {
          setIsPlaying(false);
          return prev;
        }
        const next = prev + 1;
        makeFrameVisible(next);
        return next;
      });
    }, 1000 / playSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, viewStart, visibleFrames, FRAME_COUNT, makeFrameVisible]);

  // ========== グローバルマウスmove/upでautoスクロール等 ========== //
  const setSingleAutoScrollDirection = useCallback((dir) => {
    if (autoScrollDirectionRef.current === dir) return;
    setAutoScrollDirection(dir);
    autoScrollDirectionRef.current = dir;
  }, []);
  useEffect(() => {
    if (!(isSettingCurrentIndex || isDragging)) return;
    const handleGlobalMouseMove = (e) => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (!canvas || !rect) return;
      let newIndex;
      let direction = null, distance = 0;
      if (e.clientX < rect.left) {
        newIndex = viewStart;
        direction = 'left';
        distance = rect.left - e.clientX;
      } else if (e.clientX > rect.right) {
        newIndex = viewStart + visibleFrames - 1;
        direction = 'right';
        distance = e.clientX - rect.right;
      } else {
        newIndex = getFrameIndexAtX(e.clientX);
      }
      if (isSettingCurrentIndex) setCurrentIndexWithVisible(newIndex);
      if (isDragging) {
        setDragEnd(newIndex);
        setCurrentIndex(newIndex);
        makeFrameVisible(newIndex);
      }
      setAutoScrollState({ direction, distance });
      autoScrollStateRef.current = { direction, distance };
      setSingleAutoScrollDirection(direction);
    };
    const handleGlobalMouseUp = () => {
      setIsSettingCurrentIndex(false);
      setIsDragging(false);
      setSingleAutoScrollDirection(null);
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isSettingCurrentIndex, isDragging, viewStart, visibleFrames, makeFrameVisible, setCurrentIndexWithVisible, setSingleAutoScrollDirection]);

  useEffect(() => {
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    if (!(isSettingCurrentIndex || isDragging) || !autoScrollDirection) return;
    scrollIntervalRef.current = setInterval(() => {
      const dir = autoScrollDirectionRef.current;
      const step = dir === 'left' ? -1 : 1;
      if (isSettingCurrentIndex) {
        setCurrentIndex(prevIdx => {
          const next = Math.max(0, Math.min(FRAME_COUNT - 1, prevIdx + step));
          makeFrameVisible(next);
          return next;
        });
      }
      if (isDragging) {
        setDragEnd(prev => {
          const next = Math.max(0, Math.min(FRAME_COUNT - 1, prev + step));
          setCurrentIndex(next);
          makeFrameVisible(next);
          return next;
        });
      }
    }, 16);
    return () => clearInterval(scrollIntervalRef.current);
  }, [isSettingCurrentIndex, isDragging, autoScrollDirection, FRAME_COUNT, makeFrameVisible]);

  // ========== 補助関数 ========== //
  const getFrameIndexAtX = useCallback((clientX) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const scaleX = canvas && rect ? canvas.width / rect.width : 1;
    let x = rect ? (clientX - rect.left) * scaleX : 0;
    if (x < 0) x = 0;
    if (canvas && x > canvas.width) x = canvas.width;
    return Math.max(0, Math.min(FRAME_COUNT - 1, Math.floor(x / scale) + viewStart));
  }, [canvasRef, scale, viewStart, FRAME_COUNT]);

  // ========== タイムライン・マウスイベント ========== //
  const handleMouseDown = useCallback((e) => {
    if (e.button === 1) { // middle: パン
      e.preventDefault();
      setIsPanning(true);
      setPanStartX(e.clientX);
      setPanViewStart(viewStart);
      return;
    }
    if (e.button === 2) { // right: 削除or追加ドラッグ
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
    if (e.button === 0) { // left: インデックス
      e.preventDefault();
      setIsSettingCurrentIndex(true);
      const index = getFrameIndexAtX(e.clientX);
      setCurrentIndexWithVisible(index);
    }
  }, [viewStart, getFrameIndexAtX, setCurrentIndexWithVisible]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const frameShift = -Math.round(dx / scale);
      let next = panViewStart + frameShift;
      next = Math.max(0, Math.min(FRAME_COUNT - visibleFrames, next));
      setViewStart(next);
    }
    if (isSettingCurrentIndex) {
      const index = getFrameIndexAtX(e.clientX);
      setCurrentIndexWithVisible(index);
    }
    if (!isDragging) return;
    if (e.buttons === 2 && e.ctrlKey) {
    if (!isDeleting) setIsDeleting(true);
  }
  // 右クリックのみなら isDeleting false
  else if (e.buttons === 2) {
    if (isDeleting) setIsDeleting(false);
  }
    const index = getFrameIndexAtX(e.clientX);
    setDragEnd(index);
    setCurrentIndex(index);
  }, [isPanning, panStartX, panViewStart, scale, FRAME_COUNT, visibleFrames, isSettingCurrentIndex, getFrameIndexAtX, setCurrentIndexWithVisible, isDragging]);

  const handleMouseUp = useCallback((e) => {
    setIsPanning(false);
    setIsSettingCurrentIndex(false);
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);
      if (isDeleting) {
        handleRemoveWithHistory(start, end);
      } else {
        handleAddWithHistory(start, end);
      }
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setIsDeleting(false);
    }
  }, [isDragging, dragStart, dragEnd, isDeleting, handleRemoveWithHistory, handleAddWithHistory]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const idx = getFrameIndexAtX(e.clientX);
    let newA = { start: idx, end: idx };
    const merged = [];
    for (let a of annotations) {
      if (!(newA.end < a.start - 1 || newA.start > a.end + 1)) {
        newA.start = Math.min(newA.start, a.start);
        newA.end   = Math.max(newA.end,   a.end);
      } else {
        merged.push(a);
      }
    }
    merged.push(newA);
    const sorted = merged.sort((a,b)=>a.start-b.start);
    const clean = [];
    for (let r of sorted) {
      if (!clean.length) clean.push(r)
      else {
        const last = clean[clean.length - 1];
        if (r.start <= last.end + 1) last.end = Math.max(last.end, r.end)
        else clean.push(r)
      }
    }
    setAnnotations(clean);
  }, [annotations, getFrameIndexAtX]);

  // ========== ホイールズーム ========== //
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (FRAME_COUNT <= 1 || canvasWidth <= 1 || scale <= 0) return;
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
  }, [FRAME_COUNT, canvasWidth, scale, viewStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e) => handleWheel(e);
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handler);
    };
  }, [canvasRef, handleWheel]);

  // ========== サマリーバーの操作 ========== //
  const handleSummaryBarMouseDown = useCallback((e) => {
    if (!FRAME_COUNT) return; 
    const rect = summaryBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const selX = (viewStart / FRAME_COUNT) * canvasWidth;
    const selW = (visibleFrames / FRAME_COUNT) * canvasWidth;

    if (Math.abs(x - selX) < 8) {
      setDragBarMode('left');
      setBarDragStartX(x);
      setBarDragStartView(viewStart);
      setBarDragStartScale(scale);
      setBarDragStartRightFrame(viewStart + visibleFrames);
      setBarDragStartLeftFrame(null);
    } else if (Math.abs(x - (selX + selW)) < 8) {
      setDragBarMode('right');
      setBarDragStartX(x);
      setBarDragStartView(viewStart);
      setBarDragStartScale(scale);
      setBarDragStartLeftFrame(viewStart);
      setBarDragStartRightFrame(null);
    } else if (x > selX && x < selX + selW) {
      setDragBarMode('move');
      setBarDragStartX(x);
      setBarDragStartView(viewStart);
      setBarDragStartScale(scale);
      setBarDragStartLeftFrame(null);
      setBarDragStartRightFrame(null);
    }
  }, [FRAME_COUNT, summaryBarRef, viewStart, visibleFrames, canvasWidth, scale]);
  const handleSummaryBarMouseMove = useCallback((e) => {
    const canvas = summaryBarRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalFrames = FRAME_COUNT;
    const handleW = 6;
    const minSelW = handleW * 2;
    let selW = (visibleFrames / FRAME_COUNT) * canvasWidth - handleW;
    if (selW < minSelW) selW = minSelW;
    const selX = (viewStart / FRAME_COUNT) * canvasWidth + handleW / 2;
    if (dragBarMode) {
      if (dragBarMode === 'move') canvas.style.cursor = 'grabbing';
      else if (dragBarMode === 'left' || dragBarMode === 'right') canvas.style.cursor = 'ew-resize';
    } else {
      if (Math.abs(x - selX) < handleW || Math.abs(x - (selX + selW)) < handleW) canvas.style.cursor = 'ew-resize';
      else if (x > selX && x < selX + selW) canvas.style.cursor = 'pointer';
      else canvas.style.cursor = 'pointer';
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
  }, [FRAME_COUNT, summaryBarRef, viewStart, visibleFrames, canvasWidth, dragBarMode, barDragStartX, barDragStartView, barDragStartRightFrame, barDragStartLeftFrame]);
  const handleSummaryBarMouseUp = useCallback(() => {
    setDragBarMode(null);
    setBarDragStartX(null);
    setBarDragStartView(null);
    setBarDragStartScale(null);
    setBarDragStartLeftFrame(null);
    setBarDragStartRightFrame(null);
  }, []);

  // ========== リサイズ ========== //
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
  }, [scale, FRAME_COUNT]);

  // ========== export ========== //
  return {
    // refs
    canvasRef,
    summaryBarRef,
    containerRef,
    // state
    indexToFrame,
    currentIndex,
    isPanning,
    dragBarMode,
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
    BAR_HEIGHT,
    // ハンドラ
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleSummaryBarMouseDown,
    handleSummaryBarMouseMove,
    handleSummaryBarMouseUp,
    // 追加で必要なstate/handlerがあればここに
  };
}
