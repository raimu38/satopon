'use client'
import React, { ButtonHTMLAttributes } from 'react'
import { btnPrimary, btnSecondary, btnTertiary } from '../styles'

type Variant = 'primary' | 'secondary' | 'tertiary'

const mapClass: Record<Variant, string> = {
  primary: btnPrimary,
  secondary: btnSecondary,
  tertiary: btnTertiary,
}

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
) {
  const { variant = 'primary', className = '', ...rest } = props
  return (
    <button
      className={`${mapClass[variant]} ${className}`.trim()}
      {...rest}
    />
  )
}
