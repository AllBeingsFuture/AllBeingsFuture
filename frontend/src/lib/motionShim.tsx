/**
 * Lightweight stand-in for framer-motion.
 * Strips animation props and renders plain DOM — business logic unchanged.
 */
import React, { forwardRef } from 'react'

type MotionExtra = Record<string, unknown>

const STRIP_KEYS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileInView',
  'layout',
  'layoutId',
  'drag',
  'dragConstraints',
  'dragElastic',
  'onAnimationComplete',
  'onAnimationStart',
  'custom',
])

function stripMotionProps(props: MotionExtra): MotionExtra {
  const next: MotionExtra = {}
  for (const [key, value] of Object.entries(props)) {
    if (!STRIP_KEYS.has(key)) next[key] = value
  }
  return next
}

function makeMotionTag(tag: keyof React.JSX.IntrinsicElements) {
  const Comp = forwardRef<Element, MotionExtra>(function MotionTag(props, ref) {
    return React.createElement(tag, { ...stripMotionProps(props), ref })
  })
  Comp.displayName = `motion.${String(tag)}`
  return Comp
}

export const motion = {
  div: makeMotionTag('div'),
  span: makeMotionTag('span'),
  img: makeMotionTag('img'),
  button: makeMotionTag('button'),
  section: makeMotionTag('section'),
  p: makeMotionTag('p'),
  a: makeMotionTag('a'),
  li: makeMotionTag('li'),
  ul: makeMotionTag('ul'),
}

type AnimatePresenceProps = {
  children?: React.ReactNode
  mode?: string
  initial?: boolean
  onExitComplete?: () => void
  custom?: unknown
}

/** Instant mount/unmount — exit animations are no-ops (non-functional chrome). */
export function AnimatePresence({ children }: AnimatePresenceProps) {
  return <>{children}</>
}

export default { motion, AnimatePresence }
