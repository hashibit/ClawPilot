import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'
import type { RemoteSkillResult as RemoteSkill, LocalSkill } from '../../lib/api'
import { useEscClose } from '../../hooks/useEscClose'

function SkillRow({ skill, installing, onInstall }: {
    skill: RemoteSkill
    installing: string | null
    onInstall: (slug: string) => void
}) {
    const { t } = useTranslation()
    const isInstalling = installing === skill.slug
    return (
        <div className="flex-center gap-10" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--border-subtle)' }}>
            <span className="flex-shrink-0" style={{ fontSize: '18px' }}>🔌</span>
            <div className="flex-grow">
                <div className="text-sm" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{skill.name}</div>
                <div className="text-xxs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {skill.description_zh || skill.description}
                </div>
                <div className="mt-1" style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                    {skill.ownerName} · ↓{skill.downloads.toLocaleString()} · ★{skill.stars} · v{skill.version}
                </div>
            </div>
            <button
                onClick={() => onInstall(skill.slug)}
                disabled={isInstalling}
                className="flex-shrink-0 status-badge"
                style={{ border: '1px solid rgba(6,182,212,0.4)', background: 'rgba(6,182,212,0.1)', color: isInstalling ? 'var(--text-dimmer)' : 'var(--info)', cursor: isInstalling ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
            >{isInstalling ? t('agents.installing') : t('agents.install')}</button>
        </div>
    )
}

export function SkillModal({ enabled, onClose, onToggle }: {
    enabled: string[]
    onClose: () => void
    onToggle: (slug: string) => void
}) {
    const { t } = useTranslation()
    useEscClose(true, onClose)
    const [search, setSearch] = useState('')
    const [dbSkills, setDbSkills] = useState<LocalSkill[]>([])
    const [remoteSkills, setRemoteSkills] = useState<RemoteSkill[]>([])
    const [searching, setSearching] = useState(false)
    const [installing, setInstalling] = useState<string | null>(null)
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        import('../../lib/api').then(api => api.getSkills()).then(setDbSkills).catch(() => { })
    }, [])

    useEffect(() => {
        if (!search.trim()) { setRemoteSkills([]); return }
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
        searchTimerRef.current = setTimeout(async () => {
            setSearching(true)
            try {
                const api = await import('../../lib/api')
                const results = await api.searchSkills(search.trim())
                setRemoteSkills(results)
            } catch { /* offline */ }
            finally { setSearching(false) }
        }, 400)
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
    }, [search])

    async function handleInstall(slug: string) {
        setInstalling(slug)
        try {
            const api = await import('../../lib/api')
            await api.installSkill(slug)
            const fresh = await api.getSkills()
            setDbSkills(fresh)
            const { toast } = await import('../../components/Toast')
            toast(t('agents.skill_installed', { slug }), 'success')
        } catch (e: unknown) {
            const { toast } = await import('../../components/Toast')
            toast(e instanceof Error ? e.message : t('agents.skill_install_failed'), 'error')
        } finally {
            setInstalling(null)
        }
    }

    async function handleUninstall(slug: string) {
        try {
            const api = await import('../../lib/api')
            await api.uninstallSkill(slug)
            const fresh = await api.getSkills()
            setDbSkills(fresh)
            const { toast } = await import('../../components/Toast')
            toast(t('agents.skill_uninstalled', { slug }), 'success')
        } catch (e: unknown) {
            const { toast } = await import('../../components/Toast')
            toast(e instanceof Error ? e.message : t('agents.skill_uninstall_failed'), 'error')
        }
    }

    const installedSkills = dbSkills.filter(s =>
        s.is_installed && (!search.trim() || (s.display_name + s.name + (s.slug ?? '')).toLowerCase().includes(search.toLowerCase()))
    )

    const dbSlugs = new Set(dbSkills.map(s => s.slug).filter(Boolean))
    const remoteNew = remoteSkills.filter(rs => !dbSlugs.has(rs.slug))
    const remoteInDbNotInstalled = remoteSkills.filter(rs =>
        dbSlugs.has(rs.slug) && !dbSkills.find(d => d.slug === rs.slug)?.is_installed
    )

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div
                className="modal-panel"
                style={{ width: '580px', maxWidth: '90vw', maxHeight: '70vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-header" style={{ padding: '16px 20px' }}>
                    <div>
                        <div className="modal-title">{t('agents.skill_modal_title')}</div>
                        <div className="modal-sub">{t('agents.skill_modal_subtitle')}</div>
                    </div>
                    <button className="modal-close" onClick={onClose} style={{ fontSize: '20px', lineHeight: 1 }}>×</button>
                </div>

                {/* Search bar */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}>
                    <input
                        type="text" placeholder={t('agents.skill_search_placeholder')} className="field-input"
                        value={search} onChange={e => setSearch(e.target.value)}
                    />
                    {searching && (
                        <span className="text-xxs text-dimmer" style={{ position: 'absolute', right: '32px', top: '50%', transform: 'translateY(-50%)' }}>{t('agents.searching')}</span>
                    )}
                </div>

                {/* Body */}
                <div className="flex-col flex-1" style={{ overflowY: 'auto', padding: '12px 20px', gap: '8px' }}>
                    {installedSkills.length > 0 && (
                        <>
                            <div className="section-label" style={{ padding: '2px 0' }}>{t('agents.installed')}</div>
                            {installedSkills.map(skill => {
                                const slug = skill.slug ?? skill.name
                                const added = enabled.includes(slug)
                                return (
                                    <div key={skill.id} className="flex-center gap-10" style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${added ? 'var(--success-muted)' : 'var(--border-default)'}`, background: added ? 'var(--success-muted)' : 'var(--border-subtle)' }}>
                                        <span className="flex-shrink-0" style={{ fontSize: '18px' }}>🔧</span>
                                        <div className="flex-grow" style={{ cursor: 'pointer' }} onClick={() => onToggle(slug)}>
                                            <div className="text-sm" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{skill.display_name}</div>
                                            <div className="text-xxs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</div>
                                            {skill.version && <div className="mt-1" style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>v{skill.version}{skill.author ? ` · ${skill.author}` : ''}</div>}
                                        </div>
                                        <div className="flex gap-6 flex-shrink-0">
                                            <span
                                                onClick={() => onToggle(slug)}
                                                className="status-badge"
                                                style={{ background: added ? 'var(--success-muted)' : 'var(--accent-muted)', color: added ? 'var(--success)' : 'var(--accent-hover)', cursor: 'pointer' }}
                                            >{added ? `✓ ${t('agents.added')}` : `+ ${t('agents.add')}`}</span>
                                            <span
                                                onClick={() => handleUninstall(slug)}
                                                className="status-badge"
                                                style={{ background: 'var(--error-muted)', color: 'var(--error)', cursor: 'pointer' }}
                                            >{t('agents.uninstall')}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </>
                    )}

                    {remoteInDbNotInstalled.map(skill => (
                        <SkillRow key={skill.slug} skill={skill} installing={installing} onInstall={handleInstall} />
                    ))}

                    {remoteNew.length > 0 && (
                        <>
                            <div className="section-label" style={{ padding: '4px 0 2px' }}>{t('agents.clawhub_results')}</div>
                            {remoteNew.map(skill => (
                                <SkillRow key={skill.slug} skill={skill} installing={installing} onInstall={handleInstall} />
                            ))}
                        </>
                    )}

                    {installedSkills.length === 0 && remoteSkills.length === 0 && !searching && (
                        <div className="empty-state">
                            <div className="empty-state-title">{t('agents.no_installed_skills')}</div>
                            <div className="empty-state-desc">{t('agents.skill_search_hint')}</div>
                        </div>
                    )}

                    {!searching && search.trim() && installedSkills.length === 0 && remoteSkills.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-title">{t('agents.no_skills_found')}</div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer flex-between" style={{ padding: '12px 20px' }}>
                    <span className="text-xs text-dimmer">{t('agents.skill_selected_count', { selected: enabled.length, installed: dbSkills.filter(s => s.is_installed).length })}</span>
                    <button className="tbtn tbtn-accent" onClick={onClose}>{t('common.button_done')}</button>
                </div>
            </div>
        </div>
    )
}
