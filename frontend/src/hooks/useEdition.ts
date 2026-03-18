/**
 * 版本 / Pro 权限相关 hooks
 *
 * 适配 allbeingsfuture 的 authStore 结构。
 * allbeingsfuture 的 authStore 使用 authState 而非 user 对象。
 */

import { useAuthStore } from '../stores/authStore'

/**
 * 当前用户是否拥有 Pro 权限（响应式）。
 * 登录状态变化时自动重新计算。
 */
export function useIsPro(): boolean {
  const authState = useAuthStore((state) => state.authState)
  return isPro(authState?.plan)
}

/**
 * 当前用户是否处于未登录状态（响应式）。
 */
export function useIsAnonymous(): boolean {
  const authState = useAuthStore((state) => state.authState)
  return isAnonymous(authState?.plan)
}

function isPro(plan?: string): boolean {
  if (!plan) return false
  return plan === 'pro' || plan === 'enterprise' || plan === 'team'
}

function isAnonymous(plan?: string): boolean {
  return !plan || plan === 'anonymous' || plan === 'free'
}
