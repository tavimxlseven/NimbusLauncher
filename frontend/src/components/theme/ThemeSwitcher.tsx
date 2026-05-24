/**
 * ThemeSwitcher — UI component for selecting light / dark / system mode
 * and an optional accent color.
 *
 * Requirements: 7.3, 7.4, 7.6
 *
 * - Calls `onThemeChange` synchronously on every selection so the theme
 *   is applied in < 300ms (Requirement 7.3).
 * - Uses GlassPanel as the visual base (Requirement 7.1).
 * - Uses exclusively Lucide React icons: Sun, Moon, Monitor, Palette
 *   (Requirement 7.2).
 */

import React, { useId } from 'react'
import { Sun, Moon, Monitor, Palette } from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'
import type { ThemeConfig } from '../../services/ThemeService'

// ── Preset accent colors ──────────────────────────────────────────────────────

const PRESET_COLORS: { label: string; value: string }[] = [
  { label: 'Nimbus Blue', value: '#4F8EF7' },
  { label: 'Emerald', value: '#34D399' },
  { label: 'Violet', value: '#A78BFA' },
  { label: 'Rose', value: '#FB7185' },
  { label: 'Amber', value: '#FBBF24' },
  { label: 'Cyan', value: '#22D3EE' },
]

// ── Mode button descriptor ────────────────────────────────────────────────────

interface ModeOption {
  mode: ThemeConfig['mode']
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: React.ComponentType<any>
}

const MODE_OPTIONS: ModeOption[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Monitor },
]

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ThemeSwitcherProps {
  /** The currently active theme configuration */
  currentTheme: ThemeConfig
  /**
   * Called immediately when the user selects a new mode or color.
   * The caller is responsible for calling ThemeService.applyTheme and
   * ThemeService.savePreference.
   */
  onThemeChange: (theme: ThemeConfig) => void
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ThemeSwitcher renders inside a GlassPanel and exposes:
 *  - Three mode buttons: Light (Sun), Dark (Moon), System (Monitor)
 *  - Six preset color swatches + a native color picker (Palette icon)
 */
const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  currentTheme,
  onThemeChange,
  className = '',
  'data-testid': testId = 'theme-switcher',
}) => {
  const colorPickerId = useId()

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleModeChange = (mode: ThemeConfig['mode']) => {
    // Synchronous call — theme applied in < 300ms (Requirement 7.3)
    onThemeChange({ ...currentTheme, mode })
  }

  const handleColorChange = (color: string) => {
    onThemeChange({ ...currentTheme, color })
  }

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleColorChange(e.target.value)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <GlassPanel
      className={`theme-switcher${className ? ` ${className}` : ''}`}
      data-testid={testId}
      style={{ padding: '16px', display: 'inline-flex', flexDirection: 'column', gap: '12px' }}
    >
      {/* ── Mode selector ─────────────────────────────────────────────── */}
      <div
        role="group"
        aria-label="Theme mode"
        style={{ display: 'flex', gap: '8px' }}
      >
        {MODE_OPTIONS.map(({ mode, label, Icon }) => {
          const isActive = currentTheme.mode === mode
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={isActive}
              aria-label={`${label} mode`}
              data-testid={`theme-mode-${mode}`}
              onClick={() => handleModeChange(mode)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: 'var(--glass-radius-sm, 12px)',
                border: `1px solid ${isActive ? 'var(--theme-color, #4F8EF7)' : 'var(--glass-border, rgba(255,255,255,0.2))'}`,
                background: isActive
                  ? 'var(--glass-bg-active, rgba(255,255,255,0.28))'
                  : 'var(--glass-bg, rgba(255,255,255,0.15))',
                color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                transition: 'background-color var(--glass-transition, 200ms ease), border-color var(--glass-transition, 200ms ease)',
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Color picker ──────────────────────────────────────────────── */}
      <div
        role="group"
        aria-label="Accent color"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
      >
        {/* Preset swatches */}
        {PRESET_COLORS.map(({ label, value }) => {
          const isActive = currentTheme.color === value
          return (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={isActive}
              data-testid={`theme-color-${value.replace('#', '')}`}
              onClick={() => handleColorChange(value)}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: value,
                border: isActive
                  ? '2px solid var(--glass-text-primary, rgba(255,255,255,0.95))'
                  : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
                outline: isActive ? `2px solid ${value}` : 'none',
                outlineOffset: '2px',
                transition: 'border-color var(--glass-transition, 200ms ease)',
              }}
            />
          )
        })}

        {/* Custom color picker trigger */}
        <label
          htmlFor={colorPickerId}
          aria-label="Custom color"
          title="Custom color"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
            background: 'var(--glass-bg, rgba(255,255,255,0.15))',
            cursor: 'pointer',
            color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
          }}
        >
          <Palette size={14} aria-hidden="true" />
          <input
            id={colorPickerId}
            type="color"
            value={currentTheme.color ?? '#4F8EF7'}
            onChange={handleColorPickerChange}
            data-testid="theme-color-picker"
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              opacity: 0,
              pointerEvents: 'none',
            }}
            aria-label="Pick a custom accent color"
          />
        </label>
      </div>
    </GlassPanel>
  )
}

export default ThemeSwitcher
