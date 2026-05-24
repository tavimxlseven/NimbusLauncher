/**
 * AIModpackContainer — orchestrates the full AI modpack generation flow.
 *
 * Wires together:
 *  - AIPromptInput  → useAIModpack.generate()   (Requirement 11.1)
 *  - AIModpackResult (displays the generation result)
 *  - AIAdjustPanel  → useAIModpack.adjust()     (Requirement 11.6)
 *
 * The container is intentionally thin: all API logic lives in useAIModpack,
 * and all visual logic lives in the individual leaf components.
 *
 * Uses exclusively Lucide React icons (Requirement 7.2):
 *  - `AlertTriangle` — top-level error banner
 *  - `RefreshCw`     — "Tentar novamente" / reset button
 *
 * Requirements: 11.1, 11.6
 */

import React, { CSSProperties, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import GlassPanel from '../layout/GlassPanel'
import AIPromptInput from './AIPromptInput'
import AIModpackResult from './AIModpackResult'
import AIAdjustPanel from './AIAdjustPanel'
import { useAIModpack } from '../../hooks/useAIModpack'

/* ── Props ───────────────────────────────────────────────────────────────── */

export interface AIModpackContainerProps {
  /**
   * Default Minecraft version pre-filled in the generation form.
   * Consumers can override this to match the user's preferred version.
   */
  defaultMinecraftVersion?: string
  /**
   * Default loader pre-filled in the generation form.
   */
  defaultLoader?: 'forge' | 'fabric' | 'quilt' | 'neoforge'
  /** Additional CSS class names applied to the outermost wrapper */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  width: '100%',
}

const errorBannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '12px 16px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  background: 'rgba(251, 113, 133, 0.1)',
  border: '1px solid rgba(251, 113, 133, 0.3)',
}

const errorTextStyle: CSSProperties = {
  flex: 1,
  fontSize: '14px',
  color: 'rgba(251, 113, 133, 0.9)',
  margin: 0,
}

const resetButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid rgba(251, 113, 133, 0.4)',
  background: 'transparent',
  color: 'rgba(251, 113, 133, 0.9)',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  flexShrink: 0,
  transition: 'background-color var(--glass-transition, 200ms ease)',
}

const configRowStyle: CSSProperties = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
}

const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: '140px',
  padding: '10px 12px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg, rgba(255,255,255,0.08))',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  fontSize: '14px',
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const labelSmallStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginBottom: '4px',
  display: 'block',
}

/* ── Loader options ──────────────────────────────────────────────────────── */

const LOADER_OPTIONS: Array<{ value: 'forge' | 'fabric' | 'quilt' | 'neoforge'; label: string }> =
  [
    { value: 'fabric', label: 'Fabric' },
    { value: 'forge', label: 'Forge' },
    { value: 'neoforge', label: 'NeoForge' },
    { value: 'quilt', label: 'Quilt' },
  ]

const MINECRAFT_VERSIONS = ['1.21.1', '1.21', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5']

/* ── Component ───────────────────────────────────────────────────────────── */

/**
 * AIModpackContainer
 *
 * Full-page container that orchestrates the AI modpack generation flow:
 *
 * 1. User fills in the prompt (AIPromptInput) and selects Minecraft version + loader.
 * 2. On submit, calls useAIModpack.generate() → POST /api/v1/ai/generate.
 * 3. AIModpackResult displays the result (or a "generating" skeleton).
 * 4. When the user clicks "Ajustar modpack", AIAdjustPanel slides in.
 * 5. On adjust submit, calls useAIModpack.adjust() → PATCH /api/v1/ai/modpacks/:id/adjust.
 *
 * Requirements: 11.1, 11.6
 */
const AIModpackContainer: React.FC<AIModpackContainerProps> = ({
  defaultMinecraftVersion = '1.20.1',
  defaultLoader = 'fabric',
  className = '',
  'data-testid': testId = 'ai-modpack-container',
}) => {
  // ── Hook ──────────────────────────────────────────────────────────────────
  const { result, loading, error, generate, adjust, reset } = useAIModpack()

  // ── Local form state ──────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState('')
  const [minecraftVersion, setMinecraftVersion] = useState(defaultMinecraftVersion)
  const [loader, setLoader] = useState<'forge' | 'fabric' | 'quilt' | 'neoforge'>(defaultLoader)

  // ── Adjust panel state ────────────────────────────────────────────────────
  const [showAdjustPanel, setShowAdjustPanel] = useState(false)
  const [adjustInstruction, setAdjustInstruction] = useState('')

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerate = async (description: string) => {
    await generate({ description, minecraftVersion, loader })
  }

  const handleAdjustOpen = (_id: string) => {
    setAdjustInstruction('')
    setShowAdjustPanel(true)
  }

  const handleAdjustClose = () => {
    setShowAdjustPanel(false)
    setAdjustInstruction('')
  }

  const handleAdjustSubmit = async (modpackId: string, instruction: string) => {
    await adjust(modpackId, instruction)
    setShowAdjustPanel(false)
    setAdjustInstruction('')
  }

  const handleReset = () => {
    reset()
    setPrompt('')
    setShowAdjustPanel(false)
    setAdjustInstruction('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={wrapperStyle}
      className={`ai-modpack-container${className ? ` ${className}` : ''}`}
      data-testid={testId}
    >
      {/* ── Top-level error banner (network / unexpected errors) ─────────── */}
      {error && !result && (
        <GlassPanel data-testid={`${testId}-error-banner`}>
          <div style={errorBannerStyle} role="alert">
            <AlertTriangle
              size={16}
              style={{ color: 'rgba(251, 113, 133, 0.9)', flexShrink: 0, marginTop: 2 }}
              aria-hidden="true"
            />
            <p style={errorTextStyle}>{error}</p>
            <button
              type="button"
              onClick={handleReset}
              style={resetButtonStyle}
              aria-label="Tentar novamente"
              data-testid={`${testId}-retry-btn`}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Tentar novamente
            </button>
          </div>
        </GlassPanel>
      )}

      {/* ── Prompt input + config (hidden while result is shown) ─────────── */}
      {!result && (
        <>
          {/* Minecraft version + loader selectors */}
          <GlassPanel data-testid={`${testId}-config`}>
            <div style={{ padding: '16px 20px' }}>
              <div style={configRowStyle}>
                {/* Minecraft version */}
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label
                    htmlFor={`${testId}-mc-version`}
                    style={labelSmallStyle}
                  >
                    Versão do Minecraft
                  </label>
                  <select
                    id={`${testId}-mc-version`}
                    value={minecraftVersion}
                    onChange={(e) => setMinecraftVersion(e.target.value)}
                    style={selectStyle}
                    data-testid={`${testId}-mc-version`}
                    aria-label="Versão do Minecraft"
                  >
                    {MINECRAFT_VERSIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Loader */}
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label
                    htmlFor={`${testId}-loader`}
                    style={labelSmallStyle}
                  >
                    Loader
                  </label>
                  <select
                    id={`${testId}-loader`}
                    value={loader}
                    onChange={(e) =>
                      setLoader(e.target.value as 'forge' | 'fabric' | 'quilt' | 'neoforge')
                    }
                    style={selectStyle}
                    data-testid={`${testId}-loader`}
                    aria-label="Loader do Minecraft"
                  >
                    {LOADER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </GlassPanel>

          {/* Prompt input */}
          <AIPromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            loading={loading}
            data-testid={`${testId}-prompt`}
          />
        </>
      )}

      {/* ── Generation result ─────────────────────────────────────────────── */}
      {result && (
        <>
          <AIModpackResult
            result={result}
            onAdjust={handleAdjustOpen}
            data-testid={`${testId}-result`}
          />

          {/* "Gerar novo modpack" button — lets the user start over */}
          {result.status !== 'generating' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: 'var(--glass-radius-sm, 12px)',
                  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
                  background: 'transparent',
                  color: 'var(--glass-text-secondary, rgba(255,255,255,0.6))',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  transition: 'background-color var(--glass-transition, 200ms ease)',
                }}
                aria-label="Gerar novo modpack"
                data-testid={`${testId}-new-btn`}
              >
                <RefreshCw size={14} aria-hidden="true" />
                Gerar novo modpack
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Adjust panel (shown when user clicks "Ajustar modpack") ─────── */}
      {showAdjustPanel && result && result.id && (
        <AIAdjustPanel
          modpackId={result.id}
          modpackName={result.name}
          value={adjustInstruction}
          onChange={setAdjustInstruction}
          onSubmit={handleAdjustSubmit}
          onClose={handleAdjustClose}
          loading={loading}
          data-testid={`${testId}-adjust`}
        />
      )}
    </div>
  )
}

export default AIModpackContainer
