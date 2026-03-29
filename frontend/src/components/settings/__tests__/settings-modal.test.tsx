import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SettingsModal from '../SettingsModal'
import { renderWithProviders, screen } from '../../../test/render'

vi.mock('../GeneralSettings', () => ({ default: () => <div data-testid="general-tab" /> }))
vi.mock('../ProviderManager', () => ({ default: () => <div data-testid="providers-tab" /> }))
vi.mock('../ThemeTab', () => ({ default: () => <div data-testid="theme-tab" /> }))
vi.mock('../AppearanceTab', () => ({ default: () => <div data-testid="appearance-tab" /> }))
vi.mock('../ExtensionsTab', () => ({ default: () => <div data-testid="extensions-tab" /> }))
vi.mock('../FeedbackTab', () => ({ default: () => <div data-testid="feedback-tab" /> }))
vi.mock('../LogsTab', () => ({ default: () => <div data-testid="logs-tab" /> }))

describe('Settings modal', () => {
  it('renders unified settings center and switches tabs', async () => {
    const onClose = vi.fn()

    renderWithProviders(<SettingsModal onClose={onClose} />)

    expect(screen.getByTestId('settings-modal')).toBeInTheDocument()
    expect(screen.getByText('设置')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Telegram 机器人' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'QQ 机器人' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'QQ 官方机器人' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AI Provider' }))
    expect(await screen.findByTestId('providers-tab')).toBeInTheDocument()
  })
})
