/**
 * Avatar text resolution: initials > display_name.slice(0,2) > name.slice(0,2) > ''
 *
 * `initials` may hold either ASCII text ("PA") or an emoji ("🦊").
 * Render sites should call `isEmojiAvatar` to decide font sizing.
 */
type AgentAvatarLike = {
  initials?: string
  display_name?: string
  name?: string
}

export function agentAvatarText(agent: AgentAvatarLike): string {
  if (agent.initials) return agent.initials
  if (agent.display_name) return agent.display_name.slice(0, 2)
  if (agent.name) return agent.name.slice(0, 2)
  return ''
}

const EMOJI_RE = /\p{Extended_Pictographic}/u

export function isEmojiAvatar(agent: AgentAvatarLike): boolean {
  const text = (agent.initials ?? '').trim()
  return text.length > 0 && EMOJI_RE.test(text)
}
