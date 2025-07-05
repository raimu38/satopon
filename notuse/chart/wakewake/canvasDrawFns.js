export function drawTimelineCanvas({
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
  dragEnd,
  BAR_HEIGHT,
  isDeleting,
  currentIndex,
}) {


  
if (!FRAME_COUNT || !BAR_HEIGHT) return null;
if (
    !ctx ||
    !Number.isFinite(canvasWidth) || canvasWidth <= 0 ||
    !Number.isFinite(BAR_HEIGHT) || BAR_HEIGHT <= 0 ||
    !Number.isFinite(visibleFrames) || visibleFrames <= 0 ||
    !Number.isFinite(FRAME_COUNT) || FRAME_COUNT <= 0
  ) {
    // ここでログを出してもOK（デバッグ用）
     console.log('Canvas param error:', {canvasWidth, BAR_HEIGHT, visibleFrames, FRAME_COUNT});
    return;
  }
  ctx.clearRect(0, 0, canvasWidth, 100);
  
  // グラデーション背景
  const bgGradient = ctx.createLinearGradient(0, 0, 0, 100);
  bgGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
  bgGradient.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvasWidth, 100);
  
  // フレーム描画
  for (let i = 0; i < visibleFrames; i++) {
    const frameIndex = viewStart + i;
    if (frameIndex >= FRAME_COUNT) continue;
    const x = i * scale;
    
    // フレームバーのグラデーション
    const frameGradient = ctx.createLinearGradient(x, 0, x, 100);
    frameGradient.addColorStop(0, 'rgba(71, 85, 105, 0.6)');
    frameGradient.addColorStop(1, 'rgba(51, 65, 85, 0.8)');
    ctx.fillStyle = frameGradient;
    ctx.fillRect(x, 8, scale - 3, 84);
    
    // フレーム境界線
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, 8, scale - 3, 84);
    
    // フレーム番号テキスト
    if (scale >= 10 || frameIndex % Math.ceil(10 / scale) === 0) {
      ctx.fillStyle = 'rgba(203, 213, 225, 0.9)';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(frameIndex + " (" + (indexToFrame[frameIndex] ?? "") + ")", x + 6, 28);
    }
  }
  
  // アノテーション範囲（強化版）
// アノテーション（本物）はこれまで通り「しっかりした赤」！
annotations.forEach(({ start, end }) => {
  if (!FRAME_COUNT) return;
  if (end < viewStart || start > viewStart + visibleFrames - 1) return;
  const s = Math.max(start, viewStart);
  const e = Math.min(end, viewStart + visibleFrames - 1);
  const x = (s - viewStart) * scale;
  const w = (e - s + 1) * scale;

  // 本物のアノテーション（濃い赤）
  const annotationGradient = ctx.createLinearGradient(x, 0, x, 100);
  annotationGradient.addColorStop(0, 'rgba(239, 68, 68, 0.7)');
  annotationGradient.addColorStop(1, 'rgba(220, 38, 38, 0.8)');
  ctx.fillStyle = annotationGradient;
  ctx.fillRect(x, 8, w, 84);
  ctx.strokeStyle = 'rgba(239, 68, 68, 1)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, 8, w, 84);
});

// ドラッグ中は、「薄い色」で範囲を描画！
if (isDragging && dragStart !== null && dragEnd !== null) {
  const s = Math.max(Math.min(dragStart, dragEnd), viewStart);
  const e = Math.min(Math.max(dragStart, dragEnd), viewStart + visibleFrames - 1);
  const x = (s - viewStart) * scale;
  const w = (e - s + 1) * scale;

  const dragGradient = ctx.createLinearGradient(x, 0, x, 100);
  if (isDeleting) {
    // 削除：黄色（**薄く！**）
    dragGradient.addColorStop(0, 'rgba(251, 191, 36, 0.25)');
    dragGradient.addColorStop(1, 'rgba(245, 158, 11, 0.3)');
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
  } else {
    // 追加：赤（**薄く！**）
    dragGradient.addColorStop(0, 'rgba(239, 68, 68, 0.18)');
    dragGradient.addColorStop(1, 'rgba(220, 38, 38, 0.22)');
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
  }
  ctx.fillStyle = dragGradient;
  ctx.fillRect(x, 8, w, 84);

  // 薄い枠
  ctx.lineWidth = 2;
  ctx.strokeRect(x, 8, w, 84);
}
  // 現在地インジケータ（強化版）
  if (currentIndex !== null && currentIndex >= viewStart && currentIndex < viewStart + visibleFrames) {
    const x = (currentIndex - viewStart) * scale + scale / 2;
    
    // グロー効果
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // メインライン
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, 92);
    const lineGradient = ctx.createLinearGradient(0, 0, 0, 100);
    lineGradient.addColorStop(0, '#60a5fa');
    lineGradient.addColorStop(1, '#3b82f6');
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 4;
    ctx.stroke();
    
    ctx.shadowBlur = 0;
    
    // インジケータドット
    ctx.beginPath();
    ctx.arc(x, 50, 6, 0, Math.PI * 2);
    const dotGradient = ctx.createRadialGradient(x, 50, 0, x, 50, 6);
    dotGradient.addColorStop(0, '#ffffff');
    dotGradient.addColorStop(1, '#3b82f6');
    ctx.fillStyle = dotGradient;
    ctx.fill();
    
    // フレーム番号
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(currentIndex, x + 8, 82);
  }
}

// Summary Barの描画（強化版）
export function drawSummaryBarCanvas({
  ctx,
  canvasWidth,
  BAR_HEIGHT,
  annotations,
  viewStart,
  scale,
  visibleFrames,
  FRAME_COUNT
}) {
  ctx.clearRect(0, 0, canvasWidth, BAR_HEIGHT);
  
  // 背景グラデーション
  const bgGradient = ctx.createLinearGradient(0, 0, 0, BAR_HEIGHT);
  bgGradient.addColorStop(0, 'rgba(30, 41, 59, 0.6)');
  bgGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvasWidth, BAR_HEIGHT);
  
  // アノテーション範囲（強化版）
  annotations.forEach(({ start, end }) => {
    if (!FRAME_COUNT) return;
    const x = FRAME_COUNT > 0 ? (start / FRAME_COUNT) * canvasWidth : 0;
    const w = FRAME_COUNT > 0 ? ((end - start + 1) / FRAME_COUNT) * canvasWidth : 0;
    
    const annotationGradient = ctx.createLinearGradient(x, 0, x + w, 0);
    annotationGradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    annotationGradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.6)');
    annotationGradient.addColorStop(1, 'rgba(239, 68, 68, 0.4)');
    ctx.fillStyle = annotationGradient;
    ctx.fillRect(x, 8, w, BAR_HEIGHT - 16);
  });
  
  // 選択領域（表示中の範囲）- 強化版
  const handleW = 6, handleH = BAR_HEIGHT - 10;
  const minSelW = 6;
  let selW = FRAME_COUNT > 0 ? (visibleFrames / FRAME_COUNT) * canvasWidth - handleW : minSelW;
  if (selW < minSelW) selW = minSelW;
  const selX = FRAME_COUNT > 0 ? (viewStart / FRAME_COUNT) * canvasWidth + handleW / 2 : 0;
  const radius = 4;
  
  // 選択範囲のグロー効果
  ctx.shadowColor = '#3b82f6';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  ctx.beginPath();
  ctx.roundRect(selX, 5, selW, BAR_HEIGHT - 10, radius);
  const selGradient = ctx.createLinearGradient(selX, 0, selX + selW, 0);
  selGradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
  selGradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.5)');
  selGradient.addColorStop(1, 'rgba(59, 130, 246, 0.3)');
  ctx.fillStyle = selGradient;
  ctx.fill();
  
  ctx.shadowBlur = 0;
  
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3b82f6';
  ctx.stroke();
  
  // 左右ハンドル（強化版）
  const leftHandleX = selX - handleW / 2;
  const rightHandleX = selX + selW - handleW / 2;
  
  // 左ハンドル
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(leftHandleX, 5, handleW, handleH, 6);
  const leftHandleGradient = ctx.createLinearGradient(leftHandleX, 0, leftHandleX + handleW, 0);
  leftHandleGradient.addColorStop(0, '#ffffff');
  leftHandleGradient.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = leftHandleGradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3b82f6';
  ctx.stroke();
  ctx.restore();
  
  // 右ハンドル
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rightHandleX, 5, handleW, handleH, 6);
  const rightHandleGradient = ctx.createLinearGradient(rightHandleX, 0, rightHandleX + handleW, 0);
  rightHandleGradient.addColorStop(0, '#e2e8f0');
  rightHandleGradient.addColorStop(1, '#ffffff');
  ctx.fillStyle = rightHandleGradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3b82f6';
  ctx.stroke();
  ctx.restore();
}
