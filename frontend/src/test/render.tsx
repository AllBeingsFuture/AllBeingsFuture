import { render } from '@testing-library/react'
import type { PropsWithChildren, ReactElement } from 'react'

function Providers({ children }: PropsWithChildren) {
  return children
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, {
    wrapper: Providers,
  })
}

export * from '@testing-library/react'
