'use client'

import React, { useState, useEffect, useRef } from 'react'

      type Friend = {
  id: number
  name: string
  icon: string
  points: number
  registered: boolean
}

type History = {
  id: number
  start: Date
  duration: number
  deltas: Record<number, number>
}

export default function GameCycle() {
const initialFriends: Friend[] = [
  { id: 1, name: 'ゆうと', icon: 'A', points: 10, registered: false },
  { id: 2, name: 'らいむ', icon: 'B', points: -20, registered: false }, // 自分
  { id: 3, name: 'そうた', icon: 'C', points: 5, registered: false },
  { id: 4, name: 'りく', icon: 'D', points: 0, registered: false },
  { id: 5, name: 'あおい', icon: 'E', points: 8, registered: false },
  { id: 6, name: 'みゆ', icon: 'F', points: -5, registered: false },
  { id: 7, name: 'こうき', icon: 'G', points: 3, registered: false },
  { id: 8, name: 'さき', icon: 'H', points: 0, registered: false },
  { id: 9, name: 'はると', icon: 'I', points: -10, registered: false },
  { id: 10, name: 'ゆい', icon: 'J', points: 6, registered: false },
]
// --- state ---
  const [friends, setFriends] = useState<Friend[]>(initialFriends)
  const [stage, setStage] = useState<
    'lobby' | 'notify' | 'timer' | 'input' | 'approve' | 'settlement' | 'settleNotify'
  >('lobby')
  const [invitedIds, setInvitedIds] = useState<number[]>([])
  const [confirmedIds, setConfirmedIds] = useState<number[]>([])
  const [seconds, setSeconds] = useState(0)
  const [deltas, setDeltas] = useState<Record<number, number>>({})
  const [inputError, setInputError] = useState('') 
  const [history, setHistory] = useState<History[]>([])
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [settleTarget, setSettleTarget] = useState<number | null>(null)
  const [settleAmount, setSettleAmount] = useState<number>(0)
  const [settleConfirmed, setSettleConfirmed] = useState(false)
  const [detailTarget, setDetailTarget] = useState<number | null>(null)
  const timerRef = useRef<number | null>(null)
const [isAddModalOpen, setIsAddModalOpen] = useState(false)
const [nameError, setNameError] = useState('')
const [newFriendName, setNewFriendName] = useState('')

const [isHistoryOpen, setIsHistoryOpen] = useState(false)
const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false)


  // 自分 (B)
  const me = friends.find(f => f.id === 2)!
const [chatInput, setChatInput] = useState<string>('')  
const [chatMessages, setChatMessages] = useState<
  { id: number; text: string; time: string }[]
>([])
  useEffect(() => {
  // ページ読み込み時にスクロールを抑制
  document.body.style.overscrollBehavior = 'none'
  document.body.style.overflow = 'hidden'

  // アンマウント時に元に戻す
  return () => {
    document.body.style.overscrollBehavior = ''
    document.body.style.overflow = ''
  }
}, [])
useEffect(() => {
    if (stage === 'timer') {
      setSeconds(0)
      setStartTime(new Date())
      timerRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current!)
    }
    return () => clearInterval(timerRef.current!)
  }, [stage])

  // ゲームフロー
  const toggleRegister = (id: number) =>
    setFriends(f => f.map(x =>
      x.id === id ? { ...x, registered: !x.registered } : x
    ))

  const startGame = () => {
    const regs = friends.filter(f => f.registered).map(f => f.id)
    if (regs.length < 2) return
    setInvitedIds(regs)
    setConfirmedIds([])
    setStage('notify')
  }
  const confirmParticipation = (id: number) =>
    setConfirmedIds(c => c.includes(id) ? c : [...c, id])
  const rejectParticipation = () => {
    setFriends(f => f.map(x => ({ ...x, registered: false })))
    setInvitedIds([])
    setStage('lobby')
  }
  const proceedToTimer = () =>
    confirmedIds.length === invitedIds.length && setStage('timer')

const stopGame = () => {
  // invitedIds の全員分を 0 で埋めた deltas をセット
  const initialDeltas: Record<number, number> = {}
  invitedIds.forEach(id => {
    initialDeltas[id] = 0
  })
  setDeltas(initialDeltas)

  setStage('input')
}
  const handleDelta = (id: number, val: number) =>
    setDeltas(d => ({ ...d, [id]: val }))
const submitInput = () => {
    // 空白は undefined → 0 として扱う
    const sum = invitedIds.reduce((a, id) => a + (deltas[id] || 0), 0)
    if (sum !== 0) {
      setInputError('合計が0になっていません 不正行為のおそれあり')
      return
    }
    setInputError('')   // エラークリア
    setStage('approve')
  }
  const confirmApprove = () => {
    if (startTime) {
      setHistory(h => [{
        id: Date.now(),
        start: startTime,
        duration: seconds,
        deltas: { ...deltas }
      }, ...h])
    }
    setFriends(f => f.map(x =>
      invitedIds.includes(x.id)
        ? { ...x, points: x.points + (deltas[x.id] || 0), registered: false }
        : { ...x, registered: false }
    ))
    setInvitedIds([])
    setDeltas({})
    setConfirmedIds([])
    setStage('lobby')
  }

  // 精算フロー
  const openSettlement = () => {
    setSettleTarget(null)
    setSettleAmount(0)
    setSettleConfirmed(false)
    setStage('settlement')
  }
  const requestSettlement = () => {
    if (settleTarget != null) setStage('settleNotify')
  }
  const confirmSettlement = () => {
    setFriends(f => f.map(x => {
      if (x.id === settleTarget) {
        return { ...x, points: x.points - settleAmount }
      }
      if (x.id === me.id) {
        return { ...x, points: x.points + settleAmount }
      }
      return x
    }))
    setSettleConfirmed(true)
    setTimeout(() => setStage('lobby'), 800)
  }
  // ===== 詳細モーダル =====
  const openDetail = (id: number) => setDetailTarget(id)
  const closeDetail = () => setDetailTarget(null)
  const exitFriend = (id: number) => {
    const f = friends.find(x => x.id === id)!
    if (f.points === 0) {
      setFriends(fs => fs.filter(x => x.id !== id))
      closeDetail()
    } else {
      alert('ポイントが0のときのみ退出できます')
    }
  }

  // 戻るボタン表示条件
  const canBack = stage === 'notify' || stage === 'settlement'
  const back = () => setStage('lobby')

  // 精算対象のリスト（自分が負で、相手が正のユーザー）
  const eligible = friends.filter(f =>
    f.id !== me.id && f.points > 0 && me.points < 0
  )
  // 最大送金可能額
  // 精算対象の友達と最大送金可能額をまとめて取得
 const targetFriend = settleTarget != null
    ? friends.find(f => f.id === settleTarget) ?? null
    : null
  const maxTransfer = targetFriend != null
    ? Math.min(Math.abs(me.points), targetFriend.points)
    : 0


  return (
    <div className="">
      {/* 戻るボタン */}
      {canBack && (
        <button
          onClick={back}
          className="absolute top-4 left-4 px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
         Back 
        </button>
      )}

      {/* ロビー */}
{stage === 'lobby' && (
  <div className="
    w-full min-h-screen
    flex flex-col items-center pt-8 pb-6
    bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
    overflow-auto
  ">
{/* アプリ名表示 */}
<a
  href="https://sites.google.com/view/jsato/"
  target="_blank"
  rel="noopener noreferrer"
  className="absolute top-2 left-2 text-white font-bold px-2 py-1"
>
  satopon
</a>

{/* 操作パネル */}
<div className=" w-full max-w-2xl px-6 mb-2 pt-1 flex items-center justify-between">
  <button
    onClick={() => setIsHistoryOpen(true)}
      className="px-4 py-2  text-white font-semibold rounded-full hover:from-blue-600 hover:to-indigo-700 transition"
  >
:::
  </button>
  <div className="flex space-x-2">
    <button
      onClick={openSettlement}
      className="px-4 py-2 bg-gradient-to-tr from-blue-500 to-indigo-600 text-white font-semibold rounded-full hover:from-blue-600 hover:to-indigo-700 transition"
    >
      Sato
    </button>
    <button
      onClick={() => { setNewFriendName(''); setNameError(''); setIsAddModalOpen(true) }}
      className="px-4 py-2 bg-gradient-to-tr from-green-400 to-green-600 text-white font-semibold rounded-full hover:from-green-500 hover:to-green-700 transition"
    >
      {/* 新規追加 */}
      +
    </button>
  </div>
</div>
 {isAddModalOpen && (
    <div className="fixed inset-0 flex items-center justify-center z-1 bg-translate">
      {/* 背景ブラー＆暗転 */}
      <div className="absolute inset-0 backdrop-blur-md" />

{/* モーダル本体内 */}
<div className="relative w-full max-w-sm bg-gray-800 g-opacity-90 rounded-2xl p-6 shadow-lg">
  <h3 className="text-white text-lg font-bold text-center">Create</h3>
  <input
    type="text"
    value={newFriendName}
    onChange={e => {
      setNewFriendName(e.target.value)
      setNameError('')
    }}
    placeholder="Name"
    className="w-full px-4 py-2 mt-4 bg-gray-700 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
  />
  {/* エラー表示用固定スペース */}
  <div className="h-5 mt-1">
    <p className={`text-sm text-red-500 ${nameError ? '' : 'invisible'}`}>
      {nameError || '　'}
    </p>
  </div>

  <div className="flex justify-end space-x-2 pt-4">
    <button
      onClick={() => setIsAddModalOpen(false)}
      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
    >
     ×  
    </button>
    <button
      onClick={() => {
        const name = newFriendName.trim()
        if (!name) {
          setNameError('Please input name')
          return
        }
        if (friends.some(f => f.name === name)) {
          setNameError('This name is already in use')
          return
        }
        const id = Date.now()
        setFriends(f => [
          ...f,
          { id, name, icon: name[0].toUpperCase(), points: 0, registered: false }
        ])
        setIsAddModalOpen(false)
      }}
      className="px-4 py-2 bg-gradient-to-tr from-green-500 to-green-700 text-white rounded hover:from-green-600 hover:to-green-800"
    >
      + 
    </button>
  </div>
</div>
    </div>
  )}

    {/* プレイヤー一覧 */}
 <div className="
     w-full max-w-2xl
     backdrop-blur-sm
     rounded-2xl p-4
     grid grid-cols-3 md:grid-cols-4 gap-4
     max-h-[calc(3*9rem)]    /* 1行あたり5remと想定 */
    overflow-y-auto        /* 3行を超えたらスクロール */
    no-scrollbar
   ">
      {friends.map(f => (
        <div
          key={f.id}
          onClick={() => toggleRegister(f.id)}
          className={`
            flex flex-col items-center justify-center
            p-4
            rounded-2xl
            cursor-pointer transition
            ${f.registered
              ? 'bg-gradient-to-tr from-blue-500 to-indigo-600 text-white'
              : 'bg-indigo-900 bg-opacity-30 text-indigo-200 hover:bg-opacity-40'}
          `}
        >
          <div
            onClick={e => { e.stopPropagation(); openDetail(f.id) }}
            className="
              w-12 h-12
              bg-indigo-600 bg-opacity-50
              rounded-full
              flex items-center justify-center
              mb-2 text-white
            "
          >
            {f.points}
          </div>
          <span className="font-medium">{f.name}</span>
        </div>
      ))}
    </div>

    {/* ゲームスタート */}
    <button
      onClick={startGame}
      disabled={friends.filter(f => f.registered).length < 2}
      className="
        mt-6 w-[90%] max-w-md py-3
        bg-gradient-to-tr from-green-400 to-green-600
        text-white font-semibold
        rounded-full
        hover:from-green-500 hover:to-green-700
        disabled:opacity-50 disabled:cursor-not-allowed
        transition
      "
    >
      Ready: {friends.filter(f => f.registered).length}
    </button>

    {/* 詳細モーダル */}
    {detailTarget != null && (
      <div className="
        fixed inset-0
        flex items-center justify-center
        bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
      ">
        <div className="
          relative
          w-full max-w-sm
          backdrop-blur-sm
          rounded-2xl p-6 space-y-4
        ">
          <button
            onClick={closeDetail}
            className="
              absolute top-3 right-3
              p-2
              text-white 
            "
          >
            ✕
          </button>
          {(() => {
            const f = friends.find(x => x.id === detailTarget)!
            return (
              <>
                <div className="text-center">
                  <div className="
                    w-16 h-16
                    bg-indigo-600 bg-opacity-50
                    rounded-full
                    mx-auto flex items-center justify-center
                    text-xl text-white mb-2
                  ">
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white">{f.name}</h3>
                  <p className="text-indigo-200">{f.points} pt</p>
                </div>
                <button
                  onClick={() => exitFriend(f.id)}
                  className="
                    w-full py-3
                    bg-gradient-to-tr from-red-500 to-red-700
                    text-white font-semibold
                    rounded-full
                    hover:from-red-600 hover:to-red-800
                    transition
                  "
                >
                  退出する
                </button>
              </>
            )
          })()}
        </div>
      </div>
    )}

  </div>
)}

      {/* 参加確認 */}
{stage === 'notify' && (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700">
    <div className="w-full max-w-md bg-indigo-900 bg-opacity-20 backdrop-blur-sm rounded-2xl p-6 space-y-6">
      <ul className="space-y-4 max-h-80 overflow-y-auto no-scrollbar">
        {invitedIds.map(id => {
          const f = friends.find(x => x.id === id)!
          const isConfirmed = confirmedIds.includes(id)
          return (
            <li key={id} className="flex justify-between items-center">
              <span className="text-white">{f.name} さん</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => confirmParticipation(id)}
                  disabled={isConfirmed}
                  className={`
                    px-4 py-2 rounded-full font-semibold text-white transition
                    ${isConfirmed
                      ? 'bg-gray-500 cursor-default'
                      : 'bg-gradient-to-tr from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'}
                  `}
                >
                  {isConfirmed ? '✔' : '+'}
                </button>
                <button
                  onClick={rejectParticipation}
                  className="px-4 py-2 bg-indigo-900 bg-opacity-30 text-indigo-200 rounded-full hover:bg-opacity-40 transition"
                >
                 Decline 
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <button
        disabled={confirmedIds.length !== invitedIds.length}
        onClick={proceedToTimer}
        className="w-full py-3 bg-gradient-to-tr from-green-400 to-green-600 text-white font-semibold rounded-full hover:from-green-500 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
      Start
      </button>
    </div>
  </div>
)}

      {/* タイマー */}
{stage === 'timer' && (
<div className="
  w-screen h-screen
  relative flex flex-col items-center pt-12
  bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
  overflow-hidden
">

    {/* タイマー表示 */}

<div className="relative w-24 h-24 mb-5">
  {/* 回転アニメーション用の円弧 */}
  <div className="absolute inset-0 animate-spin-slow rounded-full border-4 border-white border-t-transparent" />

  {/* 中央の秒数（ボタンとして扱う） */}
  <button
    onClick={() => setIsStopConfirmOpen(true)}
    className="absolute inset-0 flex items-center justify-center
               text-4xl text-white font-mono
               focus:outline-none active:scale-95 transition"
  >
    {seconds}
  </button>
</div>

{/* チャット入力欄 */}
<div className="w-[90%] max-w-md flex items-center space-x-2 mb-3">
  <input
    type="text"
    value={chatInput}
    onChange={e => setChatInput(e.target.value)}
    placeholder=".."
    className="
      flex-1 px-4 py-2
      bg-indigo-900 bg-opacity-30
      backdrop-blur-sm
      text-white placeholder-indigo-300
      border border-indigo-700
      rounded-2xl
      focus:outline-none focus:ring-2 focus:ring-indigo-500
    "
  />
<button
  onClick={() => {
    const txt = chatInput.trim()
    const audio = new Audio('/sounds/message_send_2.mp3');
    audio.play()
    if (!txt) return
    const now = new Date()
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setChatMessages(prev => [
      ...prev,
      { id: Date.now(), text: txt, time }
    ])
    setChatInput('')
  }}
className="
  w-10 h-10 flex items-center justify-center
  bg-gradient-to-tr from-blue-500 to-indigo-600
  text-white rounded-full
  transition transform duration-50
  active:bg-red-400 active:shadow-lg active:scale-110
"
>
  {/* intentional empty */}
   
</button>
</div>
    {/* ↓ チャット履歴エリア ↓ */}
<div
  className="
    w-full max-w-md flex-1 overflow-y-auto
    max-h-[400px]
    backdrop-blur-sm rounded-2xl p-4 mb-4 text-white space-y-2
    no-scrollbar
  "
>
  {chatMessages.length === 0 ? (
    <p className="text-indigo-200 text-sm text-center">Therefore,</p>
  ) : (
[...chatMessages].reverse().map(m => (
  <div
    key={m.id}
    className="text-left animate-[slide-in-right_0.3s_ease-out]"
  >
    <div
      className="
        relative
        px-3 py-2
        rounded-none border-b border-gray-700 border-opacity-30
        backdrop-blur-sm text-sm text-gray-200
      "
    >
      <div className="whitespace-pre-wrap break-words pr-12">{m.text}</div>
      <span
        className="
          absolute bottom-2 right-3
          text-xs text-gray-500
        "
      >
        {m.time}
      </span>
    </div>
  </div>
    ))
  )}
</div>
  </div>
)}

      {/* 得点入力 */}
{stage === 'input' && (
  <div className="
    w-screen h-screen
    relative flex flex-col items-center pt-12
    justify-center
    bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
    overflow-hidden
  ">
    <div className="
      space-y-4
      w-full max-w-md
      bg-indigo-900 bg-opacity-20
      backdrop-blur-sm
      rounded-2xl p-6
      mx-auto
    ">
      {invitedIds.map(id => {
        const f = friends.find(x => x.id === id)!
        return (
          <div key={id} className="flex justify-between items-center">
            <span className="text-white">{f.name}</span>
            <input
              type="number"
              step={5}
              placeholder="±5"
              className="
                w-20 px-3 py-2
                bg-indigo-900 bg-opacity-30
                text-white placeholder-indigo-300
                border border-indigo-700
                rounded-2xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500
              "
              onChange={e => {
                handleDelta(id, Number(e.target.value))
                setInputError('')        // ← エラークリア
              }}
            />
          </div>
        )
      })}

      <button
        onClick={submitInput}
        className="
          mt-6 w-full py-3
          bg-gradient-to-tr from-blue-500 to-indigo-600
          text-white font-semibold
          rounded-full
          hover:from-blue-600 hover:to-indigo-700
          transition
        "
      >
        Request Approval 
      </button>

      {/* エラー文言 */}
      {inputError && (
        <p className="text-red-500 text-sm mt-2">
          {inputError}
        </p>
      )}
    </div>
  </div>
)}
{stage === 'approve' && (
  <div className="
    fixed inset-0
    flex items-center justify-center
    bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
  ">
    <div className="
      w-full max-w-md
      bg-indigo-900 bg-opacity-20
      backdrop-blur-sm
      rounded-2xl p-6
      mx-auto space-y-4
    ">
      <ul className="space-y-2 max-h-60 overflow-y-auto no-scrollbar ">
        {Object.entries(deltas).map(([id, d]) => {
          const f = friends.find(x => x.id === +id)!
          return (
            <li key={id} className="flex justify-between">
              <span className="text-white">{f.name}</span>
              <span className={`
                ${d >= 0 ? 'text-blue-400' : 'text-red-400'}
                font-medium
              `}>
                {d >= 0 ? '+' : ''}{d} sato
              </span>
            </li>
          )
        })}
      </ul>
      <button
        onClick={confirmApprove}
        className="
          w-full py-3
          bg-gradient-to-tr from-blue-500 to-indigo-600
          text-white font-semibold
          rounded-full
          hover:from-blue-600 hover:to-indigo-700
          transition
        "
      >
      Confirmed
      </button>
    </div>
  </div>
)}
      {/* 精算モーダル */}
{stage === 'settlement' && (
  <div className="
    fixed inset-0
    flex items-center justify-center
    bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
  ">
    <div className="
      relative
      w-full max-w-md
      bg-indigo-900 bg-opacity-20
      backdrop-blur-sm
      rounded-2xl p-6
      mx-auto space-y-4
    ">
      {/* 戻るボタン */}
      <button
        onClick={() => setStage('lobby')}
        className="
          absolute top-3 left-3
          p-2
          bg-indigo-600 bg-opacity-50
          text-white
          rounded-md
          hover:bg-opacity-75
          transition
        "
      >
        Back
      </button>

      <h3 className="text-xl font-bold text-white text-center">
       　Satoる 
      </h3>

      {settleTarget == null ? (
        eligible.length === 0 ? (
          <p className="text-indigo-200 text-center">
           no sato required.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {eligible.map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setSettleTarget(f.id)
                  setSettleAmount(0)
                }}
                className="
                  p-3
                  bg-indigo-900 bg-opacity-30
                  text-white
                  rounded-2xl
                  border border-indigo-700
                  hover:bg-opacity-40
                  transition
                "
              >
                <div className="w-10 h-10 mx-auto bg-indigo-600 bg-opacity-50 rounded-full flex items-center justify-center mb-1 text-white">
                  {f.icon}
                </div>
                <div>{f.name}</div>
                <div className="text-sm text-indigo-200">{f.points} sato</div>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex justify-between items-center">
            <span className="text-white">
              To: {friends.find(f => f.id === settleTarget)!.name}
            </span>
            <span className="text-indigo-200">
              max: {maxTransfer} sato 
            </span>
          </div>
          <input
            inputMode="numeric"
            type="number"
            min={1}
            max={maxTransfer}
            step={1}
            value={settleAmount > 0 ? settleAmount : ''}
            onChange={e => {
              const v = Number(e.target.value)
              setSettleAmount(v)
            }}
            placeholder={`1 〜 ${maxTransfer}`}
            className="
              w-full px-3 py-2
              bg-indigo-900 bg-opacity-30
              text-white placeholder-indigo-300
              border border-indigo-700
              rounded-2xl
              focus:outline-none focus:ring-2 focus:ring-indigo-500
              transition
            "
          />
          <button
            onClick={requestSettlement}
            disabled={settleAmount < 1 || settleAmount > maxTransfer}
            className="
              w-full py-3
              bg-gradient-to-tr from-blue-500 to-indigo-600
              text-white font-semibold
              rounded-full
              hover:from-blue-600 hover:to-indigo-700
              disabled:opacity-50
              transition
            "
          >
            {friends.find(f => f.id === settleTarget)!.name} に {settleAmount} Satoる
          </button>
          <button
            onClick={() => setSettleTarget(null)}
            className="w-full text-center text-indigo-300 hover:text-indigo-100 transition"
          >
            ← Other
          </button>
        </>
      )}
    </div>
  </div>
)}

      {/* 承認待ち画面 */}
{stage === 'settleNotify' && settleTarget != null && (
  <div className="
    fixed inset-0
    flex items-center justify-center
    bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700
  ">
    <div className="
      w-full max-w-md
      bg-indigo-900 bg-opacity-20
      backdrop-blur-sm
      rounded-2xl p-6
      mx-auto space-y-4
    ">
      <h2 className="text-2xl font-bold text-white text-center">
        Satoられました
      </h2>
      <p className="text-indigo-200 text-center">
        {friends.find(f => f.id === settleTarget)!.name} 
        <span className="text-green-400 text-2xl">{settleAmount}</span> sato をSatoりますか？
      </p>
      <button
        onClick={confirmSettlement}
        disabled={settleConfirmed}
        className="
          w-full py-3
          bg-gradient-to-tr from-blue-500 to-indigo-600
          text-white font-semibold
          rounded-full
          hover:from-blue-600 hover:to-indigo-700
          disabled:opacity-50
          transition
        "
      >
        {settleConfirmed ? 'Satoりを確認しました' : 'Satoります'}
      </button>
    </div>
  </div>
)}


{isStopConfirmOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center  backdrop-blur-sm">
  <div className="w-full max-w-sm   p-6 text-center space-y-8">
      <h3 className="text-white text-lg font-bold">
      Finish?
      </h3>
      <div className="flex justify-center space-x-6">
        <button
       onClick={() => {
         setIsStopConfirmOpen(false)
        stopGame()          // これで invitedIds 分の 0 が deltas に入る
       }}
          className="px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition"
        >
         おわろう
        </button>
        <button
          onClick={() => setIsStopConfirmOpen(false)}
          className="px-4 py-2 bg-gray-600 text-white rounded-full hover:bg-gray-500 transition"
        >
         おわらん
        </button>
      </div>
    </div>
  </div>
)}

{/* ── 履歴モーダル ── */}
{isHistoryOpen && (
 <div className="
    fixed inset-0 flex items-center justify-center z-50 
  ">
    <div className="
      w-full  mx-auto
      backdrop-blur-sm
      flex flex-col
      h-[100vh]
    ">
{/* ヘッダー */}
<h2
  onClick={() => setIsHistoryOpen(false)}
  className="text-xl font-bold text-white text-center p-4 border-b border-indigo-800 cursor-pointer"
>
  :::
</h2>


      {/* 履歴リスト部分 */}
      {/* 履歴リスト部分 */}
<div className="flex-1 flex flex-col no-scrollbar items-center overflow-y-auto p-4 space-y-4">
  {history.length === 0 ? (
    <p className="text-indigo-200 text-center">No logs, no memory</p>
  ) : (
    history.map((h, idx) => (
      <div
        key={h.id}
        className={`
          w-full max-w-lg
          bg-gray-900 bg-opacity-30 
          rounded-2xl p-4 backdrop-blur-sm space-y-2
          animate-slide-in-right
        `}
        style={{ animationDelay: `${idx * 100}ms` }}
      >
        <div className="flex justify-between text-sm text-indigo-200">
          <span>{h.start.toLocaleTimeString()}</span>
          <span>Time: {h.duration}s</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(h.deltas).map(([id, d]) => {
            const f = friends.find(x => x.id === +id)!
            return (
              <div key={id} className="flex flex-col items-center">
                <span className="text-sm text-white overflow-hidden whitespace-nowrap max-w-[6rem]">
                  {f.name}
                </span>
                <span className={d > 0 ? 'text-blue-300' : d < 0 ? 'text-red-300' : 'text-indigo-200'}>
                  {d >= 0 ? '+' : ''}{d}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    ))
  )}
</div>

    </div>
  </div>
)}
    </div>
  )
}
