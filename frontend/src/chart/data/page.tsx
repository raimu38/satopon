'use client'
import React, { useState, useEffect } from "react";

// 画像パスの生成関数
function generateImagePaths(count = 50, startFrame = 100, baseTimestamp = 1684875600) {
  const result = [];
  let currentFrame = startFrame;
  let currentTimestamp = baseTimestamp;

  for (let i = 0; i < count; i++) {
    const isAnomaly = Math.random() < 0.2; // 20%の確率でanomaly
    const fractionalSec = (Math.random() * 0.999999).toFixed(6);
    const fullTimestamp = `${currentTimestamp}.${fractionalSec}`;
    const suffix = isAnomaly ? "_anomaly" : "";

    result.push(`images/${currentFrame}_${fullTimestamp}${suffix}.jpg`);

    // フレーム番号は1〜4の範囲で進める
    const frameStep = Math.floor(Math.random() * 2) + 1;
    currentFrame += frameStep;

    // タイムスタンプもランダムに進める（5〜15秒）
    currentTimestamp += Math.floor(Math.random() * 11) + 5;
  }

  return result;
}

// 画像名のパース関数
function parseImageName(path) {
  const filename = path.split("/").pop(); // "110_1684876200.123456_anomaly.jpg"
  const parts = filename.replace(".jpg", "").split("_");

  return {
    frame: parseInt(parts[0], 10),
    timestamp: parseFloat(parts[1]),
    isAnomaly: parts.length === 3
  };
}

// 異常範囲の構築関数
function buildErrorRanges(imagePaths) {
  const parsed = imagePaths.map(parseImageName);
  const anomalyFrames = parsed.filter(p => p.isAnomaly).map(p => p.frame).sort((a, b) => a - b);

  const ranges = [];
  let start = null;
  let end = null;

  for (let i = 0; i < anomalyFrames.length; i++) {
    if (start === null) {
      start = anomalyFrames[i];
      end = anomalyFrames[i];
    } else if (anomalyFrames[i] === end + 1) {
      end = anomalyFrames[i];
    } else {
      ranges.push({ start, end, type: "anomaly" });
      start = anomalyFrames[i];
      end = anomalyFrames[i];
    }
  }

  if (start !== null) {
    ranges.push({ start, end, type: "anomaly" });
  }

  return ranges;
}

// メインコンポーネント
function DemoApp() {
  const [imagePaths, setImagePaths] = useState([]);
  const [errorRangesV, setErrorRangesV] = useState([]);
  const [newRange, setNewRange] = useState({ start: "", end: "", type: "anomaly" });

  useEffect(() => {
    const paths = generateImagePaths();
    console.log("🔹 生成された画像パス:", paths);
    setImagePaths(paths);

    const ranges = buildErrorRanges(paths);
    console.log("🔹 初期の異常範囲:", ranges);
    setErrorRangesV(ranges);
  }, []);


const handleAdd = () => {
  const start = parseInt(newRange.start, 10);
  const end = parseInt(newRange.end, 10);
  if (isNaN(start) || isNaN(end) || start > end) {
    alert("Invalid start or end frame");
    return;
  }

  const rangeToAdd = { start, end, type: newRange.type };
  console.log("➕ Adding range:", rangeToAdd);

  const merged = [];
  for (let range of errorRangesV) {
    if (range.type !== rangeToAdd.type) {
      merged.push(range);
      continue;
    }

    const overlap = !(rangeToAdd.end < range.start - 1 || rangeToAdd.start > range.end + 1);
    if (overlap) {
      rangeToAdd.start = Math.min(rangeToAdd.start, range.start);
      rangeToAdd.end = Math.max(rangeToAdd.end, range.end);
    } else {
      merged.push(range);
    }
  }

  merged.push(rangeToAdd);

  const sorted = merged
    .filter(r => r.type === rangeToAdd.type)
    .sort((a, b) => a.start - b.start);

  const clean = [];
  for (let r of sorted) {
    if (!clean.length) {
      clean.push(r);
    } else {
      const last = clean[clean.length - 1];
      if (r.start <= last.end + 1) {
        last.end = Math.max(last.end, r.end);
      } else {
        clean.push(r);
      }
    }
  }

  console.log("📤 Simulated API call:", {
    anomalies: rangeToAdd.type === "anomaly" ? [{ start, end }] : [],
    cancelled_annotations: [],
  });

  setErrorRangesV(clean);
  console.log("📦 更新後の errorRangesV:", clean); // ← 追加されたログ
  setNewRange({ start: "", end: "", type: "anomaly" });
};
  const handleRemove = (index) => {
    const removed = errorRangesV[index];
    const updated = errorRangesV.filter((_, i) => i !== index);
    console.log(`➖ インデックス ${index} の異常範囲を削除:`, removed);
    setErrorRangesV(updated);
    console.log("📦 更新後の errorRangesV:", updated);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>🧪 異常範囲デモ</h2>

      <div style={{ marginBottom: "20px" }}>
        <h3>➕ 異常範囲の追加</h3>
        <input
          type="number"
          placeholder="開始フレーム"
          value={newRange.start}
          onChange={e => setNewRange({ ...newRange, start: e.target.value })}
        />
        <input
          type="number"
          placeholder="終了フレーム"
          value={newRange.end}
          onChange={e => setNewRange({ ...newRange, end: e.target.value })}
        />
        <select
          value={newRange.type}
          onChange={e => setNewRange({ ...newRange, type: e.target.value })}
        >
          <option value="anomaly">anomaly</option>
          <option value="AI">AI</option>
        </select>
        <button onClick={handleAdd}>追加</button>
      </div>

      <div>
        <h3>📦 現在の異常範囲</h3>
        <ul>
          {errorRangesV.map((range, index) => (
            <li key={index}>
              {range.start} - {range.end} ({range.type})
              <button onClick={() => handleRemove(index)}>削除</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default DemoApp;
