import { useTranslation } from 'react-i18next'
import type { AgentConfig } from '../../lib/types'
import { Icon } from '../../components/Icon'
import { TagInput } from '../../components/TagInput'

export function AgentGuardrails({ form, editing, onChange }: {
    form: Partial<AgentConfig>
    editing: boolean
    onChange: (field: keyof AgentConfig, value: unknown) => void
}) {
    const { t } = useTranslation()

    const guardrailAllow = form.guardrail_allow ?? form.guardrail_rules ?? []
    const guardrailDeny = form.guardrail_deny ?? []

    return (
        <div className="section-card">
            <div className="section-card-head">
                <div>
                    <h3 className="section-card-title">{t('agents.section_guardrails')}</h3>
                </div>
            </div>
            <div className="section-card-body">
                <div className="rail-grid">
                    <div className="rail-pane">
                        <div className="rail-head allow">
                            <Icon name="check" size={12} />
                            {t('agents.guardrail_allow')}
                        </div>
                        <div className="rail-body">
                            <TagInput
                                tags={guardrailAllow}
                                onChange={v => { onChange('guardrail_allow', v); onChange('guardrail_rules', v) }}
                                placeholder={t('agents.guardrail_allow_placeholder')}
                                disabled={!editing}
                            />
                        </div>
                    </div>
                    <div className="rail-pane">
                        <div className="rail-head deny">
                            <Icon name="lock" size={12} />
                            {t('agents.guardrail_deny')}
                        </div>
                        <div className="rail-body">
                            <TagInput
                                tags={guardrailDeny}
                                onChange={v => onChange('guardrail_deny', v)}
                                placeholder={t('agents.guardrail_deny_placeholder')}
                                disabled={!editing}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
