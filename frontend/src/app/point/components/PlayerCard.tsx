'use client'
import React from 'react'
import { cardBase } from '../styles'
import { Friend } from '../hooks/useGameCycle'

export function PlayerCard({
  friend,
  onToggle,
  onDetail
}: {
  friend: Friend
  onToggle: (id: number) => void
  onDetail: (id: number) => void
}) {
  return (
    <div
      onClick={() => onToggle(friend.id)}
      className={`${cardBase} p-4 rounded-2xl cursor-pointer transition ${
        friend.registered
          ? 'bg-gradient-to-tr from-blue-500 to-indigo-600 text-white'
          : 'bg-indigo-900 bg-opacity-30 text-indigo-200 hover:bg-opacity-40'
      }`}
    >
      <div
        onClick={e => { e.stopPropagation(); onDetail(friend.id) }}
        className="w-12 h-12 bg-indigo-600 bg-opacity-50 rounded-full flex items-center justify-center mb-2 text-white"
      >
        {friend.icon}
      </div>
      <div className="font-medium">{friend.name}</div>
      <div className="text-sm mt-1">{friend.points} pt</div>
    </div>
  )
}

