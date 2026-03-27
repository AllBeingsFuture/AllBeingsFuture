# AllBeingsFuture 测试规则

## 测试框架

- **框架**: Vitest 3.0 + JSDOM
- **断言库**: @testing-library/jest-dom
- **渲染工具**: @testing-library/react
- **配置文件**: `frontend/vitest.config.ts`

## 目录结构

```
frontend/src/
├── test/
│   ├── setup.ts           # DOM polyfills (matchMedia, ResizeObserver, scrollIntoView)
│   └── render.tsx         # 自定义 render wrapper（注入 providers）
├── components/
│   └── <module>/__tests__/
│       └── <component>.test.tsx
└── hooks/__tests__/
    └── <hook>.test.ts
```

## 运行测试

```bash
cd frontend
npm test              # 单次运行所有测试
npm run test:watch    # 监听模式
npx vitest run <path> # 运行指定文件
```

## 测试编写规范

### 文件命名与位置

- 测试文件放在被测模块同级的 `__tests__/` 目录下
- 文件名格式：`<component-name>.test.tsx` 或 `<hook-name>.test.ts`
- 例如：`components/conversation/__tests__/message-input.test.tsx`

### 使用自定义 render

使用 `frontend/src/test/render.tsx` 提供的自定义 `render` 函数，它会自动注入必要的 providers：

```typescript
import { render } from '../../test/render'
import { MyComponent } from '../MyComponent'

test('should render correctly', () => {
  const { getByText } = render(<MyComponent />)
  expect(getByText('hello')).toBeInTheDocument()
})
```

### 测试重点

1. **组件渲染测试** — 确认组件正常渲染，无崩溃
2. **用户交互测试** — 使用 `@testing-library/react` 的 `fireEvent` / `userEvent` 模拟交互
3. **Store 集成测试** — 测试 Zustand store 状态变化对组件的影响
4. **Hook 测试** — 使用 `renderHook` 测试自定义 hooks

### Mock 策略

- **Electron IPC**: mock `window.electron.invoke` 和 `window.electron.on`
- **Zustand stores**: 可以直接 `import` store 并在测试中 `setState`
- **Monaco Editor**: 需要 mock，JSDOM 不支持完整 Monaco
- **xterm.js**: 需要 mock canvas 相关 API

### 需要注意的 DOM Polyfill

`test/setup.ts` 已注入以下 polyfill，测试中可直接使用：

- `window.matchMedia`
- `ResizeObserver`
- `Element.scrollIntoView`

如果测试中遇到 "xxx is not defined" 类的错误，先检查是否需要在 `setup.ts` 中添加 polyfill。

## 什么时候必须写测试

1. **新增 UI 组件** — 至少写渲染测试，确认不会 crash
2. **修改核心交互逻辑** — 消息发送、会话切换、文件操作等用户关键路径
3. **新增/修改自定义 Hook** — Hook 逻辑应有独立测试
4. **Bug 修复** — 为修复的 bug 补回归测试，防止再次出现

## 什么不需要测试

- 纯样式/布局组件（无逻辑）
- Electron 主进程代码（当前无 Electron 端测试框架，用手动验证）
- 第三方库的封装（只测自己的逻辑）

## 测试质量要求

- 测试应该测行为，不要测实现细节
- 避免 snapshot 测试（维护成本高、容易被无脑更新）
- 不要在测试中 hardcode 时间戳或随机值，使用 mock
- 每个 `test()` 只测一个行为，命名要清晰说明在测什么
