import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SettingsModal, { resolveSettingsTab } from '../SettingsModal'
import { renderWithProviders, screen } from '../../../test/render'

vi.mock('../GeneralSettings', () => ({ default: () => <div data-testid="general-tab" /> }))
vi.mock('../ProviderManager', () => ({ default: () => <div data-testid="providers-tab" /> }))
vi.mock('../ThemeTab', () => ({ default: () => <div data-testid="theme-tab" /> }))
vi.mock('../AppearanceTab', () => ({ default: () => <div data-testid="appearance-tab" /> }))
vi.mock('../FeedbackTab', () => ({ default: () => <div data-testid="feedback-tab" /> }))
vi.mock('../LogsTab', () => ({ default: () => <div data-testid="logs-tab" /> }))

describe('resolveSettingsTab', () => {
  it('keeps valid tabs and falls removed/unknown tabs back to general', () => {
    expect(resolveSettingsTab('general')).toBe('general')
    expect(resolveSettingsTab('theme')).toBe('theme')
    expect(resolveSettingsTab('providers')).toBe('providers')
    expect(resolveSettingsTab('feedback')).toBe('feedback')
    expect(resolveSettingsTab('logs')).toBe('logs')

    expect(resolveSettingsTab('extensions')).toBe('general')
    expect(resolveSettingsTab('skills')).toBe('general')
    expect(resolveSettingsTab('policy')).toBe('general')
    expect(resolveSettingsTab('system')).toBe('general')
    expect(resolveSettingsTab('not-a-tab')).toBe('general')
    expect(resolveSettingsTab(undefined)).toBe('general')
    expect(resolveSettingsTab(null)).toBe('general')
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
    // lucide Bot icon is still used by AI Provider tab — keep that core tab
    fireEvent.click(screen.getByRole('button', { name: 'AI Provider' }))
    expect(await screen.findByTestId('providers-tab')).toBeInTheDocument()
    expect(screen.getByTestId('general-tab')).toBeInTheDocument()
  })

  it('does not expose removed extensions/policy/system settings entries', () => {
    renderWithProviders(<SettingsModal onClose={() => {}} />)

    expect(screen.queryByRole('button', { name: '扩展' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '安全与治理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '系统配置' })).not.toBeInTheDocument()
    expect(screen.queryByText('MCP 服务器与技能管理')).not.toBeInTheDocument()
    expect(screen.queryByText('策略引擎与审计日志')).not.toBeInTheDocument()
    expect(screen.queryByText('底层参数与遥测')).not.toBeInTheDocument()

    // retained settings entries
    expect(screen.getByRole('button', { name: '通用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '主题与外观' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI Provider' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '反馈' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '日志' })).toBeInTheDocument()
  })

  it.each(['extensions', 'skills', 'policy', 'system'] as const)(
    'falls back removed initialTab %s to general content',
    (tab) => {
      renderWithProviders(<SettingsModal onClose={() => {}} initialTab={tab} />)

      expect(screen.getByTestId('general-tab')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '通用' })).toHaveClass('bg-blue-500/15')
    },
  )
})
