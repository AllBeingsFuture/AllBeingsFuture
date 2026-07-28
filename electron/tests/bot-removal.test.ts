/**
 * Guards against reintroducing standalone IM bot integrations.
 * Bot/Telegram/QQ services and IPC channels must stay unloaded.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Compiled output lives under .task/.../tests; resolve back to workspace root.
const compiledDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(compiledDir, '../../..')
const electronRoot = path.join(workspaceRoot, 'electron')

const removedServiceFiles = [
  'services/bot.ts',
  'services/bot-push.ts',
  'services/telegram.ts',
  'services/qqbot.ts',
  'services/qqofficial.ts',
]

const removedFrontendFiles = [
  'frontend/src/components/settings/BotManagementTab.tsx',
  'frontend/src/components/settings/TelegramSettings.tsx',
  'frontend/src/components/settings/QQBotSettings.tsx',
  'frontend/src/components/settings/QQOfficialSettings.tsx',
  'frontend/src/stores/botStore.ts',
  'frontend/src/stores/telegramStore.ts',
  'frontend/src/stores/qqbotStore.ts',
  'frontend/src/stores/qqofficialStore.ts',
  'frontend/bindings/allbeingsfuture/internal/services/botservice.ts',
  'frontend/bindings/allbeingsfuture/internal/services/telegramservice.ts',
  'frontend/bindings/allbeingsfuture/internal/services/qqbotservice.ts',
  'frontend/bindings/allbeingsfuture/internal/services/qqofficialservice.ts',
]

const forbiddenIpcChannels = [
  'BotService.',
  'TelegramService.',
  'QQBotService.',
  'QQOfficialService.',
]

test('standalone IM bot service modules are removed', () => {
  for (const rel of removedServiceFiles) {
    assert.equal(
      existsSync(path.join(electronRoot, rel)),
      false,
      `expected removed service file to be gone: ${rel}`,
    )
  }
})

test('standalone IM bot frontend entry points are removed', () => {
  for (const rel of removedFrontendFiles) {
    assert.equal(
      existsSync(path.join(workspaceRoot, rel)),
      false,
      `expected removed frontend file to be gone: ${rel}`,
    )
  }
})

test('handlers no longer register bot integration IPC channels', async () => {
  const handlersPath = path.join(electronRoot, 'ipc/handlers.ts')
  const source = await readFile(handlersPath, 'utf8')
  for (const channel of forbiddenIpcChannels) {
    assert.equal(
      source.includes(channel),
      false,
      `handlers still reference bot IPC channel prefix: ${channel}`,
    )
  }
  assert.equal(source.includes("from '../services/bot.js'"), false)
  assert.equal(source.includes("from '../services/telegram.js'"), false)
  assert.equal(source.includes('telegramService.start()'), false)
})

test('main process no longer wires bot push notifications', async () => {
  const mainPath = path.join(electronRoot, 'main.ts')
  const source = await readFile(mainPath, 'utf8')
  assert.equal(source.includes('setBotPushService'), false)
  assert.equal(source.includes('botPushService'), false)
})
