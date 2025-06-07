import React, { useEffect, useState } from "react";
import styles from "./HelpPanel.module.css";

function HelpPanel({ open, onClose }) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
    } else if (mounted) {
      setExiting(true);
      const t = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className={`bg-slate-900/95 border border-slate-600/60 rounded-2xl shadow-2xl p-8 max-w-xl w-full relative ${
          exiting ? styles.helpPanelExit : styles.helpPanelEnter
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-4 text-slate-400 hover:text-white text-2xl"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-semibold mb-4 text-slate-200">
          アノテーション 操作方法ガイド
        </h2>
        <div className="space-y-4 text-slate-300 text-base leading-relaxed">
          <section>
            <h3 className="font-semibold mb-1 text-slate-100">
              ■ タイムライン操作
            </h3>
            <ul className="ml-2 list-disc space-y-1 text-sm">
              <li>
                <b>左クリック：</b> クリック位置にフレーム移動
              </li>
              <li>
                <b>右ドラッグ：</b> 範囲選択でアノテーション追加
              </li>
              <li>
                <b>Ctrl + 右ドラッグ：</b> 範囲選択でアノテーション削除
              </li>
              <li>
                <b>ホイール：</b> 拡大・縮小
              </li>
              <li>
                <b>ホイールドラッグ：</b> 横スクロール
              </li>
              <li>
                <b>← → キー：</b> 1フレームずつ移動（長押しで連続移動）
              </li>
            </ul>
          </section>
          <section>
            <h3 className="font-semibold mb-1 text-slate-100">
              ■ サマリーバー操作
            </h3>
            <ul className="ml-2 list-disc space-y-1 text-sm">
              <li>
                <b>中央ドラッグ：</b> 表示範囲のパン移動
              </li>
              <li>
                <b>左右端ドラッグ：</b> 表示範囲の拡大／縮小
              </li>
            </ul>
          </section>
          <section>
            <h3 className="font-semibold mb-1 text-slate-100">
              ■ その他の操作
            </h3>
            <ul className="ml-2 list-disc space-y-1 text-sm">
              <li>
                <b>右「ANOMALIES」リストのクリック：</b> 区間へジャンプ
              </li>
              <li>
                <b>再生ボタン：</b> 自動フレーム送り・停止
              </li>
              <li>
                <b>スピードバー：</b> 再生速度の調整
              </li>
              <li>
                <b>Ctrl + Z：</b> やり直し
              </li>
              <li>
                <b>Ctrl + Shift + Z：</b> 進む
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default HelpPanel;
