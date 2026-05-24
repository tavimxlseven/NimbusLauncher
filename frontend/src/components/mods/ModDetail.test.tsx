/**
 * Unit tests for ModDetail component.
 * Requirements: 1.4, 1.5
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ModDetail from './ModDetail'
import type { ModDetailProps, ModVersion, ModDependency } from './ModDetail'

const baseProps: ModDetailProps = {
  id: 'sodium',
  name: 'Sodium',
  source: 'modrinth',
}

const sampleVersions: ModVersion[] = [
  {
    id: 'v1',
    name: '0.5.8',
    gameVersions: ['1.20.1'],
    loaders: ['fabric'],
    releaseDate: '2024-01-15T00:00:00Z',
  },
  {
    id: 'v2',
    name: '0.5.7',
    gameVersions: ['1.20.1'],
    loaders: ['fabric'],
  },
]

const sampleDependencies: ModDependency[] = [
  { id: 'fabric-api', name: 'Fabric API', required: true },
  { id: 'indium', name: 'Indium', required: false },
]

describe('ModDetail — rendering', () => {
  it('renders the mod name as a heading', () => {
    render(<ModDetail {...baseProps} />)
    expect(screen.getByRole('heading', { name: 'Sodium' })).toBeInTheDocument()
  })

  it('renders the source badge', () => {
    render(<ModDetail {...baseProps} />)
    expect(screen.getByLabelText('Fonte: modrinth')).toBeInTheDocument()
  })

  it('applies mod-detail class', () => {
    render(<ModDetail {...baseProps} data-testid="detail" />)
    expect(screen.getByTestId('detail').className).toContain('mod-detail')
  })

  it('uses data-testid prop when provided', () => {
    render(<ModDetail {...baseProps} data-testid="my-detail" />)
    expect(screen.getByTestId('my-detail')).toBeInTheDocument()
  })

  it('falls back to mod-detail-{id} testid when not provided', () => {
    render(<ModDetail {...baseProps} />)
    expect(screen.getByTestId('mod-detail-sodium')).toBeInTheDocument()
  })
})

describe('ModDetail — optional sections omitted when absent (Requirement 1.5)', () => {
  it('does not render description section when description is absent', () => {
    render(<ModDetail {...baseProps} data-testid="detail" />)
    expect(
      screen.queryByTestId('detail-description'),
    ).not.toBeInTheDocument()
  })

  it('does not render versions section when versions is absent', () => {
    render(<ModDetail {...baseProps} data-testid="detail" />)
    expect(screen.queryByTestId('detail-versions')).not.toBeInTheDocument()
  })

  it('does not render dependencies section when dependencies is absent', () => {
    render(<ModDetail {...baseProps} data-testid="detail" />)
    expect(
      screen.queryByTestId('detail-dependencies'),
    ).not.toBeInTheDocument()
  })

  it('does not render screenshots section when screenshots is absent', () => {
    render(<ModDetail {...baseProps} data-testid="detail" />)
    expect(
      screen.queryByTestId('detail-screenshots'),
    ).not.toBeInTheDocument()
  })

  it('does not render categories when categories is absent', () => {
    render(<ModDetail {...baseProps} />)
    expect(screen.queryByLabelText('Categorias')).not.toBeInTheDocument()
  })

  it('does not render download count when downloadCount is absent', () => {
    render(<ModDetail {...baseProps} />)
    expect(screen.queryByLabelText(/downloads/i)).not.toBeInTheDocument()
  })

  it('does not render external link when externalUrl is absent', () => {
    render(<ModDetail {...baseProps} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not render versions section when versions is empty array', () => {
    render(<ModDetail {...baseProps} versions={[]} data-testid="detail" />)
    expect(screen.queryByTestId('detail-versions')).not.toBeInTheDocument()
  })

  it('does not render dependencies section when dependencies is empty array', () => {
    render(<ModDetail {...baseProps} dependencies={[]} data-testid="detail" />)
    expect(
      screen.queryByTestId('detail-dependencies'),
    ).not.toBeInTheDocument()
  })

  it('does not render screenshots section when screenshots is empty array', () => {
    render(<ModDetail {...baseProps} screenshots={[]} data-testid="detail" />)
    expect(
      screen.queryByTestId('detail-screenshots'),
    ).not.toBeInTheDocument()
  })

  it('does not render categories when categories is empty array', () => {
    render(<ModDetail {...baseProps} categories={[]} />)
    expect(screen.queryByLabelText('Categorias')).not.toBeInTheDocument()
  })

  it('shows placeholder emoji when imageUrl is absent', () => {
    render(<ModDetail {...baseProps} />)
    expect(screen.getByText('🧩')).toBeInTheDocument()
  })
})

describe('ModDetail — optional sections rendered when present (Requirement 1.4)', () => {
  it('renders description section when description is provided', () => {
    render(
      <ModDetail
        {...baseProps}
        description="A rendering engine replacement for the client"
        data-testid="detail"
      />,
    )
    expect(screen.getByTestId('detail-description')).toBeInTheDocument()
    expect(
      screen.getByText('A rendering engine replacement for the client'),
    ).toBeInTheDocument()
  })

  it('renders versions section when versions are provided', () => {
    render(
      <ModDetail {...baseProps} versions={sampleVersions} data-testid="detail" />,
    )
    expect(screen.getByTestId('detail-versions')).toBeInTheDocument()
    expect(screen.getByText('0.5.8')).toBeInTheDocument()
    expect(screen.getByText('0.5.7')).toBeInTheDocument()
  })

  it('renders version game version tags', () => {
    render(<ModDetail {...baseProps} versions={sampleVersions} />)
    const tags = screen.getAllByText('1.20.1')
    expect(tags.length).toBeGreaterThan(0)
  })

  it('renders version loader tags', () => {
    render(<ModDetail {...baseProps} versions={sampleVersions} />)
    const tags = screen.getAllByText('fabric')
    expect(tags.length).toBeGreaterThan(0)
  })

  it('renders dependencies section when dependencies are provided', () => {
    render(
      <ModDetail
        {...baseProps}
        dependencies={sampleDependencies}
        data-testid="detail"
      />,
    )
    expect(screen.getByTestId('detail-dependencies')).toBeInTheDocument()
    expect(screen.getByText('Fabric API')).toBeInTheDocument()
    expect(screen.getByText('Indium')).toBeInTheDocument()
  })

  it('marks required dependencies as "Obrigatório"', () => {
    render(<ModDetail {...baseProps} dependencies={sampleDependencies} />)
    expect(screen.getByLabelText('Obrigatório')).toBeInTheDocument()
  })

  it('marks optional dependencies as "Opcional"', () => {
    render(<ModDetail {...baseProps} dependencies={sampleDependencies} />)
    expect(screen.getByLabelText('Opcional')).toBeInTheDocument()
  })

  it('renders screenshots section when screenshots are provided', () => {
    const screenshots = [
      'https://example.com/ss1.png',
      'https://example.com/ss2.png',
    ]
    render(
      <ModDetail {...baseProps} screenshots={screenshots} data-testid="detail" />,
    )
    expect(screen.getByTestId('detail-screenshots')).toBeInTheDocument()
    const imgs = screen.getAllByRole('img', { name: /captura de tela/i })
    expect(imgs).toHaveLength(2)
  })

  it('renders categories when provided', () => {
    render(
      <ModDetail {...baseProps} categories={['Otimização', 'Gráficos']} />,
    )
    expect(screen.getByLabelText('Categorias')).toBeInTheDocument()
    expect(screen.getByText('Otimização')).toBeInTheDocument()
    expect(screen.getByText('Gráficos')).toBeInTheDocument()
  })

  it('renders download count when provided', () => {
    render(<ModDetail {...baseProps} downloadCount={5000000} />)
    expect(screen.getByLabelText(/5000000 downloads/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/downloads/i)).toHaveTextContent('5.0M')
  })

  it('renders external link when externalUrl is provided', () => {
    render(
      <ModDetail
        {...baseProps}
        externalUrl="https://modrinth.com/mod/sodium"
      />,
    )
    const link = screen.getByRole('link', { name: /ver sodium em modrinth/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://modrinth.com/mod/sodium')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders mod icon image when imageUrl is provided', () => {
    render(
      <ModDetail {...baseProps} imageUrl="https://example.com/icon.png" />,
    )
    const img = screen.getByRole('img', { name: /sodium icon/i })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/icon.png')
  })
})

describe('ModDetail — no errors on minimal props', () => {
  it('renders without errors when only required props are provided', () => {
    expect(() => render(<ModDetail {...baseProps} />)).not.toThrow()
  })

  it('renders without errors when all optional props are undefined', () => {
    expect(() =>
      render(
        <ModDetail
          id="test"
          name="Test Mod"
          source="curseforge"
          description={undefined}
          downloadCount={undefined}
          versions={undefined}
          dependencies={undefined}
          screenshots={undefined}
          categories={undefined}
          externalUrl={undefined}
          imageUrl={undefined}
        />,
      ),
    ).not.toThrow()
  })
})
