import { render, RenderOptions } from '@testing-library/react'
import { ReactElement, ReactNode } from 'react'

// 自定义render函数（如果需要添加providers）
function AllTheProviders({ children }: { children: ReactNode }) {
  return <>{children}</>
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

// re-export everything
export * from '@testing-library/react'

// override render method
export { customRender as render }
