/**
 * ModpackRepairModal — Modpack repair/reinstall modal component
 *
 * Allows users to repair/reinstall modpacks with optional version change.
 * Fetches available versions from backend and triggers reinstallation.
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 12.1, 12.2, 12.5
 */

import React, { useState, useEffect } from 'react'
import { AlertCircle, Loader, RefreshCw, X, ChevronDown } from 'lucide-react'

// Design tokens (matching App.tsx)
const M = {
  bg: '#080c12',
  border: 'rgba(255,255,255,0.12)',
  accent: '#1bd96a',
  accentHv: '#17c45e',
  text: 'rgba(255,255,255,0.97)',
  textSub: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.38)',
  red: '#f85149',
  radius: '14px',
  radiusSm: '10px',
  radiusLg: '18px',
}

/**
 * Modpack interface (matching App.tsx)
 */
export interface Modpack {
  id: string
  external_id: string
  name: string
  source: string
  imageUrl?: string
  loader?: string
  mcVersion?: string
  description?: string
  version?: string
  installed?: boolean
}

/**
 * ModpackVersion interface for version data from external API
 */
export interface ModpackVersion {
  id: string
  versionNumber: string
  gameVersion: string
  loader: string
  releaseDate: string
  downloadUrl?: string
  fileName?: string
}

/**
 * Props for ModpackRepairModal component
 */
export interface ModpackRepairModalProps {
  /** The modpack to repair */
  modpack: Modpack
  /** Callback when modal is closed */
  onClose: () => void
  /** Callback when repair is completed successfully */
  onRepaired: (updatedModpack: Modpack) => void
}

/**
 * ModpackRepairModal component
 *
 * Displays a modal for repairing/reinstalling modpacks with optional version change.
 * Fetches available versions from backend, allows user to select a version,
 * and triggers reinstallation with force flag.
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 12.1, 12.2, 12.5
 */
/**
 * Error types for repair operations
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
type RepairErrorType = 'version_fetch' | 'backend_update' | 'cleanup' | 'reinstall' | 'unknown'

interface RepairError {
  type: RepairErrorType
  message: string
  canRetry: boolean
}

export const ModpackRepairModal: React.FC<ModpackRepairModalProps> = ({
  modpack,
  onClose,
  onRepaired,
}) => {
  const [versions, setVersions] = useState<ModpackVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<string>(modpack.version || '')
  const [loading, setLoading] = useState(true)
  const [repairing, setRepairing] = useState(false)
  const [error, setError] = useState<RepairError | null>(null)
  const [progress, setProgress] = useState<{ phase: string; message: string; percent?: number } | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = () => setDropdownOpen(false)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  // Fetch available versions when modal opens
  useEffect(() => {
    const fetchVersions = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch versions from external API using the backend endpoint
        // Use window.nimbus.backend.fetch if available (includes auth token)
        // Otherwise fall back to regular fetch with BACKEND_URL
        let res: Response
        
        if (window.nimbus?.backend?.fetch) {
          const result = await window.nimbus.backend.fetch(
            `/api/v1/modpacks/${modpack.external_id}/versions?source=${modpack.source}`
          ) as { ok: boolean; status: number; data?: unknown; error?: string }
          
          const responseBody = result.data !== undefined ? JSON.stringify(result.data) : (result.error ?? '')
          res = new Response(responseBody, {
            status: result.status,
            headers: { 'Content-Type': 'application/json' }
          })
        } else {
          // Fallback for dev environment
          const BACKEND_URL = import.meta.env.PROD
            ? 'https://nimbusgg.me'
            : (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000')
          
          res = await fetch(
            `${BACKEND_URL}/api/v1/modpacks/${modpack.external_id}/versions?source=${modpack.source}`,
            { credentials: 'include' }
          )
        }

        if (!res.ok) {
          throw new Error(`Failed to fetch versions: HTTP ${res.status}`)
        }

        const json = await res.json()
        const versionList = Array.isArray(json) ? json : (json.data ?? [])

        // Normalize version data based on source
        const normalizedVersions = versionList.map((v: any) => {
          // Backend already normalizes the data, so we just need to map the fields
          return {
            id: v.id || v.version_id || '',
            versionNumber: v.version_number || v.name || '',
            gameVersion: v.game_version || '',
            loader: v.loader || '',
            releaseDate: v.release_date || v.date_published || '',
            downloadUrl: v.download_url || v.downloadUrl || '',
            fileName: v.file_name || v.fileName || '',
          }
        })

        setVersions(normalizedVersions)
        
        // Set current version as selected if available
        if (modpack.version) {
          setSelectedVersion(modpack.version)
        } else if (normalizedVersions.length > 0) {
          setSelectedVersion(normalizedVersions[0].id)
        }
      } catch (err) {
        setError({
          type: 'version_fetch',
          message: err instanceof Error ? err.message : 'Failed to fetch versions',
          canRetry: true,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchVersions()
  }, [modpack.external_id, modpack.source, modpack.version])

  // Subscribe to game progress events during repair
  useEffect(() => {
    if (!repairing || !window.nimbus?.game?.onProgress) return

    const offProg = window.nimbus.game.onProgress((p) => {
      const prog = p as { phase: string; message: string; percent?: number }
      setProgress(prog)
      
      if (prog.phase === 'error') {
        // Determine error type based on message content
        let errorType: RepairErrorType = 'unknown'
        if (prog.message.includes('limpar') || prog.message.includes('clean')) {
          errorType = 'cleanup'
        } else if (prog.message.includes('download') || prog.message.includes('install')) {
          errorType = 'reinstall'
        }
        
        setError({
          type: errorType,
          message: prog.message,
          canRetry: true,
        })
        setRepairing(false)
        setProgress(null)
      }
      
      if (prog.phase === 'done') {
        setTimeout(() => {
          setRepairing(false)
          setProgress(null)
        }, 1500)
      }
    })

    return () => { offProg() }
  }, [repairing])

  const handleRepair = async () => {
    setRepairing(true)
    setError(null)
    setProgress({ phase: 'preparing', message: 'Preparing repair...', percent: 0 })

    try {
      // Step 1: Update version in backend if a different version is selected
      const selectedVersionChanged = selectedVersion !== modpack.version
      let updatedModpack = modpack

      if (selectedVersionChanged) {
        setProgress({ phase: 'updating', message: 'Updating modpack version...', percent: 10 })

        const res = await fetch(`/api/v1/library/${modpack.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            library_item: {
              version: selectedVersion,
              installed: false,
            },
          }),
        })

        if (!res.ok) {
          const json = await res.json().catch(() => null)
          const msg = json?.errors?.[0]?.message ?? `Failed to update version: HTTP ${res.status}`
          throw {
            type: 'backend_update',
            message: msg,
            canRetry: true,
          }
        }

        const json = await res.json()
        const data = json.data as Record<string, unknown>
        
        updatedModpack = {
          ...modpack,
          version: String(data.version ?? selectedVersion),
          installed: false,
        }
      }

      // Step 2: Trigger reinstallation with force flag
      setProgress({ phase: 'cleaning', message: 'Cleaning local instance...', percent: 30 })

      if (!window.nimbus?.game?.launch) {
        throw {
          type: 'unknown',
          message: 'Repair is only available in the installed launcher.',
          canRetry: false,
        }
      }

      // Get user info for launch
      const userRes = await fetch('/api/v1/users/me', { credentials: 'include' })
      if (!userRes.ok) {
        throw {
          type: 'unknown',
          message: 'Please log in before repairing.',
          canRetry: false,
        }
      }
      const userJson = await userRes.json()
      const user = userJson.data || userJson

      // Get launcher settings
      const settings = (await window.nimbus.settings?.get?.()) as {
        javaPath?: string
        maxMemoryMb?: number
        autoJava?: boolean
      } || {}
      const autoJava = settings.autoJava !== false

      // Fetch modpack mods
      const modsRes = await fetch(`/api/v1/library/${modpack.id}/mods`, { credentials: 'include' })
      const modsJson = modsRes.ok ? await modsRes.json() : { data: [] }
      const list = (Array.isArray(modsJson) ? modsJson : (modsJson.data ?? [])) as Array<Record<string, unknown>>
      const modSpecs = list
        .filter(m => m['enabled'] !== false && m['version'])
        .map(m => ({
          id: m['id'],
          source: m['source'] as 'modrinth' | 'curseforge',
          externalId: String(m['external_id'] ?? ''),
          versionId: String(m['version'] ?? ''),
          name: m['name'] as string | undefined,
        }))

      // Fetch modpack archive URL
      let archiveUrl: string | null = null
      let archiveSha1: string | null = null
      try {
        const archRes = await fetch(`/api/v1/library/${modpack.id}/archive`, { credentials: 'include' })
        if (archRes.ok) {
          const archJson = await archRes.json() as { data?: Record<string, unknown> }
          archiveUrl = (archJson.data?.['download_url'] as string | undefined) ?? null
          archiveSha1 = (archJson.data?.['sha1'] as string | undefined) ?? null
        }
      } catch { /* non-fatal */ }

      setProgress({ phase: 'installing', message: 'Reinstalling modpack...', percent: 50 })

      // Launch with force reinstall flag
      const result = await window.nimbus.game.launch({
        modpackId: String(modpack.id),
        modpackName: modpack.name,
        mcVersion: updatedModpack.mcVersion ?? '1.20.1',
        loader: (updatedModpack.loader as 'fabric' | 'forge' | 'neoforge' | 'quilt') ?? 'fabric',
        mods: modSpecs,
        offlineUsername: user.username,
        javaPath: settings.javaPath ?? '',
        autoJava,
        maxMemoryMb: settings.maxMemoryMb ?? 8192,
        modpackArchiveUrl: archiveUrl,
        modpackArchiveSha1: archiveSha1,
        forceReinstall: true, // Force reinstall flag
      } as never) as { ok: boolean; error?: string; exitCode?: number | null }

      if (!result.ok) {
        // Determine error type based on error message
        let errorType: RepairErrorType = 'reinstall'
        const errorMsg = result.error ?? 'Failed to reinstall modpack'
        
        if (errorMsg.includes('limpar') || errorMsg.includes('clean')) {
          errorType = 'cleanup'
        }
        
        throw {
          type: errorType,
          message: errorMsg,
          canRetry: true,
        }
      }

      setProgress({ phase: 'done', message: 'Repair completed successfully!', percent: 100 })

      // Wait a moment to show success message
      setTimeout(() => {
        onRepaired({ ...updatedModpack, installed: true })
        onClose()
      }, 1500)
    } catch (err) {
      // Handle both RepairError objects and regular errors
      if (err && typeof err === 'object' && 'type' in err && 'message' in err && 'canRetry' in err) {
        setError(err as RepairError)
      } else {
        setError({
          type: 'unknown',
          message: err instanceof Error ? err.message : 'Repair failed',
          canRetry: true,
        })
      }
      setRepairing(false)
      setProgress(null)
    }
  }

  const selectedVersionData = versions.find(v => v.id === selectedVersion)
  const currentVersionData = versions.find(v => v.id === modpack.version)

  return (
    <div
      onClick={() => !repairing && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 180ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '540px',
          maxWidth: '92vw',
          padding: '28px',
          background: 'rgba(20,25,35,0.96)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: `1px solid ${M.border}`,
          borderRadius: M.radiusLg,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: `linear-gradient(135deg, ${M.accent}22, ${M.accent}11)`,
              border: `1px solid ${M.accent}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RefreshCw size={20} color={M.accent} />
          </div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: M.text, flex: 1 }}>
            Reparar Modpack
          </h3>
          <button
            onClick={onClose}
            disabled={repairing}
            style={{
              width: 28,
              height: 28,
              borderRadius: '8px',
              background: 'transparent',
              border: 'none',
              color: M.textMuted,
              cursor: repairing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: repairing ? 0.5 : 1,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Modpack info */}
        <div
          style={{
            padding: '16px',
            borderRadius: M.radius,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${M.border}`,
            marginBottom: '20px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '10px',
              overflow: 'hidden',
              flexShrink: 0,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${M.border}`,
            }}
          >
            {modpack.imageUrl ? (
              <img
                src={modpack.imageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.textMuted }}>
                ?
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: M.text, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {modpack.name}
            </div>
            <div style={{ fontSize: '12px', color: M.textMuted }}>
              {modpack.mcVersion && `MC ${modpack.mcVersion}`}
              {modpack.loader && ` • ${modpack.loader}`}
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Loader size={24} color={M.accent} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '13px', color: M.textSub }}>Carregando versões disponíveis...</div>
          </div>
        )}

        {/* Error state */}
        {!loading && error && !repairing && (
          <div
            style={{
              padding: '16px',
              borderRadius: M.radius,
              background: `${M.red}15`,
              border: `1px solid ${M.red}33`,
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
              <AlertCircle size={18} color={M.red} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: M.red, marginBottom: '6px' }}>
                  {error.type === 'version_fetch' && 'Failed to Load Versions'}
                  {error.type === 'backend_update' && 'Failed to Update Version'}
                  {error.type === 'cleanup' && 'Failed to Clean Local Files'}
                  {error.type === 'reinstall' && 'Failed to Reinstall Modpack'}
                  {error.type === 'unknown' && 'Repair Failed'}
                </div>
                <div style={{ fontSize: '12px', color: M.textSub, lineHeight: '1.5' }}>
                  {error.message}
                </div>
                {error.type === 'cleanup' && (
                  <div style={{ fontSize: '11px', color: M.textMuted, marginTop: '8px', lineHeight: '1.5' }}>
                    Tip: Close any programs that might be using the modpack files and try again.
                  </div>
                )}
                {error.type === 'reinstall' && (
                  <div style={{ fontSize: '11px', color: M.textMuted, marginTop: '8px', lineHeight: '1.5' }}>
                    Tip: Check your internet connection and available disk space.
                  </div>
                )}
              </div>
            </div>
            {error.canRetry && (
              <button
                onClick={() => {
                  setError(null)
                  if (error.type === 'version_fetch') {
                    setLoading(true)
                    // Re-trigger version fetch
                    window.location.reload()
                  } else {
                    // Retry repair operation
                    handleRepair()
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: M.radiusSm,
                  background: M.red,
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <RefreshCw size={13} />
                Try Again
              </button>
            )}
          </div>
        )}

        {/* Version selector */}
        {!loading && !error && versions.length > 0 && (
          <>
            {/* Current version */}
            {currentVersionData && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: M.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Versão Atual
                </label>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: M.radiusSm,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${M.border}`,
                    fontSize: '13px',
                    color: M.textSub,
                  }}
                >
                  <div style={{ fontWeight: 600, color: M.text, marginBottom: '4px' }}>
                    {currentVersionData.versionNumber}
                  </div>
                  <div style={{ fontSize: '12px', color: M.textMuted }}>
                    {currentVersionData.gameVersion && `MC ${currentVersionData.gameVersion}`}
                    {currentVersionData.loader && ` • ${currentVersionData.loader}`}
                    {currentVersionData.releaseDate && ` • ${new Date(currentVersionData.releaseDate).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
            )}

            {/* Version selector */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: M.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                Selecionar Versão
              </label>

              {/* Custom dropdown — avoids the OS-native white background */}
              <div style={{ position: 'relative' }}>
                {/* Trigger button */}
                <button
                  type="button"
                  disabled={repairing}
                  onClick={() => !repairing && setDropdownOpen(o => !o)}
                  style={{
                    width: '100%',
                    padding: '12px 36px 12px 14px',
                    borderRadius: M.radiusSm,
                    background: 'rgba(255,255,255,0.06)',
                    border: `1px solid ${dropdownOpen ? M.accent : M.border}`,
                    color: M.text,
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    cursor: repairing ? 'not-allowed' : 'pointer',
                    opacity: repairing ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    transition: 'border-color 150ms ease',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {versions.find(v => v.id === selectedVersion)
                      ? (() => {
                          const v = versions.find(v => v.id === selectedVersion)!
                          const isCurrent = v.id === modpack.version
                          return `${v.versionNumber}${isCurrent ? ' (atual)' : ''} — MC ${v.gameVersion} · ${v.loader}`
                        })()
                      : 'Selecione uma versão...'}
                  </span>
                  <ChevronDown
                    size={15}
                    color={M.textMuted}
                    style={{
                      flexShrink: 0,
                      transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 150ms ease',
                    }}
                  />
                </button>

                {/* Dropdown list */}
                {dropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      zIndex: 999,
                      background: 'rgba(18,24,36,0.98)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: `1px solid ${M.border}`,
                      borderRadius: M.radiusSm,
                      boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
                      maxHeight: '260px',
                      overflowY: 'auto',
                    }}
                  >
                    {versions.map((v, i) => {
                      const isSelected = v.id === selectedVersion
                      const isCurrent = v.id === modpack.version
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVersion(v.id)
                            setDropdownOpen(false)
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            background: isSelected
                              ? `${M.accent}18`
                              : 'transparent',
                            border: 'none',
                            borderBottom: i < versions.length - 1 ? `1px solid rgba(255,255,255,0.05)` : 'none',
                            color: isSelected ? M.accent : M.text,
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            transition: 'background 100ms ease',
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.versionNumber}
                              {isCurrent && (
                                <span style={{
                                  marginLeft: '8px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: M.accent,
                                  background: `${M.accent}18`,
                                  border: `1px solid ${M.accent}44`,
                                  borderRadius: '4px',
                                  padding: '1px 5px',
                                  verticalAlign: 'middle',
                                }}>
                                  atual
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: M.textMuted, marginTop: '2px' }}>
                              MC {v.gameVersion} · {v.loader}
                              {v.releaseDate && ` · ${new Date(v.releaseDate).toLocaleDateString('pt-BR')}`}
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{ color: M.accent, fontSize: '14px', flexShrink: 0 }}>✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedVersion && selectedVersion !== modpack.version && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: M.accent,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertCircle size={12} />
                  Alterar para {versions.find(v => v.id === selectedVersion)?.versionNumber ?? selectedVersion}
                </div>
              )}
            </div>

            {/* Selected version details */}
            {selectedVersionData && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: M.radiusSm,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${M.border}`,
                  marginBottom: '20px',
                  fontSize: '12px',
                  color: M.textSub,
                }}
              >
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ color: M.textMuted }}>Versão do Minecraft:</span>{' '}
                  <span style={{ color: M.text, fontWeight: 600 }}>{selectedVersionData.gameVersion}</span>
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ color: M.textMuted }}>Mod Loader:</span>{' '}
                  <span style={{ color: M.text, fontWeight: 600 }}>{selectedVersionData.loader}</span>
                </div>
                {selectedVersionData.releaseDate && (
                  <div>
                    <span style={{ color: M.textMuted }}>Data de Lançamento:</span>{' '}
                    <span style={{ color: M.text, fontWeight: 600 }}>
                      {new Date(selectedVersionData.releaseDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Progress indicator */}
        {repairing && progress && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: M.radius,
              background: 'rgba(27,217,106,0.08)',
              border: '1px solid rgba(27,217,106,0.25)',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: M.text, marginBottom: '8px' }}>
              <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>
                {progress.message}
              </div>
            </div>
            {progress.percent != null && (
              <div
                style={{
                  height: '4px',
                  borderRadius: '4px',
                  background: 'rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(0, Math.min(100, progress.percent))}%`,
                    background: `linear-gradient(90deg, ${M.accent}, #17c45e)`,
                    transition: 'width 250ms ease',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!loading && versions.length > 0 && !error && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              disabled={repairing}
              style={{
                flex: 1,
                padding: '11px 18px',
                borderRadius: M.radiusSm,
                background: 'transparent',
                border: `1px solid ${M.border}`,
                color: M.textSub,
                cursor: repairing ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: 'inherit',
                opacity: repairing ? 0.5 : 1,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleRepair}
              disabled={repairing || !selectedVersion}
              style={{
                flex: 1,
                padding: '11px 18px',
                borderRadius: M.radiusSm,
                background: M.accent,
                border: 'none',
                color: '#fff',
                cursor: (repairing || !selectedVersion) ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: `0 4px 16px ${M.accent}44`,
                opacity: (repairing || !selectedVersion) ? 0.6 : 1,
              }}
            >
              {repairing ? (
                <>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Reparando...
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  Confirmar Reparo
                </>
              )}
            </button>
          </div>
        )}

        {/* Close button when error is shown - allows user to close and retry later */}
        {!loading && error && !repairing && (
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '11px 18px',
              borderRadius: M.radiusSm,
              background: 'transparent',
              border: `1px solid ${M.border}`,
              color: M.textSub,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
              marginTop: '12px',
            }}
          >
            Close
          </button>
        )}
      </div>
    </div>
  )
}
