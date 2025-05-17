// src/app/point/GameCycle.tsx
'use client'

import React from 'react'
import { useGameCycle } from './hooks/useGameCycle'
import { Button } from './components/Button'
import * as s from './styles'

export default function GameCycle() {
  const ctx = useGameCycle()

  // ヘルパー: ポイント変動アイコン
  const renderDeltaIcon = (fIcon: string, d: number) => (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${
      d > 0 ? 'bg-blue-500' : d < 0 ? 'bg-red-500' : 'bg-gray-500'
    }`}>
      {fIcon}
    </div>
  )

  return (
    <div>
      {/* 戻るボタン */}
      {ctx.canBack && (
        <Button
          variant="tertiary"
          onClick={ctx.back}
          className="absolute top-4 left-4"
        >
          ← 戻る
        </Button>
      )}

      {/* ロビー */}
      {ctx.stage === 'lobby' && (
        <div className={s.container}>
          {/* 操作パネル */}
          <div className="w-full max-w-md px-6 mb-6 flex justify-end space-x-2">
            <Button variant="secondary" onClick={ctx.openSettlement}>
              精算する
            </Button>
            <Button variant="primary" onClick={() => {
              const name = prompt('友達の名前を入力')
              if (!name) return
              const id = Date.now()
              ctx.friends.push({
                id, name, icon: name[0].toUpperCase(),
                points: 0, registered: false
              })
            }}>
              ＋ 追加
            </Button>
          </div>

          {/* プレイヤー一覧 */}
          <div className={`${s.cardGrid}`}>
            {ctx.friends.map(f => (
              <div
                key={f.id}
                onClick={() => ctx.toggleRegister(f.id)}
                className={`${s.cardBase} ${
                  f.registered
                    ? 'bg-gradient-to-tr from-blue-500 to-indigo-600 text-white'
                    : 'bg-indigo-900 bg-opacity-30 text-indigo-200 hover:bg-opacity-40'
                }`}
              >
                <div
                  onClick={e => { e.stopPropagation(); ctx.openDetail(f.id) }}
                  className="w-12 h-12 bg-indigo-600 bg-opacity-50 rounded-full flex items-center justify-center mb-2 text-white"
                >
                  {f.icon}
                </div>
                <div className="font-medium">{f.name}</div>
                <div className="text-sm mt-1">{f.points} pt</div>
              </div>
            ))}
          </div>

          {/* ゲームスタート */}
          <Button
            variant="primary"
            onClick={ctx.startGame}
            disabled={ctx.friends.filter(f => f.registered).length < 2}
            className="mt-6 w-full max-w-md py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ゲームスタート ({ctx.friends.filter(f => f.registered).length} 名)
          </Button>

          {/* 詳細モーダル */}
          {ctx.detailTarget != null && (
            <div className={s.modalOverlay}>
              <div className={s.panel + ' space-y-4'}>
                <Button
                  variant="tertiary"
                  onClick={ctx.closeDetail}
                  className="absolute top-3 right-3 p-2 bg-indigo-600 bg-opacity-50 text-white hover:bg-opacity-75"
                >✕</Button>
                {(() => {
                  const f = ctx.friends.find(x => x.id === ctx.detailTarget)!
                  return (
                    <>
                      <div className="text-center">
                        <div className="w-16 h-16 bg-indigo-600 bg-opacity-50 rounded-full mx-auto flex items-center justify-center text-xl text-white mb-2">
                          {f.icon}
                        </div>
                        <h3 className="text-lg font-bold text-white">{f.name}</h3>
                        <p className="text-indigo-200">{f.points} pt</p>
                      </div>
                      <Button variant="secondary" onClick={() => ctx.exitFriend(f.id)}>
                        退出する
                      </Button>
                    </>
                  )
                })()}
              </div>
            </div>
          )}

          {/* ゲーム履歴 */}
          {ctx.detailTarget == null && (
            <section className={s.historySection}>
              <h2 className="text-2xl font-bold text-white">ゲーム履歴</h2>
              {ctx.history.length === 0 ? (
                <p className="text-indigo-200 text-center">まだ履歴がありません</p>
              ) : (
                ctx.history.map(h => (
                  <div key={h.id} className={s.historyItem}>
                    <div className="flex justify-between text-sm text-indigo-200">
                      <span>開始: {h.start.toLocaleTimeString()}</span>
                      <span>時間: {h.duration}s</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(h.deltas).map(([id, d]) => {
                        const f = ctx.friends.find(x => x.id === +id)!
                        return (
                          <div key={id} className="flex flex-col items-center">
                            {renderDeltaIcon(f.icon, d)}
                            <div className="text-sm text-white">{f.name}</div>
                            <div className={d>0?'text-blue-300':d<0?'text-red-300':'text-indigo-200'}>
                              {d>=0?'+':''}{d}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </section>
          )}
        </div>
      )}

      {/* 参加確認 */}
      {ctx.stage === 'notify' && (
        <div className={s.modalOverlay}>
          <div className={s.panel + ' space-y-6'}>
            <h2 className="text-2xl font-bold text-white text-center">参加確認</h2>
            <ul className="space-y-4 max-h-80 overflow-y-auto">
              {ctx.invitedIds.map(id => {
                const f = ctx.friends.find(x => x.id === id)!
                return (
                  <li key={id} className="flex justify-between items-center">
                    <span className="text-white">{f.name} さん、参加しますか？</span>
                    <div className="flex space-x-2">
                      <Button variant="secondary" onClick={() => ctx.confirmParticipation(id)}>参加する</Button>
                      <Button variant="tertiary" onClick={ctx.rejectParticipation}>拒否</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <Button
              variant="primary"
              onClick={ctx.proceedToTimer}
              disabled={ctx.confirmedIds.length !== ctx.invitedIds.length}
              className="w-full"
            >
              全員参加 → 開始
            </Button>
          </div>
        </div>
      )}

      {/* タイマー */}
      {ctx.stage === 'timer' && (
        <div className="w-screen h-screen relative flex flex-col items-center pt-12 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700 overflow-hidden">
          <div className="absolute inset-0 bg-[url('/pattern.png')] opacity-10 animate-[spin_60s_linear_infinite]"></div>
          <h2 className="relative z-10 text-5xl font-extrabold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] mb-6">⏱ ゲーム進行中</h2>
          <div className="relative z-10 text-9xl font-mono text-white mb-8 animate-pulse drop-shadow-[0_0_16px_rgba(0,255,255,0.7)]">
            {ctx.seconds}
          </div>
          <Button
            variant="tertiary"
            onClick={ctx.stopGame}
            className="relative z-10 px-10 py-4 bg-red-600 bg-opacity-90 text-white text-lg font-semibold rounded-full ring-2 ring-red-400 ring-opacity-60 hover:bg-red-700 hover:ring-red-500 transition-all mb-5"
          >
            停止・得点登録へ
          </Button>
          {/* チャット は省略します */}
        </div>
      )}

      {/* 得点入力 */}
      {ctx.stage === 'input' && (
        <div className="w-screen h-screen relative flex flex-col items-center pt-12 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700 overflow-hidden">
          <div className="space-y-4 w-full max-w-md bg-indigo-900 bg-opacity-20 backdrop-blur-sm rounded-2xl p-6 mx-auto">
            {ctx.invitedIds.map(id => {
              const f = ctx.friends.find(x => x.id === id)!
              return (
                <div key={id} className="flex justify-between items-center">
                  <span className="text-white">{f.name}</span>
                  <input
                    type="number" step={5} placeholder="±5"
                    className={s.inputBase}
                    onChange={e => ctx.handleDelta(id, Number(e.target.value))}
                  />
                </div>
              )
            })}
            <Button variant="secondary" onClick={ctx.submitInput} className="mt-6 w-full">
              承認を要求
            </Button>
          </div>
        </div>
      )}

      {/* 承認確認 */}
      {ctx.stage === 'approve' && (
        <div className={s.modalOverlay}>
          <div className={s.panel + ' space-y-4'}>
            <h3 className="text-xl font-bold text-white text-center">承認確認</h3>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {Object.entries(ctx.deltas).map(([id, d]) => {
                const f = ctx.friends.find(x => x.id === +id)!
                return (
                  <li key={id} className="flex justify-between">
                    <span className="text-white">{f.name}</span>
                    <span className={`${d>=0?'text-blue-400':'text-red-400'} font-medium`}>
                      {d>=0?'+':''}{d} pt
                    </span>
                  </li>
                )
              })}
            </ul>
            <Button variant="primary" onClick={ctx.confirmApprove} className="w-full">
              全員承認して確定
            </Button>
          </div>
        </div>
      )}

      {/* 精算 */}
      {ctx.stage === 'settlement' && (
        <div className={s.modalOverlay}>
          <div className={s.panel + ' space-y-4'}>
            <Button variant="tertiary" onClick={ctx.back}
                    className="absolute top-3 left-3 p-2 bg-indigo-600 bg-opacity-50 text-white hover:bg-opacity-75">
              ← 戻る
            </Button>
            <h3 className="text-xl font-bold text-white text-center">精算リクエスト</h3>
            {ctx.settleTarget == null ? (
              ctx.eligible.length === 0 ? (
                <p className="text-indigo-200 text-center">あなたは精算の必要はありません。</p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {ctx.eligible.map(f => (
                    <Button
                      key={f.id}
                      variant="tertiary"
                      className="p-3 bg-indigo-900 bg-opacity-30 text-white border border-indigo-700"
                      onClick={() => { ctx.openSettlement(); ctx.settleAmount(0); ctx.settleTarget(f.id) }}
                    >
                      <div className="w-10 h-10 mx-auto bg-indigo-600 bg-opacity-50 rounded-full flex items-center justify-center mb-1 text-white">
                        {f.icon}
                      </div>
                      <div>{f.name}</div>
                      <div className="text-sm text-indigo-200">{f.points} pt</div>
                    </Button>
                  ))}
                </div>
              )
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-white">相手: {ctx.targetFriend!.name}</span>
                  <span className="text-indigo-200">上限: {ctx.maxTransfer} pt</span>
                </div>
                <input
                  type="number" min={1} max={ctx.maxTransfer} step={1}
                  className={s.inputBase}
                  placeholder={`1〜${ctx.maxTransfer}`}
                  onChange={e => {
                    let v = Number(e.target.value)
                    if (v<1) v=1; if (v>ctx.maxTransfer) v=ctx.maxTransfer
                    ctx.settleAmount(v)
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={ctx.requestSettlement}
                  disabled={ctx.settleAmount<1||ctx.settleAmount>ctx.maxTransfer}
                  className="w-full"
                >
                  {ctx.targetFriend!.name} に {ctx.settleAmount} pt 払依頼
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 承認待ち */}
      {ctx.stage === 'settleNotify' && ctx.settleTarget != null && (
        <div className={s.modalOverlay}>
          <div className={s.panel + ' space-y-4'}>
            <h2 className="text-2xl font-bold text-white text-center">精算の承認待ち</h2>
            <p className="text-indigo-200 text-center">
              {ctx.targetFriend!.name} さん、{ctx.settleAmount} pt を承認しますか？
            </p>
            <Button
              variant="primary"
              onClick={ctx.confirmSettlement}
              disabled={ctx.settleConfirmed}
              className="w-full"
            >
              {ctx.settleConfirmed ? '承認済み' : '承認する'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
