import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders the title and optional hint', () => {
    render(<EmptyState title="Tap + to capture" hint="ideas become projects" />)
    expect(screen.getByText('Tap + to capture')).toBeDefined()
    expect(screen.getByText('ideas become projects')).toBeDefined()
  })
})
