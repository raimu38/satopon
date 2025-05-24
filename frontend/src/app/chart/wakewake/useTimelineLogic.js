import { useState, useRef, useEffect } from 'react';

export const FRAME_COUNT = 3000;
const MIN_SCALE = 0;
const MAX_SCALE = 100;
const INITIAL_SCALE = 8;
const BAR_HEIGHT = 50;
const LONG_PRESS_DELAY = 200; // ms

export function useTimelineLogic() {
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);

  const [dragBarMode, setDragBarMode] = useState(null); // 'move', 'left', 'right', null
  const [barDragStartX, setBarDragStartX] = useState(null);
  const [barDragStartView, setBarDragStartView] = useState(null);
  const [barDragStartScale, setBarDragStartScale] = useState(null);
  const [barDragStartLeftFrame, setBarDragStartLeftFrame] = useState(null);
  const [barDragStartRightFrame, setBarDragStartRightFrame] = useState(null);

  const [autoScrollState, setAutoScrollState] = useState({ direction: null, distance: 0 });
  const autoScrollStateRef = useRef({ direction: null, distance: 0 });
  const [autoScrollDirection, setAutoScrollDirection] = useState(null);
  const autoScrollDirectionRef = useRef(null);
  const [isSettingCurrentIndex, setIsSettingCurrentIndex] = useState(false);
  const scrollIntervalRef = useRef(null);

  const visibleFrames = Math.min(FRAME_COUNT, Math.floor(canvasWidth / scale));
  const visibleFramesRef = useRef(visibleFrames);
  useEffect(() => { visibleFramesRef.current = visibleFrames }, [visibleFrames]);
  const viewStartRef = useRef(viewStart);
  useEffect(() => { viewStartRef.current = viewStart; }, [viewStart]);

  const makeFrameVisible = (idx) => {
    setViewStart(vs => {
      const vis = visibleFramesRef.current;
      if (idx < vs) return idx;
      if (idx >= vs + vis) return Math.min(FRAME_COUNT - vis, idx - vis + 1);
      return vs;
    });
  };

  const setCurrentIndexWithVisible = (idx) => {
    setCurrentIndex(() => {
      makeFrameVisible(idx);
      return idx;
    });
  };

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

    annotations.forEach(function (a) {
      var start = a.start, end = a.end;
      if (end < viewStart || start > viewStart + visibleFrames - 1) return;
      var s = Math.max(start, viewStart);
      var e = Math.min(end, viewStart + visibleFrames - 1);
      var x = (s - viewStart) * scale;
      var w = (e - s + 1) * scale;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.fillRect(x, 0, w, 100);
    });

    if (isDragging && dragStart !== null && dragEnd !== null) {
      var s = Math.max(Math.min(dragStart, dragEnd), viewStart);
      var e = Math.min(Math.max(dragStart, dragEnd), viewStart + visibleFrames - 1);
      var x = (s - viewStart) * scale;
      var w = (e - s + 1) * scale;
      ctx.fillStyle = isDeleting
        ? 'rgba(253, 224, 71, 0.4)'
        : 'rgba(239, 68, 68, 0.20)';
      ctx.fillRect(x, 0, w, 100);
    }

    if (currentIndex !== null && currentIndex >= viewStart && currentIndex < viewStart + visibleFrames) {
      var x = (currentIndex - viewStart) * scale + scale / 2;
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

  // --- 画面リサイズ ---
  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        var w = containerRef.current.offsetWidth;
        setCanvasWidth(w);
        setViewStart(function (vs) {
          return Math.max(0, Math.min(FRAME_COUNT - Math.floor(w / scale), vs));
        });
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return function () {
      window.removeEventListener('resize', handleResize);
    };
  }, [scale]);

  // --- キーボード長押し用 ---
  const longPressTimerRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const arrowDirectionRef = useRef(null);

  const stepMove = (dir) => {
    setCurrentIndex(function (idx) {
      var nextIdx = idx + (dir === 'right' ? 1 : -1);
      nextIdx = Math.max(0, Math.min(FRAME_COUNT - 1, nextIdx));
      makeFrameVisible(nextIdx);
      return nextIdx;
    });
  };

  useEffect(() => {
    function handleKeyDown(e) {
      if (isPlaying) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

      var dir = e.key === 'ArrowRight' ? 'right' : 'left';

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
      longPressTimerRef.current = setTimeout(function () {
        repeatTimerRef.current = setInterval(function () { stepMove(dir); }, 1000 / playSpeed);
      }, LONG_PRESS_DELAY);
    }

    function handleKeyUp(e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var dir = e.key === 'ArrowRight' ? 'right' : 'left';
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
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return function () {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (repeatTimerRef.current) clearInterval(repeatTimerRef.current);
      longPressTimerRef.current = null;
      repeatTimerRef.current = null;
      arrowDirectionRef.current = null;
    };
  }, [playSpeed, isPlaying, visibleFrames]);

  // --- 再生処理 ---
  useEffect(() => {
    if (!isPlaying) return;
    var interval = setInterval(function () {
      setCurrentIndex(function (prev) {
        if (prev >= FRAME_COUNT - 1) {
          setIsPlaying(false);
          return prev;
        }
        var next = prev + 1;
        makeFrameVisible(next);
        return next;
      });
    }, 1000 / playSpeed);
    return function () { clearInterval(interval); };
  }, [isPlaying, playSpeed, viewStart, visibleFrames]);

  // --- グローバルマウスムーブ&アップ ---
  const setSingleAutoScrollDirection = (dir) => {
    if (autoScrollDirectionRef.current === dir) return;
    setAutoScrollDirection(dir);
    autoScrollDirectionRef.current = dir;
  };

  useEffect(() => {
    if (!(isSettingCurrentIndex || isDragging)) return;
    function handleGlobalMouseMove(e) {
      var canvas = canvasRef.current;
      var rect = canvas && canvas.getBoundingClientRect();
      if (!canvas || !rect) return;

      var newIndex;
      var direction = null, distance = 0;
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

      setAutoScrollState({ direction: direction, distance: distance });
      autoScrollStateRef.current = { direction: direction, distance: distance };
      setSingleAutoScrollDirection(direction);
    }

    function handleGlobalMouseUp() {
      setIsSettingCurrentIndex(false);
      setIsDragging(false);
      setSingleAutoScrollDirection(null);
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    }

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return function () {
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

    scrollIntervalRef.current = setInterval(function () {
      var dir = autoScrollDirectionRef.current;
      var step = dir === 'left' ? -1 : 1;
      if (isSettingCurrentIndex) {
        setCurrentIndex(function (prevIdx) {
          var next = Math.max(0, Math.min(FRAME_COUNT - 1, prevIdx + step));
          makeFrameVisible(next);
          return next;
        });
      }
      if (isDragging) {
        setDragEnd(function (prev) {
          var next = Math.max(0, Math.min(FRAME_COUNT - 1, prev + step));
          setCurrentIndex(next);
          makeFrameVisible(next);
          return next;
        });
      }
    }, 16);

    return function () { clearInterval(scrollIntervalRef.current); };
  }, [isSettingCurrentIndex, isDragging, autoScrollDirection]);

  const getFrameIndexAtX = (clientX) => {
    var canvas = canvasRef.current;
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var x = (clientX - rect.left) * scaleX;
    if (x < 0) x = 0;
    if (x > canvas.width) x = canvas.width;
    return Math.max(0, Math.min(FRAME_COUNT - 1, Math.floor(x / scale) + viewStart));
  };

  const addAnnotation = (start, end) => {
    var s = Math.min(start, end);
    var e = Math.max(start, end);
    var newAnnotations = [];
    annotations.forEach(function (a) {
      if (e + 1 >= a.start && s - 1 <= a.end) {
        s = Math.min(s, a.start);
        e = Math.max(e, a.end);
      } else {
        newAnnotations.push(a);
      }
    });
    newAnnotations.push({ start: s, end: e });
    newAnnotations.sort(function (a, b) { return a.start - b.start; });
    setAnnotations(newAnnotations);
  };

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
      const dx = e.clientX - (panStartX || 0);
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
        setAnnotations(function (prev) {
          var next = [];
          prev.forEach(function (a) {
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
          return next.sort(function (a, b) { return a.start - b.start; });
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
    setCurrentIndexWithVisible(index);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    var left = canvasRef.current.getBoundingClientRect().left;
    var x = e.clientX - left;
    var mouseFrame = Math.floor(x / scale) + viewStart;

    var minScale = canvasWidth / FRAME_COUNT;
    var newScale = scale + (e.deltaY < 0 ? 1 : -1);
    newScale = Math.max(minScale, Math.min(MAX_SCALE, newScale));
    if (newScale === scale) return;

    var newVisible = Math.min(FRAME_COUNT, Math.floor(canvasWidth / newScale));
    var newViewStart = mouseFrame - Math.floor((x / canvasWidth) * newVisible);
    newViewStart = Math.max(0, Math.min(FRAME_COUNT - newVisible, newViewStart));
    setScale(newScale);
    setViewStart(newViewStart);
  };

  const handleSummaryBarMouseDown = (e) => {
    var rect = summaryBarRef.current.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var selX = (viewStart / FRAME_COUNT) * canvasWidth;
    var selW = (visibleFrames / FRAME_COUNT) * canvasWidth;

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
    var canvas = summaryBarRef.current;
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var totalFrames = FRAME_COUNT;

    var handleW = 6;
    var minSelW = handleW * 2;
    var selW = (visibleFrames / FRAME_COUNT) * canvasWidth - handleW;
    if (selW < minSelW) selW = minSelW;
    var selX = (viewStart / FRAME_COUNT) * canvasWidth + handleW / 2;

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
      var dx = x - barDragStartX;
      var frameShift = Math.round((dx / canvasWidth) * totalFrames);
      var newStart = (barDragStartView || 0) + frameShift;
      newStart = Math.max(0, Math.min(FRAME_COUNT - visibleFrames, newStart));
      setViewStart(newStart);
    }
    if (dragBarMode === 'left') {
      var rightFrame = barDragStartRightFrame || ((barDragStartView || 0) + visibleFrames);
      var leftFrame = Math.round((x / canvasWidth) * totalFrames);
      leftFrame = Math.max(0, Math.min(rightFrame - 1, leftFrame));
      var newFrames = rightFrame - leftFrame;
      newFrames = Math.max(1, Math.min(FRAME_COUNT, newFrames));
      var newScale = canvasWidth / newFrames;
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      setScale(newScale);
      setViewStart(leftFrame);
    }
    if (dragBarMode === 'right') {
      var leftFrame = barDragStartLeftFrame || (barDragStartView || 0);
      var rightFrame = Math.round((x / canvasWidth) * totalFrames);
      rightFrame = Math.max(leftFrame + 1, Math.min(FRAME_COUNT, rightFrame));
      var newFrames = rightFrame - leftFrame;
      newFrames = Math.max(1, Math.min(FRAME_COUNT, newFrames));
      var newScale = canvasWidth / newFrames;
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
    var canvas = summaryBarRef.current;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasWidth, BAR_HEIGHT);

    annotations.forEach(function (a) {
      var start = a.start, end = a.end;
      var x = (start / FRAME_COUNT) * canvasWidth;
      var w = ((end - start + 1) / FRAME_COUNT) * canvasWidth;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(x, 6, w, BAR_HEIGHT - 12);
    });

    var handleW = 5, handleH = BAR_HEIGHT - 8;
    var minSelW = 4;
    var selW = (visibleFrames / FRAME_COUNT) * canvasWidth - handleW;
    if (selW < minSelW) selW = minSelW;
    var selX = (viewStart / FRAME_COUNT) * canvasWidth + handleW / 2;
    var radius = 1;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(selX, 4, selW, BAR_HEIGHT - 8, radius);
    } else {
      ctx.rect(selX, 4, selW, BAR_HEIGHT - 8);
    }

    var grad = ctx.createLinearGradient(selX, 0, selX + selW, 0);
    grad.addColorStop(0, 'rgba(37,99,235,0.18)');
    grad.addColorStop(0.5, 'rgba(37,99,235,0.36)');
    grad.addColorStop(1, 'rgba(37,99,235,0.18)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2563eb';
    ctx.stroke();

    var leftHandleX = selX - handleW / 2;
    var rightHandleX = selX + selW - handleW / 2;

    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(leftHandleX, 4, handleW, handleH, 4);
    } else {
      ctx.rect(leftHandleX, 4, handleW, handleH);
    }
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#2563eb';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(rightHandleX, 4, handleW, handleH, 4);
    } else {
      ctx.rect(rightHandleX, 4, handleW, handleH);
    }
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#2563eb';
    ctx.stroke();
    ctx.restore();
  }, [canvasWidth, annotations, viewStart, scale, visibleFrames]);

  return {
    canvasRef,
    summaryBarRef,
    containerRef,
    canvasWidth, setCanvasWidth,
    scale, setScale,
    viewStart, setViewStart,
    annotations, setAnnotations,
    isDragging, setIsDragging,
    dragStart, setDragStart,
    dragEnd, setDragEnd,
    currentIndex, setCurrentIndex,
    isDeleting, setIsDeleting,
    isPlaying, setIsPlaying,
    playSpeed, setPlaySpeed,
    dragBarMode,
    barDragStartX, barDragStartView, barDragStartScale,
    barDragStartLeftFrame, barDragStartRightFrame,
    isSettingCurrentIndex, setIsSettingCurrentIndex,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleContextMenu,
    handleSummaryBarMouseDown,
    handleSummaryBarMouseMove,
    handleSummaryBarMouseUp,
    BAR_HEIGHT,
    isPanning
  };
}
