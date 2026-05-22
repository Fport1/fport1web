// ACL / ranks — all users in fport1web can start and send messages.
// Rank system reserved for future use.

export function normStrArray(a) {
  return Array.isArray(a)
    ? a.map(String).map(s => s.trim().toLowerCase()).filter(Boolean)
    : []
}

export function getUserRanks(user) {
  const collect = []
  if (Array.isArray(user?.ranks))          collect.push(...user.ranks)
  if (Array.isArray(user?.roles))          collect.push(...user.roles)
  if (Array.isArray(user?.profile?.ranks)) collect.push(...user.profile.ranks)
  if (Array.isArray(user?.profile?.roles)) collect.push(...user.profile.roles)
  return normStrArray(collect)
}

export function canStartConversation(_user) { return true }

export function canSendInConversation(userUid, _user, conversation) {
  if (!conversation || !Array.isArray(conversation.participantUids)) return false
  return conversation.participantUids.includes(userUid)
}
