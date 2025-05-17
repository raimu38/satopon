'use client'
import React from 'react'
import { modalBase, panel } from '../styles'

export function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className={modalBase}>
      <div className={panel}>{children}</div>
    </div>
  )
}

