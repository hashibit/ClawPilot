import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'
import type { RemoteSkillResult as RemoteSkill, LocalSkill } from '../../lib/api'

function SkillRow({ skill, installing, onInstall }: {
    skill: RemoteSkill
    installing: string | null
    onInstall: (slug: string) => void
}) {
    const { t } = useTranslation()
    const isInstalling = installing === skill.slug
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--border-subtle)' }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>🔌</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{skill.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {skill.description_zh || skill.description}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '1px' }}>
                    {skill.ownerName} · ↓{skill.downloads.toLocaleString()} · ★{skill.stars} · v{skill.version}
                </div>
            </div>
            <button
                onClick={() => onInstall(skill.slug)}
                disabled={isInstalling}
                style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', border: '1px solid rgba(6,182,212,0.4)', background: 'rgba(6,182,212,0.1)', color: isInstalling ? 'var(--text-dimmer)' : 'var(--info)', cursor: isInstalling ? 'not-allowed' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
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
                style={{ width: '580px', maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('agents.skill_modal_title')}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', marginTop: '2px' }}>{t('agents.skill_modal_subtitle')}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
                </div>

                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}>
                    <input
                        type="text" placeholder={t('agents.skill_search_placeholder')} className="field-input"
                        style={{ width: '100%' }} value={search} onChange={e => setSearch(e.target.value)}
                    />
                    {searching && (
                        <span style={{ position: 'absolute', right: '32px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-dimmer)' }}>{t('agents.searching')}</span>
                    )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {installedSkills.length > 0 && (
                        <>
                            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', padding: '2px 0', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('agents.installed')}</div>
                            {installedSkills.map(skill => {
                                const slug = skill.slug ?? skill.name
                                const added = enabled.includes(slug)
                                return (
                                    <div key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${added ? 'var(--success-muted)' : 'var(--border-default)'}`, background: added ? 'var(--success-muted)' : 'var(--border-subtle)' }}>
                                        <span style={{ fontSize: '18px', flexShrink: 0 }}>🔧</span>
                                        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onToggle(slug)}>
                                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{skill.display_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</div>
                                            {skill.version && <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '1px' }}>v{skill.version}{skill.author ? ` · ${skill.author}` : ''}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                            <span
                                                onClick={() => onToggle(slug)}
                                                style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: added ? 'var(--success-muted)' : 'var(--accent-muted)', color: added ? 'var(--success)' : 'var(--accent-hover)', cursor: 'pointer' }}
                                            >{added ? `✓ ${t('agents.added')}` : `+ ${t('agents.add')}`}</span>
                                            <span
                                                onClick={() => handleUninstall(slug)}
                                                style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--error-muted)', color: 'var(--error)', cursor: 'pointer' }}
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
                            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', padding: '4px 0 2px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('agents.clawhub_results')}</div>
                            {remoteNew.map(skill => (
                                <SkillRow key={skill.slug} skill={skill} installing={installing} onInstall={handleInstall} />
                            ))}
                        </>
                    )}

                    {installedSkills.length === 0 && remoteSkills.length === 0 && !searching && (
                        <div style={{ textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '13px', padding: '32px 0' }}>
                            <div style={{ marginBottom: '8px' }}>{t('agents.no_installed_skills')}</div>
                            <div style={{ fontSize: '11px' }}>{t('agents.skill_search_hint')}</div>
                        </div>
                    )}

                    {!searching && search.trim() && installedSkills.length === 0 && remoteSkills.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '13px', padding: '24px 0' }}>{t('agents.no_skills_found')}</div>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{t('agents.skill_selected_count', { selected: enabled.length, installed: dbSkills.filter(s => s.is_installed).length })}</span>
                    <button className="tbtn tbtn-accent" onClick={onClose}>{t('common.button_done')}</button>
                </div>
            </div>
        </div>
    )
}
