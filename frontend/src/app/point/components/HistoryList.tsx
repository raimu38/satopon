'use client'
import React from 'react'
import { cardBase } from '../styles'
import { History, Friend } from '../hooks/useGameCycle'

export function HistoryList({
  history,
  friends
}: {
  history: History[]
  friends: Friend[]
}) {
  if (history.length === 0) {
    return <div className="text-indigo-200 text-center">まだ履歴がありません</div>
  }
  return (
    <>
      {history.map(h => (
        <div key={h.id} className={`${cardBase} bg-opacity-30 space-y-2`}>
          <div className="flex justify-between text-sm text-indigo-200">
            <span>開始: {h.start.toLocaleTimeString()}</span>
            <span>時間: {h.duration}s</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(h.deltas).map(([id, d]) => {
              const f = friends.find(x => x.id === +id)!
              return (
                <div key={id} className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${
                    d>0?'bg-blue-500':d<0?'bg-red-500':'bg-gray-500'}`}>
                    {f.icon}
                  </div>
                  <div className="text-sm text-white">{f.name}</div>
                  <div className={d>0?'text-blue-300':d<0?'text-red-300':'text-indigo-200'}>
                    {d>=0?'+':''}{d}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

