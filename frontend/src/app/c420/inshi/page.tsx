"use client";

import { useState, useCallback } from "react";
import { jsPDF } from "jspdf";

export default function Home() {
  // mm単位での入力
  const [widthMm, setWidthMm] = useState<number>(160);
  const [heightMm, setHeightMm] = useState<number>(170);
  const [numChars, setNumChars] = useState<number>(400);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const generatePdf = useCallback(() => {
    const PAGE_W = 210; // A4幅 (mm)
    const PAGE_H = 297; // A4高 (mm)
    const areaW = widthMm;
    const areaH = heightMm;

    // マスサイズ初期推定
    let boxSize = Math.sqrt((areaW * areaH) / Math.max(1, numChars));
    for (let i = 0; i < 500; i++) {
      const cols = Math.floor(areaW / boxSize);
      const rows = Math.floor(areaH / boxSize);
      if (cols * rows >= numChars) break;
      boxSize *= 0.98;
    }

    const cols = Math.floor(areaW / boxSize);
    const rows = Math.floor(areaH / boxSize);
    const total = cols * rows;

    const gridW = cols * boxSize;
    const gridH = rows * boxSize;
    const offsetX = (PAGE_W - gridW) / 2;
    const offsetY = (PAGE_H - gridH) / 2;

    const doc = new jsPDF({ unit: "mm", format: "a4" });

    // 外枠
    doc.setDrawColor(0);
    doc.setLineWidth(0.8);
    doc.rect(offsetX, offsetY, gridW, gridH);
    doc.setFontSize(10);
    doc.text(`${widthMm} mm × ${heightMm} mm`, offsetX + 2, offsetY - 2);

    // グリッド線
    doc.setLineWidth(0.2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        doc.rect(offsetX + c * boxSize, offsetY + r * boxSize, boxSize, boxSize);
      }
    }

    // 列・行・合計マス数
    doc.setFontSize(12);
    const info = `Cols: ${cols}, Rows: ${rows}, Total: ${total}`;
    doc.text(info, PAGE_W / 2, offsetY + gridH + 10, { align: "center" });

    // Blob→URL
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    // 既存のURLを解放
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(url);
  }, [widthMm, heightMm, numChars, pdfUrl]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center p-8 relative overflow-hidden">
      {/* 背景エフェクト */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10"></div>
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-pink-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* メインコンテンツ */}
      <div className="relative z-10 w-full max-w-6xl">
        {/* ヘッダー */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4 tracking-tight">
            PDF グリッド
          </h1>
          <h2 className="text-4xl font-bold text-white/90 mb-2">ジェネレータ</h2>
          <p className="text-xl text-white/70 font-light">美しいグリッドPDFを瞬時に生成</p>
        </div>

        {/* メインコンテナ */}
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* 左側: 入力フォーム */}
          <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300">
            <div className="space-y-6">
              {/* 横幅入力 */}
              <div className="group">
                <label className="block mb-3">
                  <span className="text-white/90 font-semibold text-lg flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    横幅 (mm)
                  </span>
                  <div className="mt-2 relative">
                    <input
                      type="number"
                      step="1"
                      value={widthMm}
                      onChange={(e) => setWidthMm(parseInt(e.target.value, 10))}
                      className="w-full bg-white/20 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200 text-lg font-medium"
                      placeholder="160"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                  </div>
                </label>
              </div>

              {/* 縦幅入力 */}
              <div className="group">
                <label className="block mb-3">
                  <span className="text-white/90 font-semibold text-lg flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    縦幅 (mm)
                  </span>
                  <div className="mt-2 relative">
                    <input
                      type="number"
                      step="1"
                      value={heightMm}
                      onChange={(e) => setHeightMm(parseInt(e.target.value, 10))}
                      className="w-full bg-white/20 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-200 text-lg font-medium"
                      placeholder="170"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-400/20 to-pink-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                  </div>
                </label>
              </div>

              {/* 最小マス数入力 */}
              <div className="group">
                <label className="block mb-6">
                  <span className="text-white/90 font-semibold text-lg flex items-center gap-2">
                    <div className="w-2 h-2 bg-pink-400 rounded-full"></div>
                    最小マス数（文字数目安）
                  </span>
                  <div className="mt-2 relative">
                    <input
                      type="number"
                      value={numChars}
                      onChange={(e) => setNumChars(parseInt(e.target.value, 10))}
                      className="w-full bg-white/20 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-200 text-lg font-medium"
                      placeholder="400"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-pink-400/20 to-blue-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                  </div>
                </label>
              </div>

              {/* 生成ボタン */}
              <button
                onClick={generatePdf}
                className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white py-4 rounded-2xl font-bold text-lg hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl active:scale-95 border border-white/20"
              >
                <span className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  PDF を生成
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse delay-500"></div>
                </span>
              </button>

              {/* ダウンロードリンク */}
              {pdfUrl && (
                <div className="mt-6 p-4 bg-green-500/20 backdrop-blur-sm rounded-2xl border border-green-400/30">
                  <a
                    href={pdfUrl}
                    download="grid.pdf"
                    className="block text-center text-green-300 hover:text-green-200 font-semibold text-lg transition-colors duration-200"
                    onClick={() => {
                      setTimeout(() => {
                        URL.revokeObjectURL(pdfUrl);
                        setPdfUrl(null);
                      }, 100);
                    }}
                  >
                    ✨ ここをクリックしてダウンロード ✨
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* 右側: プレビュー */}
          <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300">
            <h3 className="text-2xl font-bold text-white/90 mb-6 flex items-center gap-2">
              <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full"></div>
              プレビュー
            </h3>
            {pdfUrl ? (
              <div className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/20">
                <iframe
                  src={pdfUrl}
                  title="PDF Preview"
                  width="100%"
                  height="600px"
                  className="rounded-2xl"
                />
              </div>
            ) : (
              <div className="h-96 flex items-center justify-center bg-white/5 rounded-2xl border border-white/20 border-dashed">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <div className="w-8 h-8 bg-white rounded-sm"></div>
                  </div>
                  <p className="text-white/60 text-lg font-medium">PDFを生成してプレビューを表示</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* フッター */}
      <footer className="mt-16 text-white/50 text-sm font-light relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 bg-white/30 rounded-full"></div>
          &copy; {new Date().getFullYear()} PDF Grid Generator
          <div className="w-1 h-1 bg-white/30 rounded-full"></div>
        </div>
      </footer>
    </main>
  );
}
