import { useState, useEffect, useRef } from 'react'

export type Friend = {
  id: number
  name: string
  icon: string
  points: number
  registered: boolean
}

export type History = {
  id: number
  start: Date
  duration: number
  deltas: Record<number, number>
}

export function useGameCycle() {
  const initialFriends: Friend[] = [
    { id: 1, name: 'A', icon: 'A', points: 10, registered: false },
    { id: 2, name: 'B', icon: 'B', points: -20, registered: false },
    { id: 3, name: 'C', icon: 'C', points: 5, registered: false },
    { id: 4, name: 'D', icon: 'D', points: 0, registered: false },
  ]

  const [friends, setFriends] = useState<Friend[]>(initialFriends)
  const [stage, setStage] = useState<
    'lobby' | 'notify' | 'timer' | 'input' | 'approve' | 'settlement' | 'settleNotify'
  >('lobby')
  const [invitedIds, setInvitedIds] = useState<number[]>([])
  const [confirmedIds, setConfirmedIds] = useState<number[]>([])
  const [seconds, setSeconds] = useState(0)
  const [deltas, setDeltas] = useState<Record<number, number>>({})
  const [history, setHistory] = useState<History[]>([])
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [settleTarget, setSettleTarget] = useState<number | null>(null)
  const [settleAmount, setSettleAmount] = useState(0)
  const [settleConfirmed, setSettleConfirmed] = useState(false)
  const [detailTarget, setDetailTarget] = useState<number | null>(null)
  const timerRef = useRef<NodeJS.Timer>()

  const me = friends.find(f => f.name === 'B')!

  // タイマー制御
  useEffect(() => {
    if (stage === 'timer') {
      setSeconds(0)
      setStartTime(new Date())
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current!)
    }
    return () => clearInterval(timerRef.current!)
  }, [stage])

  // ゲームフロー操作
  const toggleRegister = (id: number) =>
    setFriends(fs => fs.map(f => f.id === id ? { ...f, registered: !f.registered } : f))

  const startGame = () => {
    const regs = friends.filter(f => f.registered).map(f => f.id)
    if (regs.length < 2) return
    setInvitedIds(regs); setConfirmedIds([]); setStage('notify')
  }

  const confirmParticipation = (id: number) =>
    setConfirmedIds(cs => cs.includes(id) ? cs : [...cs, id])

  const rejectParticipation = () => {
    setFriends(fs => fs.map(f => ({ ...f, registered: false })))
    setInvitedIds([]); setStage('lobby')
  }

  const proceedToTimer = () =>
    confirmedIds.length === invitedIds.length && setStage('timer')

  const stopGame = () => setStage('input')

  const handleDelta = (id: number, val: number) =>
    setDeltas(ds => ({ ...ds, [id]: val }))

  const submitInput = () => {
    const sum = invitedIds.reduce((acc, id) => acc + (deltas[id] || 0), 0)
    if (sum !== 0) { alert('合計が0になるように±5単位で入力してください'); return }
    setStage('approve')
  }

  const confirmApprove = () => {
    if (startTime) {
      setHistory(hs => [{
        id: Date.now(),
        start: startTime,
        duration: seconds,
        deltas: { ...deltas }
      }, ...hs])
    }
    setFriends(fs => fs.map(f =>
      invitedIds.includes(f.id)
        ? { ...f, points: f.points + (deltas[f.id] || 0), registered: false }
        : { ...f, registered: false }
    ))
    setInvitedIds([]); setDeltas({}); setConfirmedIds([]); setStage('lobby')
  }

  // 精算フロー
  const openSettlement = () => {
    setSettleTarget(null); setSettleAmount(0); setSettleConfirmed(false); setStage('settlement')
  }

  const requestSettlement = () => {
    if (settleTarget != null) setStage('settleNotify')
  }

  const confirmSettlement = () => {
    setFriends(fs => fs.map(f => {
      if (f.id === settleTarget) return { ...f, points: f.points - settleAmount }
      if (f.name === 'B')      return { ...f, points: f.points + settleAmount }
      return f
    }))
    setSettleConfirmed(true); setTimeout(() => setStage('lobby'), 800)
  }

  // 詳細モーダル
  const openDetail = (id: number) => setDetailTarget(id)
  const closeDetail = () => setDetailTarget(null)
  const exitFriend = (id: number) => {
    const f = friends.find(x => x.id === id)!
    if (f.points === 0) { setFriends(fs => fs.filter(x => x.id !== id)); closeDetail() }
    else alert('ポイントが0のときのみ退出できます')
  }

  const canBack = stage === 'notify' || stage === 'settlement'
  const back = () => setStage('lobby')

  // 精算対象と上限
  const eligible = friends.filter(f => f.id !== me.id && f.points > 0 && me.points < 0)
  const targetFriend = settleTarget != null
    ? friends.find(f => f.id === settleTarget) ?? null
    : null
  const maxTransfer = targetFriend != null
    ? Math.min(Math.abs(me.points), targetFriend.points)
    : 0

  return {
    friends, stage, invitedIds, confirmedIds,
    seconds, deltas, history,
    settleTarget, settleAmount, settleConfirmed,
    detailTarget, me, eligible, targetFriend, maxTransfer,
    toggleRegister, startGame, confirmParticipation,
    rejectParticipation, proceedToTimer, stopGame,
    handleDelta, submitInput, confirmApprove,
    openSettlement, requestSettlement, confirmSettlement,
    openDetail, closeDetail, exitFriend,
    canBack, back,
  }
}
