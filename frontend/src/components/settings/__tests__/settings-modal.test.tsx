import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SettingsModal, { resolveSettingsTab } from '../SettingsModal'
import { renderWithProviders, screen } from '../../../test/render'

vi.mock('../ProviderManager', () => ({ default: () => <div data-testid="providers-tab" /> }))
vi.mock('../FeedbackTab', () => ({ default: () => <div data-testid="feedback-tab" /> }))
vi.mock('../LogsTab', () => ({ default: () => <div data-testid="logs-tab" /> }))

describe('resolveSettingsTab', () => {
  it('keeps valid tabs and falls removed/unknown tabs back to providers', () => {
    expect(resolveSettingsTab('providers')).toBe('providers')
    expect(resolveSettingsTab('feedback')).toBe('feedback')
    expect(resolveSettingsTab('logs')).toBe('logs')

    expect(resolveSettingsTab('general')).toBe('providers')
    expect(resolveSettingsTab('theme')).toBe('providers')
    expect(resolveSettingsTab('workspace')).toBe('providers')
    expect(resolveSettingsTab('extensions')).toBe('providers')
    expect(resolveSettingsTab('skills')).toBe('providers')
    expect(resolveSettingsTab('policy')).toBe('providers')
    expect(resolveSettingsTab('system')).toBe('providers')
    expect(resolveSettingsTab('account')).toBe('providers')
    expect(resolveSettingsTab('queue')).toBe('providers')
    expect(resolveSettingsTab('not-a-tab')).toBe('providers')
    expect(resolveSettingsTab(undefined)).toBe('providers')
    expect(resolveSettingsTab(null)).toBe('providers')
  })
})

describe('Settings modal', () => {
  it('renders unified settings center and switches tabs', async () => {
    const onClose = vi.fn()

    renderWithProviders(<SettingsModal onClose={onClose} />)

    expect(screen.getByTestId('settings-modal')).toBeInTheDocument()
    expect(screen.getByText('设置')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bot 管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Telegram 机器人' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'QQ 机器人' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'QQ 官方机器人' })).not.toBeInTheDocument()
    // default tab is AI Provider
    expect(await screen.findByTestId('providers-tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '反馈' }))
    expect(await screen.findByTestId('feedback-tab')).toBeInTheDocument()
  })

  it('does not expose removed settings entries', () => {
    renderWithProviders(<SettingsModal onClose={() => {}} />)

    expect(screen.queryByRole('button', { name: '扩展' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '安全与治理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '系统配置' })).not.toBeInTheDocument()
    expect(screen.queryByText('MCP 服务器与技能管理')).not.toBeInTheDocument()
    expect(screen.queryByText('策略引擎与审计日志')).not.toBeInTheDocument()
    expect(screen.queryByText('底层参数与遥测')).not.toBeInTheDocument()

    // removed settings entries
    expect(screen.queryByRole('button', { name: '通用' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '主题与外观' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '工作区' })).not.toBeInTheDocument()

    // retained settings entries
    expect(screen.getByRole('button', { name: 'AI Provider' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '反馈' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '日志' })).toBeInTheDocument()
  })

  it.each(['extensions', 'skills', 'policy', 'system', 'general', 'theme', 'workspace'] as const)(
    'falls back removed initialTab %s to providers content',
    (tab) => {
      renderWithProviders(<SettingsModal onClose={() => {}} initialTab={tab} />)

      expect(screen.getByTestId('providers-tab')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'AI Provider' })).toHaveClass('bg-blue-500/15')
    },
  )
})
