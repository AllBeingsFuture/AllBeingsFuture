/**
 * AI 提供商列表缓存管理 Hook
 *
 * 全局缓存 Provider 列表，避免重复请求。
 * 第一个调用者触发加载，后续组件直接用缓存。
 */

import { useEffect, useState } from 'react'
import type { AIProvider } from '../types/models'

let cachedProviders: AIProvider[] | null = null
let loadProvidersPromise: Promise<AIProvider[]> | null = null

function loadProviders(): Promise<AIProvider[]> {
  if (!loadProvidersPromise) {
    loadProvidersPromise = window.allBeingsFuture.provider.getAll()
      .then((providerList) => {
        cachedProviders = (providerList as AIProvider[]) || []
        return cachedProviders
      })
      .catch(() => {
        loadProvidersPromise = null
        return cachedProviders || []
      })
  }

  return loadProvidersPromise
}

export function useProviders(): AIProvider[] {
  const [providers, setProviders] = useState<AIProvider[]>(cachedProviders || [])

  useEffect(() => {
    let cancelled = false

    loadProviders().then((providerList) => {
      if (!cancelled) {
        setProviders(providerList)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return providers
}
