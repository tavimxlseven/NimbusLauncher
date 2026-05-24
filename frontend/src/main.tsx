import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { restoreFromSession, applyTheme } from './services/ThemeService'
import './styles/glass.css'

// Always dark for the site
const initialTheme = { ...restoreFromSession(), mode: 'dark' as const }
applyTheme(initialTheme)

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace', padding: '32px', minHeight: '100vh' }}>
          <h2 style={{ color: '#f78166' }}>Erro de renderização</h2>
          <pre style={{ background: '#161b22', padding: '16px', borderRadius: '8px', overflow: 'auto', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}{'\n\n'}{this.state.error.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '16px', padding: '10px 20px', background: '#1bd96a', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App initialTheme={initialTheme} />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
