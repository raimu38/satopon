"use client";

import React, { useState, useRef, useEffect } from "react";
import CustomSpeedBar from "./CutomSpeedBar.js";
import HelpPanel from "./HelpPanel.js";

const MIN_SCALE = 0;
const MAX_SCALE = 40;
const INITIAL_SCALE = 8;
const BAR_HEIGHT = 50;
const LONG_PRESS_DELAY = 200; // ms

// 1. 画像パス生成（ランダムなフレーム番号付き）
function generateImagePaths(
  count = 100,
  minFrame = 100,
  maxFrame = 2000,
  baseTimestamp = 1684875600,
) {
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
  return frames.map((frame) => {
    const isAnomaly = Math.random() < 0.02;
    const fractionalSec = (Math.random() * 0.999999).toFixed(6);
    const suffix = isAnomaly ? "_anomaly" : "";
    const p = `images/${frame}_${t}.${fractionalSec}${suffix}.jpg`;
    t += Math.floor(Math.random() * 11) + 5;
    return p;
  });
}

// 2. 画像名パース
function parseImageName(path) {
  const fn = path.split("/").pop().replace(".jpg", "");
  const [frameStr, timestampStr, ...rest] = fn.split("_");
  const [timestamp, fraction] = timestampStr.split(".");
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
  let start = indices[0],
    end = indices[0];
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
  newArr.forEach((n) => {
    if (!oldArr.some((o) => o.start === n.start && o.end === n.end)) {
      // 追加された範囲
      console.log("[API送信: add][undo/redo]", {
        action: "add",
        range: {
          startFrame: indexToFrame[n.start],
          endFrame: indexToFrame[n.end],
        },
      });
    }
  });
  // 2. 古い配列にしか無い区間 → remove
  oldArr.forEach((o) => {
    if (!newArr.some((n) => n.start === o.start && n.end === o.end)) {
      // 消された範囲
      console.log("[API送信: remove][undo/redo]", {
        action: "remove",
        range: {
          startFrame: indexToFrame[o.start],
          endFrame: indexToFrame[o.end],
        },
      });
    }
  });
}

function Timeline() {
  const [helpOpen, setHelpOpen] = useState(false);
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

  const [autoScrollState, setAutoScrollState] = useState({
    direction: null,
    distance: 0,
  });
  const autoScrollStateRef = useRef({ direction: null, distance: 0 });
  const [autoScrollDirection, setAutoScrollDirection] = useState(null); // 'left' | 'right' | null
  const autoScrollDirectionRef = useRef(null);
  const [isSettingCurrentIndex, setIsSettingCurrentIndex] = useState(false);
  const scrollIntervalRef = useRef(null);

  // === Undo/Redo 用state ===
  const [history, setHistory] = useState([]); // 過去のannotations（stack）
  const [redoStack, setRedoStack] = useState([]); // Redo用（stack）

  const visibleFrames =
    FRAME_COUNT > 0 && scale > 0 && canvasWidth > 0
      ? Math.min(FRAME_COUNT, Math.floor(canvasWidth / scale))
      : 1;
  // ==== 共通：インデックスを常に画面内に入れる ====
  const makeFrameVisible = (idx) => {
    setViewStart((vs) => {
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
    const paths = generateImagePaths(10000, 100, 30000, 1684875600);
    setImagePaths(paths);

    // 全フレーム→昇順ユニーク圧縮
    const parsed = paths.map(parseImageName);
    const allFrames = Array.from(new Set(parsed.map((p) => p.frame))).sort(
      (a, b) => a - b,
    );

    // 圧縮 index マッピング
    const frame2idx = {},
      idx2frame = {},
      idx2timestamp = {};

    // 2つのannotations配列を比較して、add/remove部分を抽出してAPI送信

    allFrames.forEach((f, i) => {
      frame2idx[f] = i;
      idx2frame[i] = f;
      // ★ここ追加
      const img = parsed.find((p) => p.frame === f);
      idx2timestamp[i] = img?.timestamp ?? null;
    });
    setFrameToIndex(frame2idx);
    setIndexToFrame(idx2frame);
    setFRAME_COUNT(allFrames.length);
    setIndexToTimestamp(idx2timestamp);

    // anomalyを圧縮indexへ
    const anomalyFrames = parsed
      .filter((p) => p.isAnomaly)
      .map((p) => frame2idx[p.frame]);
    const initialRanges = buildErrorRanges(anomalyFrames).map(
      ({ start, end }) => ({ start, end }),
    );
    setAnnotations(initialRanges);
  }, []);
  // === ここからUndo/Redo専用コード ===
  // 操作前のannotationsをhistoryに積むためのラッパー
  const pushHistory = () => {
    setHistory((prev) => [...prev, annotations]);
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
    setAnnotations((prev) => {
      let next = [];
      prev.forEach((a) => {
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
        range: { startFrame: indexToFrame[start], endFrame: indexToFrame[end] },
      });
      return next.sort((a, b) => a.start - b.start);
    });
  };

  // Undo/Redo 本体
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl + Z
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        if (history.length > 0) {
          setRedoStack((rs) => [...rs, annotations]);
          const prev = history[history.length - 1];
          diffAnnotations(annotations, prev, indexToFrame); // ←ここで差分API送信！
          setAnnotations(prev);
          setHistory((h) => h.slice(0, -1));
        }
      }
      // Ctrl + Shift + Z
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        if (redoStack.length > 0) {
          setHistory((h) => [...h, annotations]);
          const next = redoStack[redoStack.length - 1];
          diffAnnotations(annotations, next, indexToFrame); // ←ここで差分API送信！
          setAnnotations(next);
          setRedoStack((rs) => rs.slice(0, -1));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotations, history, redoStack, indexToFrame]);

  useEffect(() => {
    const onSpaceToggle = (e) => {
      // 入力欄やボタンなどにフォーカスされてる時は無視
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      ) {
        return;
      }
      if (e.code === "Space" || e.key === " " || e.keyCode === 32) {
        e.preventDefault();
        setIsPlaying((v) => !v);
      }
    };
    window.addEventListener("keydown", onSpaceToggle);
    return () => window.removeEventListener("keydown", onSpaceToggle);
  }, []);
  // --- メインタイムラインの描画 ---
  useEffect(() => {
    if (
      !FRAME_COUNT ||
      !canvasWidth ||
      !scale ||
      !visibleFrames ||
      FRAME_COUNT <= 0
    )
      return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvasWidth, 100);

    // --- 背景：ダークグラデーション ---
    const bgGrad = ctx.createLinearGradient(0, 0, canvasWidth, 100);
    bgGrad.addColorStop(0, "#181e2a");
    bgGrad.addColorStop(1, "#232946");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasWidth, 100);

    // --- フレームバー ---
    for (let i = 0; i < visibleFrames; i++) {
      const frameIndex = viewStart + i;
      if (frameIndex >= FRAME_COUNT) continue;
      const x = i * scale;
      const barGrad = ctx.createLinearGradient(x, 0, x, 100);
      barGrad.addColorStop(0, "#313a4d");
      barGrad.addColorStop(1, "#232946");
      ctx.fillStyle = barGrad;
      ctx.fillRect(x, 8, scale - 2, 84);

      ctx.strokeStyle = "rgba(100, 116, 139, 0.0)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, 8, scale - 2, 84);

      // --- フレーム番号（コメントアウト） ---
      /*
    if (scale >= 10 || frameIndex % Math.ceil(10 / scale) === 0) {
      ctx.fillStyle = 'rgba(180, 195, 220, 0.45)';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(frameIndex + " (" + (indexToFrame[frameIndex] ?? "") + ")", x + 6, 28);
    }
    */
    }

    // --- アノテーション ---
    annotations.forEach(({ start, end }) => {
      if (!FRAME_COUNT) return;
      if (end < viewStart || start > viewStart + visibleFrames - 1) return;
      const s = Math.max(start, viewStart);
      const e = Math.min(end, viewStart + visibleFrames - 1);
      const x = (s - viewStart) * scale;
      const w = (e - s + 1) * scale;
      ctx.fillStyle = "rgba(239, 68, 68, 0.23)";
      ctx.fillRect(x, 8, w, 84);
    });

    // --- ドラッグ範囲 ---
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const s = Math.max(Math.min(dragStart, dragEnd), viewStart);
      const e = Math.min(
        Math.max(dragStart, dragEnd),
        viewStart + visibleFrames - 1,
      );
      const x = (s - viewStart) * scale;
      const w = (e - s + 1) * scale;
      ctx.fillStyle = isDeleting
        ? "rgba(251, 191, 36, 0.25)"
        : "rgba(59, 130, 246, 0.18)";
      ctx.fillRect(x, 8, w, 84);
    }

    // --- 現在地インジケータ：青い棒だけ ---
    if (
      currentIndex !== null &&
      currentIndex >= viewStart &&
      currentIndex < viewStart + visibleFrames
    ) {
      const x = (currentIndex - viewStart) * scale + scale / 2;
      ctx.save();
      ctx.shadowColor = "#2563eb88";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, 92);
      ctx.strokeStyle = "#58f";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- 丸い玉：不要なので描画しない ---
      // ctx.beginPath();
      // ctx.arc(x, 50, 6, 0, Math.PI * 2);
      // ...描画省略...

      // --- インジケータ番号（コメントアウト） ---
      /*
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(currentIndex, x + 8, 82);
    */
      ctx.restore();
    }
  }, [
    scale,
    annotations,
    currentIndex,
    viewStart,
    canvasWidth,
    isDragging,
    dragEnd,
    isDeleting,
    visibleFrames,
    FRAME_COUNT,
    dragStart,
    indexToFrame,
  ]);
  // --- 画面リサイズ ---
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setCanvasWidth(w);
        setViewStart((vs) =>
          Math.max(0, Math.min(FRAME_COUNT - Math.floor(w / scale), vs)),
        );
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scale]);

  // --- キーボード長押し用 ---
  const longPressTimerRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const arrowDirectionRef = useRef(null);

  const stepMove = (dir) => {
    setCurrentIndex((idx) => {
      let nextIdx = idx + (dir === "right" ? 1 : -1);
      nextIdx = Math.max(0, Math.min(FRAME_COUNT - 1, nextIdx));
      makeFrameVisible(nextIdx);
      return nextIdx;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isPlaying) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;

      const dir = e.key === "ArrowRight" ? "right" : "left";

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
        repeatTimerRef.current = setInterval(
          () => stepMove(dir),
          1000 / playSpeed,
        );
      }, LONG_PRESS_DELAY);
    };

    const handleKeyUp = (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const dir = e.key === "ArrowRight" ? "right" : "left";
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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
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
      setCurrentIndex((prev) => {
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
      let direction = null,
        distance = 0;
      if (e.clientX < rect.left) {
        newIndex = viewStart;
        direction = "left";
        distance = rect.left - e.clientX;
      } else if (e.clientX > rect.right) {
        newIndex = viewStart + visibleFrames - 1;
        direction = "right";
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

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
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
      const step = dir === "left" ? -1 : 1;
      if (isSettingCurrentIndex) {
        setCurrentIndex((prevIdx) => {
          const next = Math.max(0, Math.min(FRAME_COUNT - 1, prevIdx + step));
          makeFrameVisible(next);
          return next;
        });
      }
      if (isDragging) {
        setDragEnd((prev) => {
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
    return Math.max(
      0,
      Math.min(FRAME_COUNT - 1, Math.floor(x / scale) + viewStart),
    );
  };

  const addAnnotation = (start, end) => {
    let s = Math.min(start, end);
    let e = Math.max(start, end);
    let newAnnotations = [];
    annotations.forEach((a) => {
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
      },
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
        handleAddWithHistory(start, end); // ←修正
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
        newA.end = Math.max(newA.end, a.end);
      } else {
        merged.push(a);
      }
    }
    merged.push(newA);
    // ソート＆クリーン
    const sorted = merged.sort((a, b) => a.start - b.start);
    const clean = [];
    for (let r of sorted) {
      if (!clean.length) clean.push(r);
      else {
        const last = clean[clean.length - 1];
        if (r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
        else clean.push(r);
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

    const newVisible = Math.min(
      FRAME_COUNT,
      Math.floor(canvasWidth / newScale),
    );
    let newViewStart = mouseFrame - Math.floor((x / canvasWidth) * newVisible);
    newViewStart = Math.max(
      0,
      Math.min(FRAME_COUNT - newVisible, newViewStart),
    );
    setScale(newScale);
    setViewStart(newViewStart);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handler = (e) => handleWheel(e);

    canvas.addEventListener("wheel", handler, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handler);
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
      setDragBarMode("left");
      setBarDragStartX(x);
      setBarDragStartView(viewStart);
      setBarDragStartScale(scale);
      setBarDragStartRightFrame(viewStart + visibleFrames);
      setBarDragStartLeftFrame(null);
    } else if (Math.abs(x - (selX + selW)) < 8) {
      setDragBarMode("right");
      setBarDragStartX(x);
      setBarDragStartView(viewStart);
      setBarDragStartScale(scale);
      setBarDragStartLeftFrame(viewStart);
      setBarDragStartRightFrame(null);
    } else if (x > selX && x < selX + selW) {
      setDragBarMode("move");
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
      if (dragBarMode === "move") {
        canvas.style.cursor = "grabbing";
      } else if (dragBarMode === "left" || dragBarMode === "right") {
        canvas.style.cursor = "ew-resize";
      }
    } else {
      // ハンドル付近
      if (
        Math.abs(x - selX) < handleW ||
        Math.abs(x - (selX + selW)) < handleW
      ) {
        canvas.style.cursor = "ew-resize";
      }
      // 範囲内（ハンドル外）は grab
      else if (x > selX + handleW && x < selX + selW - handleW) {
        canvas.style.cursor = "grab";
      }
      // それ以外
      else {
        canvas.style.cursor = "";
      }
    }

    if (!dragBarMode) return;

    if (dragBarMode === "move" && barDragStartX !== null) {
      const dx = x - barDragStartX;
      const frameShift = Math.round((dx / canvasWidth) * totalFrames);
      let newStart = barDragStartView + frameShift;
      newStart = Math.max(0, Math.min(FRAME_COUNT - visibleFrames, newStart));
      setViewStart(newStart);
    }
    if (dragBarMode === "left") {
      let rightFrame =
        barDragStartRightFrame ?? barDragStartView + visibleFrames;
      let leftFrame = Math.round((x / canvasWidth) * totalFrames);
      leftFrame = Math.max(0, Math.min(rightFrame - 1, leftFrame));
      let newFrames = rightFrame - leftFrame;
      newFrames = Math.max(1, Math.min(FRAME_COUNT, newFrames));
      let newScale = canvasWidth / newFrames;
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      setScale(newScale);
      setViewStart(leftFrame);
    }
    if (dragBarMode === "right") {
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
    if (
      !FRAME_COUNT ||
      !canvasWidth ||
      !scale ||
      !visibleFrames ||
      FRAME_COUNT <= 0
    )
      return;
    const canvas = summaryBarRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvasWidth, BAR_HEIGHT);

    annotations.forEach(({ start, end }) => {
      if (!FRAME_COUNT) return; // 分母ガード
      const x = FRAME_COUNT > 0 ? (start / FRAME_COUNT) * canvasWidth : 0;
      const w =
        FRAME_COUNT > 0 ? ((end - start + 1) / FRAME_COUNT) * canvasWidth : 0;
      ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
      ctx.fillRect(x, 6, w, BAR_HEIGHT - 12);
    });

    const handleW = 5,
      handleH = BAR_HEIGHT - 8;
    const minSelW = 4;
    let selW =
      FRAME_COUNT > 0
        ? (visibleFrames / FRAME_COUNT) * canvasWidth - handleW
        : minSelW;
    if (selW < minSelW) selW = minSelW;
    const selX =
      FRAME_COUNT > 0
        ? (viewStart / FRAME_COUNT) * canvasWidth + handleW / 2
        : 0;
    const radius = 1;

    ctx.beginPath();
    ctx.roundRect(selX, 4, selW, BAR_HEIGHT - 8, radius);

    // グラデ（青→濃青→青）
    const grad = ctx.createLinearGradient(selX, 0, selX + selW, 0);
    grad.addColorStop(0, "rgba(37,99,235,0.01)"); // #2563eb 15%
    grad.addColorStop(0.5, "rgba(37,99,235,0.05)"); // #2563eb 32%
    grad.addColorStop(1, "rgba(37,99,235,0.01)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#2563eb";
    ctx.stroke();

    // === ハンドル（白＋青枠、少し太め） ===
    const leftHandleX = selX - handleW / 2;
    const rightHandleX = selX + selW - handleW / 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(leftHandleX, 4, handleW, handleH, 4);
    ctx.fillStyle = "#58f";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2563eb";
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rightHandleX, 4, handleW, handleH, 4);
    ctx.fillStyle = "#58e";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2563eb";
    ctx.stroke();
    ctx.restore();
  }, [canvasWidth, annotations, viewStart, scale, visibleFrames, FRAME_COUNT]);

  // --- JSX ---
  // ...ロジック部は全く同じ...
  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-0 sm:p-6">
      <div className="relative">
        {/* ...既存のUI... */}
        {/* ヘルプアイコン（右上に配置） */}
        <button
          className="fixed top-4 right-4 z-60 bg-slate-800/80 rounded-full p-2 hover:bg-slate-700/90 border border-slate-600/40 shadow-lg"
          onClick={() => setHelpOpen(true)}
          aria-label="Show help"
        >
          <span className="text-2xl text-slate-300">?</span>
        </button>

        <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
      {/* URLバー */}

      <div className="w-full max-w-4xl mt-2 mb-3 mx-auto">
        <div className="flex bg-gradient-to-r from-slate-800/90 to-slate-700/90 backdrop-blur-xl border border-slate-600/30 rounded-xl shadow-2xl overflow-hidden group">
          {/* 左側：URL + 実画像（縦並び） */}
          <div className="flex flex-col w-full min-w-sm border-r border-slate-600/30">
            {/* URL 表示（上部） */}
            <div className="h-[38px] flex items-center px-4 bg-slate-900/70 text-slate-300 font-mono text-sm border-b border-slate-600/30">
              <span className="truncate">
                https://example.com/frame/{indexToFrame[currentIndex] ?? ""}.jpg
              </span>
            </div>

            {/* 実画像（下部） */}
            <div className="h-[340px] bg-black">
              <img
                src={`https://example.com/frame/${indexToFrame[currentIndex] ?? ""}.jpg`}
                alt="Frame preview"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* 右側：アノマリー見出し + 一覧 */}
          <div className="flex flex-col min-w-[10px] max-w-[180px] h-[378px] border-l border-slate-700/40">
            {/* アノマリータイトル固定バー */}
            <div className="h-[38px] flex items-center px-3 bg-slate-900/70 border-b border-slate-600/30">
              <span className="text-xs text-slate-400 font-bold tracking-wide">
                ANOMALIES
              </span>
            </div>

            {/* 一覧（スクロール可能） */}
            <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-800/50 py-3 px-2 h-[340px]">
              <div className="flex flex-col gap-1">
                {annotations.map(({ start, end }, i) => {
                  const startLabel = start + 1;
                  const endLabel = end + 1;
                  const isActive = currentIndex >= start && currentIndex <= end;

                  let label;
                  if (start === end) {
                    label = (
                      <span className="flex flex-col items-center justify-center">
                        <span>{startLabel}</span>
                      </span>
                    );
                  } else {
                    label = (
                      <span className="flex flex-col items-center justify-center leading-tight">
                        <span>{startLabel}</span>
                        <span className="text-white -my-0.5">｜</span>
                        <span>{endLabel}</span>
                      </span>
                    );
                  }

                  return (
                    <button
                      key={i}
                      className={`w-full text-left px-3 py-1.5 rounded-lg font-mono text-[13px] transition-all duration-150
        ${
          isActive
            ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-md"
            : "bg-slate-700/40 text-slate-200 hover:bg-slate-700/70"
        }
      `}
                      onClick={() => setCurrentIndexWithVisible(start)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
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
            height={60}
            className="block rounded-t-2xl relative z-10"
            style={{
              cursor: isPanning ? "grabbing" : "pointer",
              width: "100%",
              height: "60px",
              background: "transparent",
              userSelect: "none",
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
              width: "100%",
              height: `${BAR_HEIGHT + 8}px`,
              background: "transparent",
              userSelect: "none",
              cursor: dragBarMode ? "grabbing" : "pointer",
            }}
            onMouseDown={handleSummaryBarMouseDown}
            onMouseMove={handleSummaryBarMouseMove}
            onMouseUp={handleSummaryBarMouseUp}
            onMouseLeave={handleSummaryBarMouseUp}
          />
        </div>
      </div>

      {/* 再生・速度・現在地（横並び！） */}
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-8 items-center justify-between mt-3 mb-4 w-full max-w-4xl">
        {/* 現在地表示＋タイムスタンプ（縦配置・幅固定） */}
        <div className="flex flex-col items-center justify-center w-[220px] h-[65px]  bg-gradient-to-r from-slate-800/60 to-slate-700/60 backdrop-blur-xl border border-slate-600/30 rounded-2xl px-4 py-2 shadow-xl relative overflow-hidden group">
          {/* 背景ホバーエフェクト */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          {/* 中身（縦並び） */}
          <div className="flex flex-col items-center space-y-1 relative z-10 text-slate-300 font-mono text-sm w-full">
            {/* Frame 表示（中央揃え・固定幅） */}
            <div className="flex items-baseline justify-center space-x-1 w-full">
              <span className="text-base font-semibold text-slate-300 tabular-nums">
                {currentIndex + 1 ?? "-"}
              </span>
              <span className="text-xs text-slate-500 opacity-80">
                / {FRAME_COUNT}
              </span>
            </div>

            {/* Timestamp 表示（はみ出し防止＆省略） */}
            {indexToTimestamp[currentIndex] && (
              <div className="px-2 py-0.5 text-xs rounded bg-slate-700/70 border border-slate-500/30 truncate w-full text-center">
                {new Date(
                  indexToTimestamp[currentIndex] * 1000,
                ).toLocaleString()}
              </div>
            )}
          </div>
        </div>
        {/* 再生ボタン（青系） */}
        <div className="relative group flex-shrink-0">
          {/* グロー背景（青系に変更） */}
          <div className="absolute inset-0 bg-gradient-to-r from-sky-500/30 to-blue-500/30 rounded-full blur-md opacity-60 group-hover:opacity-80 transition-opacity duration-300"></div>

          <button
            className="relative w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:from-blue-700 active:to-blue-800 shadow-lg text-white text-xl focus:outline-none transform hover:scale-105 active:scale-95 transition-all duration-200"
            title={isPlaying ? "Stop" : "Play"}
            onClick={() => setIsPlaying((v) => !v)}
          >
            {/* 内部光（白系の艶） */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-transparent"></div>
            <span className="relative z-10">{isPlaying ? "⏸" : "▶"}</span>
          </button>
        </div>

        {/* スピードバー */}
        {/* スピードバー */}
        <div className="relative flex items-center h-[65px] bg-gradient-to-r from-slate-800/50 to-slate-700/50 backdrop-blur-xl border border-slate-600/30 rounded-xl py-2 shadow-xl group transition-opacity duration-500">
          {/* ホバーエフェクト */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          <CustomSpeedBar
            value={playSpeed}
            min={1}
            max={20}
            onChange={(v) => setPlaySpeed(v)}
          />
        </div>
      </div>
    </div>
  );
}

export default Timeline;
