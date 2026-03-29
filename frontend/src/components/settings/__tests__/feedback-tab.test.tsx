import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedbackTab from '../FeedbackTab'
import { renderWithProviders, screen } from '../../../test/render'

const openExternalMock = vi.fn()
const getSettingMock = vi.fn()
const updateSettingMock = vi.fn()
const submitGithubIssueMock = vi.fn()

vi.mock('../../../../bindings/electron-api', () => ({
  AppAPI: {
    openExternal: (...args: unknown[]) => openExternalMock(...args),
  },
  FeedbackAPI: {
    submitGithubIssue: (...args: unknown[]) => submitGithubIssueMock(...args),
  },
}))

vi.mock('../../../../bindings/allbeingsfuture/internal/services', () => ({
  SystemSettingsService: {
    Get: (...args: unknown[]) => getSettingMock(...args),
    Update: (...args: unknown[]) => updateSettingMock(...args),
  },
}))

describe('FeedbackTab', () => {
  beforeEach(() => {
    openExternalMock.mockReset()
    getSettingMock.mockReset()
    updateSettingMock.mockReset()
    submitGithubIssueMock.mockReset()

    getSettingMock.mockResolvedValue('ghp_test_token')
    updateSettingMock.mockResolvedValue(undefined)
    submitGithubIssueMock.mockResolvedValue({
      number: 321,
      url: 'https://github.com/AllBeingsFuture/AllBeingsFuture/issues/321',
      title: '[Bug 报告] test',
    })
  })

  it('uses direct submit without opening the browser when token is configured', async () => {
    renderWithProviders(<FeedbackTab />)

    const descriptionInput = await screen.findByPlaceholderText('请描述你遇到的问题或建议...')
    fireEvent.change(descriptionInput, { target: { value: '直接提交测试内容' } })

    fireEvent.click(screen.getByRole('button', { name: '直接提交到 GitHub' }))

    await waitFor(() => {
      expect(updateSettingMock).toHaveBeenCalledWith('feedback.githubToken', 'ghp_test_token')
      expect(submitGithubIssueMock).toHaveBeenCalledTimes(1)
    })

    expect(submitGithubIssueMock).toHaveBeenCalledWith({
      owner: 'AllBeingsFuture',
      repo: 'AllBeingsFuture',
      token: 'ghp_test_token',
      title: '[Bug 报告] 直接提交测试内容',
      body: expect.stringContaining('直接提交测试内容'),
    })
    expect(openExternalMock).not.toHaveBeenCalled()
    expect(await screen.findByText('已直接创建 GitHub Issue #321')).toBeInTheDocument()
  })

  it('falls back to browser submission only when user clicks the browser button', async () => {
    renderWithProviders(<FeedbackTab />)

    fireEvent.click(await screen.findByRole('button', { name: '浏览器提交' }))

    await waitFor(() => {
      expect(openExternalMock).toHaveBeenCalledTimes(1)
    })
    expect(submitGithubIssueMock).not.toHaveBeenCalled()
  })
})
