'use client'

import React, { useState, useRef, useEffect } from 'react';
import CustomSpeedBar from './CutomSpeedBar.js'

const MIN_SCALE = 0;
const MAX_SCALE = 40;
const INITIAL_SCALE = 8;
const BAR_HEIGHT = 50;
const LONG_PRESS_DELAY = 200; // ms



// 1. 画像パス生成（ランダムなフレーム番号付き）
function generateImagePaths(count = 100, minFrame = 100, maxFrame = 2000, baseTimestamp = 1684875600) {
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

// 2. 画像名パース
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

// 3. 連続 anomaly frame → 範囲化
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

function diffAnnotations(oldArr, newArr, indexToFrame) {
  // oldArr, newArr: [{start, end}, ...]
  // 1. 新しい配列にしか無い区間 → add
  newArr.forEach(n => {
    if (!oldArr.some(o => o.start === n.start && o.end === n.end)) {
      // 追加された範囲
      console.log("[API送信: add][undo/redo]", {
        action: "add",
        range: { startFrame: indexToFrame[n.start], endFrame: indexToFrame[n.end] }
      });
    }
  });
  // 2. 古い配列にしか無い区間 → remove
  oldArr.forEach(o => {
    if (!newArr.some(n => n.start === o.start && n.end === o.end)) {
      // 消された範囲
      console.log("[API送信: remove][undo/redo]", {
        action: "remove",
        range: { startFrame: indexToFrame[o.start], endFrame: indexToFrame[o.end] }
      });
    }
  });
}



function Timeline() {


  
// 追加分（ここから）
  const [imagePaths, setImagePaths] = useState([]);
  const [frameToIndex, setFrameToIndex] = useState({});
  const [indexToFrame, setIndexToFrame] = useState({});
  const [FRAME_COUNT, setFRAME_COUNT] = useState(0);


  const canvasRef = useRef(null);
  const summaryBarRef = useRef(null);
  const containerRef = useRef(null);

const [indexToTimestamp, setIndexToTimestamp] = useState({});
// useEffect 内で setIndexToTimestamp(indexToTimestamp); 追加
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [viewStart, setViewStart] = useState(0);

  const [annotations, setAnnotations] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  // サマリーバー関連
  const [dragBarMode, setDragBarMode] = useState(null); // 'move', 'left', 'right', null
  const [barDragStartX, setBarDragStartX] = useState(null);
  const [barDragStartView, setBarDragStartView] = useState(null);
  const [barDragStartScale, setBarDragStartScale] = useState(null);
  const [barDragStartLeftFrame, setBarDragStartLeftFrame] = useState(null);
  const [barDragStartRightFrame, setBarDragStartRightFrame] = useState(null);

  const [autoScrollState, setAutoScrollState] = useState({ direction: null, distance: 0 });
  const autoScrollStateRef = useRef({ direction: null, distance: 0 });
  const [autoScrollDirection, setAutoScrollDirection] = useState(null); // 'left' | 'right' | null
  const autoScrollDirectionRef = useRef(null);
  const [isSettingCurrentIndex, setIsSettingCurrentIndex] = useState(false);
  const scrollIntervalRef = useRef(null);

 // === Undo/Redo 用state ===
  const [history, setHistory] = useState([]);      // 過去のannotations（stack）
  const [redoStack, setRedoStack] = useState([]);  // Redo用（stack）


  const visibleFrames = FRAME_COUNT > 0 && scale > 0 && canvasWidth > 0
    ? Math.min(FRAME_COUNT, Math.floor(canvasWidth / scale))
    : 1;
  // ==== 共通：インデックスを常に画面内に入れる ====
const makeFrameVisible = (idx) => {
  setViewStart(vs => {
    const vis = visibleFrames; // ← これで十分
    if (idx < vs) return idx;
    if (idx >= vs + vis) return Math.min(FRAME_COUNT - vis, idx - vis + 1);
    return vs;
  });
};
  // ==== 共通：インデックス＋viewをまとめてセット ====
  const setCurrentIndexWithVisible = (idx) => {
    setCurrentIndex(() => {
      makeFrameVisible(idx);
      return idx;
    });
  };
   // --- 初回：データ生成&index割当&anomaly自動描画 ---
  useEffect(() => {
    const paths = generateImagePaths(1000, 100, 30000, 1684875600);
    setImagePaths(paths);

    // 全フレーム→昇順ユニーク圧縮
    const parsed = paths.map(parseImageName);
    const allFrames = Array.from(new Set(parsed.map(p => p.frame))).sort((a, b) => a - b);

    // 圧縮 index マッピング
  const frame2idx = {}, idx2frame = {}, idx2timestamp = {};


// 2つのannotations配列を比較して、add/remove部分を抽出してAPI送信

 allFrames.forEach((f, i) => {
    frame2idx[f] = i;
    idx2frame[i] = f;
    // ★ここ追加
    const img = parsed.find(p => p.frame === f);
    idx2timestamp[i] = img?.timestamp ?? null;
  });
    setFrameToIndex(frame2idx);
    setIndexToFrame(idx2frame);
    setFRAME_COUNT(allFrames.length);
setIndexToTimestamp(idx2timestamp);

    // anomalyを圧縮indexへ
    const anomalyFrames = parsed.filter(p => p.isAnomaly).map(p => frame2idx[p.frame]);
    const initialRanges = buildErrorRanges(anomalyFrames).map(({ start, end }) => ({ start, end }));
    setAnnotations(initialRanges);
  }, []);
  // === ここからUndo/Redo専用コード ===
  // 操作前のannotationsをhistoryに積むためのラッパー
  const pushHistory = () => {
    setHistory(prev => [...prev, annotations]);
    setRedoStack([]); // 新規操作したらredoは消す
  };

  // add/remove直前に呼ぶ
  const handleAddWithHistory = (start, end) => {
    pushHistory();
    addAnnotation(start, end);
  };
  const handleRemoveWithHistory = (start, end) => {
    pushHistory();
    // removeのロジックをここで再利用
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

  // Undo/Redo 本体
useEffect(() => {
  const handleKeyDown = (e) => {
    // Ctrl + Z
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (history.length > 0) {
        setRedoStack(rs => [...rs, annotations]);
        const prev = history[history.length - 1];
        diffAnnotations(annotations, prev, indexToFrame); // ←ここで差分API送信！
        setAnnotations(prev);
        setHistory(h => h.slice(0, -1));
      }
    }
    // Ctrl + Shift + Z
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (redoStack.length > 0) {
        setHistory(h => [...h, annotations]);
        const next = redoStack[redoStack.length - 1];
        diffAnnotations(annotations, next, indexToFrame); // ←ここで差分API送信！
        setAnnotations(next);
        setRedoStack(rs => rs.slice(0, -1));
      }
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [annotations, history, redoStack, indexToFrame]);
  // --- メインタイムラインの描画 ---
useEffect(() => {
  if (!FRAME_COUNT || !canvasWidth || !scale || !visibleFrames || FRAME_COUNT <= 0) return;
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvasWidth, 100);

  // --- 背景：ダークグラデーション ---
  const bgGrad = ctx.createLinearGradient(0, 0, canvasWidth, 100);
  bgGrad.addColorStop(0, '#181e2a');
  bgGrad.addColorStop(1, '#232946');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvasWidth, 100);

  // --- フレームバー（ダークグレー寄せ・やや陰影） ---
  for (let i = 0; i < visibleFrames; i++) {
    const frameIndex = viewStart + i;
    if (frameIndex >= FRAME_COUNT) continue;
    const x = i * scale;

    // バーのグラデ or 単色
    const barGrad = ctx.createLinearGradient(x, 0, x, 100);
    barGrad.addColorStop(0, '#313a4d');
    barGrad.addColorStop(1, '#232946');
    ctx.fillStyle = barGrad;
    ctx.fillRect(x, 8, scale - 2, 84);

    // バーの境界（ブルーグレー系）
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.11)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, 8, scale - 2, 84);
  }

  // --- アノテーション（やや薄赤の透過） ---
  annotations.forEach(({ start, end }) => {
    if (!FRAME_COUNT) return;
    if (end < viewStart || start > viewStart + visibleFrames - 1) return;
    const s = Math.max(start, viewStart);
    const e = Math.min(end, viewStart + visibleFrames - 1);
    const x = (s - viewStart) * scale;
    const w = (e - s + 1) * scale;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.23)';
    ctx.fillRect(x, 8, w, 84);
  });

  // --- ドラッグ範囲（青/黄色で薄く表示、削除は黄） ---
  if (isDragging && dragStart !== null && dragEnd !== null) {
    const s = Math.max(Math.min(dragStart, dragEnd), viewStart);
    const e = Math.min(Math.max(dragStart, dragEnd), viewStart + visibleFrames - 1);
    const x = (s - viewStart) * scale;
    const w = (e - s + 1) * scale;
    ctx.fillStyle = isDeleting
      ? 'rgba(251, 191, 36, 0.25)' // 薄黄
      : 'rgba(59, 130, 246, 0.18)'; // #3b82f6青 薄め
    ctx.fillRect(x, 8, w, 84);
  }

  // --- 現在地インジケータ（ブルーでシャドウ、ドットも） ---
  if (currentIndex !== null && currentIndex >= viewStart && currentIndex < viewStart + visibleFrames) {
    const x = (currentIndex - viewStart) * scale + scale / 2;
    ctx.save();
    ctx.shadowColor = '#2563eb88';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, 92);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // インジケータドット
    ctx.beginPath();
    ctx.arc(x, 50, 6, 0, Math.PI * 2);
    const dotGrad = ctx.createRadialGradient(x, 50, 0, x, 50, 6);
    dotGrad.addColorStop(0, '#3b82f6');
    dotGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = dotGrad;
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}, [
  scale, annotations, currentIndex, viewStart, canvasWidth, isDragging, dragEnd,
  isDeleting, visibleFrames, FRAME_COUNT
]);
  // --- 画面リサイズ ---
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

  // --- キーボード長押し用 ---
  const longPressTimerRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const arrowDirectionRef = useRef(null);

  const stepMove = (dir) => {
    setCurrentIndex(idx => {
      let nextIdx = idx + (dir === 'right' ? 1 : -1);
      nextIdx = Math.max(0, Math.min(FRAME_COUNT - 1, nextIdx));
      makeFrameVisible(nextIdx);
      return nextIdx;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isPlaying) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

      const dir = e.key === 'ArrowRight' ? 'right' : 'left';

      if (arrowDirectionRef.current === dir) return;

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (repeatTimerRef.current) {
        clearInterval(repeatTimerRef.current);
        repeatTimerRef.current = null;
      }

      arrowDirectionRef.current = dir;
      stepMove(dir);
      longPressTimerRef.current = setTimeout(() => {
        repeatTimerRef.current = setInterval(() => stepMove(dir), 1000 / playSpeed);
      }, LONG_PRESS_DELAY);
    };

    const handleKeyUp = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const dir = e.key === 'ArrowRight' ? 'right' : 'left';
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (repeatTimerRef.current) {
        clearInterval(repeatTimerRef.current);
        repeatTimerRef.current = null;
      }
      if (arrowDirectionRef.current === dir) {
        arrowDirectionRef.current = null;
      }
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

  // --- 再生処理（1つだけ） ---
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
  }, [isPlaying, playSpeed, viewStart, visibleFrames]);

  // --- グローバルマウスムーブ&アップ（ドラッグ・クリック系） ---
  const setSingleAutoScrollDirection = (dir) => {
    if (autoScrollDirectionRef.current === dir) return;
    setAutoScrollDirection(dir);
    autoScrollDirectionRef.current = dir;
  };

  useEffect(() => {
    if (!(isSettingCurrentIndex || isDragging)) return;
    const handleGlobalMouseMove = (e) => {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
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

      if (isSettingCurrentIndex) {
        setCurrentIndexWithVisible(newIndex);
      }
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
  }, [isSettingCurrentIndex, isDragging, viewStart, visibleFrames]);

  // --- auto scroll ---
  useEffect(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    if (!(isSettingCurrentIndex || isDragging) || !autoScrollDirection) {
      return;
    }

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
  }, [isSettingCurrentIndex, isDragging, autoScrollDirection]);

  // --- 補助関数 ---
  const getFrameIndexAtX = (clientX) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    let x = (clientX - rect.left) * scaleX;
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

  // ここでAPI送信用データをconsole.log（インデックスじゃなくframe番号で）
  console.log("[API送信: add]", {
    action: "add",
    range: {
      startFrame: indexToFrame[s],
      endFrame: indexToFrame[e],
    }
  });
};
  // --- メインタイムライン：マウス操作 ---
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(null);
  const [panViewStart, setPanViewStart] = useState(0);

  const handleMouseDown = (e) => {
    if (e.button === 1) {
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
      const index = getFrameIndexAtX(e.clientX);
      setCurrentIndexWithVisible(index);
    }
  };

  const handleMouseMove = (e) => {
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
    const index = getFrameIndexAtX(e.clientX);
    setDragEnd(index);
    setCurrentIndex(index);
  };

const handleMouseUp = (e) => {
    setIsPanning(false);
    setIsSettingCurrentIndex(false);
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);

      if (isDeleting) {
        handleRemoveWithHistory(start, end); // ←修正
      } else {
        handleAddWithHistory(start, end);    // ←修正
      }
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setIsDeleting(false);
    }
  };

 const handleContextMenu = (e) => {
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
    // ソート＆クリーン
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
    // 追加時のログ
    //console.log("🟥 追加/マージ後のannotations", clean.map(({start,end})=>({start,end,originalStart:indexToFrame[start],originalEnd:indexToFrame[end]})));
  };

  const handleWheel = (e) => {

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
  };

useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const handler = (e) => handleWheel(e);

  canvas.addEventListener('wheel', handler, { passive: false });
  return () => {
    canvas.removeEventListener('wheel', handler);
  };
}, [canvasRef.current, handleWheel]);
  // --- サマリーバーの操作 ---
  const handleSummaryBarMouseDown = (e) => {
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
  };

  const handleSummaryBarMouseMove = (e) => {
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
      if (dragBarMode === 'move') {
        canvas.style.cursor = 'grabbing';
      } else if (dragBarMode === 'left' || dragBarMode === 'right') {
        canvas.style.cursor = 'ew-resize';
      }
    } else {
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
  };

  const handleSummaryBarMouseUp = (e) => {
    setDragBarMode(null);
    setBarDragStartX(null);
    setBarDragStartView(null);
    setBarDragStartScale(null);
    setBarDragStartLeftFrame(null);
    setBarDragStartRightFrame(null);
  };

  // --- サマリーバー描画 ---
useEffect(() => {
  if (!FRAME_COUNT || !canvasWidth || !scale || !visibleFrames || FRAME_COUNT <= 0) return;
  const canvas = summaryBarRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvasWidth, BAR_HEIGHT);

  annotations.forEach(({ start, end }) => {
    if (!FRAME_COUNT) return; // 分母ガード
    const x = FRAME_COUNT > 0 ? (start / FRAME_COUNT) * canvasWidth : 0;
    const w = FRAME_COUNT > 0 ? ((end - start + 1) / FRAME_COUNT) * canvasWidth : 0;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.fillRect(x, 6, w, BAR_HEIGHT - 12);
  });

  const handleW = 5, handleH = BAR_HEIGHT - 8;
  const minSelW = 4;
  let selW = FRAME_COUNT > 0 ? (visibleFrames / FRAME_COUNT) * canvasWidth - handleW : minSelW;
  if (selW < minSelW) selW = minSelW;
  const selX = FRAME_COUNT > 0 ? (viewStart / FRAME_COUNT) * canvasWidth + handleW / 2 : 0;
  const radius = 1;

  ctx.beginPath();
  ctx.roundRect(selX, 4, selW, BAR_HEIGHT - 8, radius);

 // グラデ（青→濃青→青）
  const grad = ctx.createLinearGradient(selX, 0, selX + selW, 0);
  grad.addColorStop(0, 'rgba(37,99,235,0.15)');    // #2563eb 15%
  grad.addColorStop(0.5, 'rgba(37,99,235,0.32)');  // #2563eb 32%
  grad.addColorStop(1, 'rgba(37,99,235,0.15)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2563eb';
  ctx.stroke();

  // === ハンドル（白＋青枠、少し太め） ===
  const leftHandleX = selX - handleW / 2;
  const rightHandleX = selX + selW - handleW / 2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(leftHandleX, 4, handleW, handleH, 4);
  ctx.fillStyle = '#aaf';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#2563eb';
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rightHandleX, 4, handleW, handleH, 4);
  ctx.fillStyle = '#aaf';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#2563eb';
  ctx.stroke();
  ctx.restore();
}, [canvasWidth, annotations, viewStart, scale, visibleFrames, FRAME_COUNT]);

  // --- JSX ---
// ...ロジック部は全く同じ...
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

export default Timeline;

