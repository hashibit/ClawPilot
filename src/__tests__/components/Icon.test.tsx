/**
 * Icon 组件测试
 * 测试 Icon 组件的渲染和样式
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Icon, type IconName } from '../../components/Icon'

describe('Icon', () => {
  describe('基础渲染', () => {
    it('渲染 SVG 元素', () => {
      const { container } = render(<Icon name="menu" />)
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('使用正确的 viewBox', () => {
      const { container } = render(<Icon name="menu" />)
      expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24')
    })

    it('使用正确的默认尺寸 (16px)', () => {
      const { container } = render(<Icon name="menu" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '16')
      expect(svg).toHaveAttribute('height', '16')
    })
  })

  describe('尺寸属性', () => {
    it('支持数字尺寸', () => {
      const { container } = render(<Icon name="menu" size={24} />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '24')
    })

    it('支持字符串尺寸', () => {
      const { container } = render(<Icon name="menu" size="2rem" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '2rem')
      expect(svg).toHaveAttribute('height', '2rem')
    })

    it('width 优先于 size', () => {
      const { container } = render(<Icon name="menu" size={24} width={32} />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '32')
      expect(svg).toHaveAttribute('height', '24')
    })

    it('height 优先于 size', () => {
      const { container } = render(<Icon name="menu" size={24} height={32} />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '32')
    })
  })

  describe('颜色属性', () => {
    it('使用当前颜色填充', () => {
      const { container } = render(<Icon name="menu" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('stroke', 'currentColor')
    })

    it('支持自定义 stroke 颜色', () => {
      const { container } = render(<Icon name="menu" stroke="red" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('stroke', 'red')
    })

    it('支持自定义 fill 颜色', () => {
      const { container } = render(<Icon name="menu" fill="blue" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('fill', 'blue')
    })

    it('默认 fill 为 none', () => {
      const { container } = render(<Icon name="menu" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('fill', 'none')
    })

    it('支持自定义 strokeWidth', () => {
      const { container } = render(<Icon name="menu" strokeWidth={3} />)
      const svg = container.querySelector('svg')
      // React 将 strokeWidth 转换为 stroke-width 属性
      expect(svg?.getAttribute('stroke-width')).toBe('3')
    })
  })

  describe('spin 动画', () => {
    it('spin=false 时不添加动画样式', () => {
      const { container } = render(<Icon name="refresh" spin={false} />)
      const svg = container.querySelector('svg')
      expect(svg?.style.animation).toBeFalsy()
    })

    it('spin=true 时添加旋转动画', () => {
      const { container } = render(<Icon name="loading" spin />)
      const svg = container.querySelector('svg')
      expect(svg?.style.animation).toContain('spin')
      expect(svg?.style.animation).toContain('1s')
      expect(svg?.style.animation).toContain('linear')
      expect(svg?.style.animation).toContain('infinite')
    })
  })

  describe('图标类型', () => {
    const iconNames: IconName[] = [
      // 方向/导航
      'chevron-right',
      'chevron-down',
      'chevron-left',
      'chevron-up',
      'arrow-right',
      'arrow-left',
      'arrow-up',
      'arrow-down',
      'plus',
      'minus',
      'x',
      'check',
      // 功能
      'download',
      'upload',
      'refresh',
      'search',
      'settings',
      'menu',
      'close',
      'edit',
      'trash',
      'copy',
      'external-link',
      // 状态
      'loading',
      'error',
      'warning',
      'info',
      'success',
      // 布局
      'grid',
      'list',
      'chart',
      'users',
      'folder',
      'file',
      // 通信
      'mail',
      'message',
      'phone',
      'link',
      // 媒体
      'image',
      'video',
      'play',
      'pause',
      'volume',
      // 其他
      'bolt',
      'star',
      'heart',
      'bookmark',
      'tag',
      'clock',
      'calendar',
      'bell',
      'home',
      'lock',
      'unlock',
      'key',
      'cloud',
      'database',
    ]

    it.each(iconNames)('渲染 %s 图标', (name) => {
      const { container } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('无障碍功能', () => {
    it('可以通过 aria-label 添加无障碍标签', () => {
      const { container } = render(<Icon name="menu" aria-label="Open menu" />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('aria-label')).toBe('Open menu')
    })
  })

  describe('自定义属性', () => {
    it('传递 className', () => {
      const { container } = render(<Icon name="menu" className="custom-class" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveClass('custom-class')
    })

    it('传递 data-testid', () => {
      const { container } = render(<Icon name="menu" data-testid="test-icon" />)
      const svg = container.querySelector('[data-testid="test-icon"]')
      expect(svg).toBeInTheDocument()
    })

    it('传递 onClick 处理函数', () => {
      const handleClick = vi.fn()
      const { container } = render(<Icon name="menu" onClick={handleClick} />)
      const svg = container.querySelector('svg')
      // 使用 fireEvent 模拟点击
      svg?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('传递 style 属性', () => {
      const { container } = render(<Icon name="menu" style={{ opacity: 0.5 }} />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveStyle('opacity: 0.5')
    })

    it('传递多个 style 属性', () => {
      const { container } = render(
        <Icon name="menu" style={{ opacity: 0.5, transform: 'rotate(45deg)' }} />
      )
      const svg = container.querySelector('svg')
      expect(svg).toHaveStyle('opacity: 0.5')
      expect(svg).toHaveStyle('transform: rotate(45deg)')
    })
  })

  describe('IconProps 类型', () => {
    it('IconName 类型包含所有支持的图标', () => {
      // 验证类型定义包含预期的图标名称
      const menuIcon: IconName = 'menu'
      const refreshIcon: IconName = 'refresh'
      const checkIcon: IconName = 'check'

      expect(menuIcon).toBe('menu')
      expect(refreshIcon).toBe('refresh')
      expect(checkIcon).toBe('check')
    })
  })
})
