export function normalizeAgoraTranscript(history) {
  if (!Array.isArray(history)) return [];
  return history.filter((entry) => entry && typeof entry.text === 'string' && entry.text.trim());
}

export function isAgoraAgentTranscript(entry, agentUid) {
  return String(entry?.uid ?? '') === String(agentUid ?? '');
}

export function agoraTranscriptKey(entry, index) {
  return `${entry?.uid ?? 'unknown'}-${entry?.stream_id ?? 'stream'}-${entry?.turn_id ?? index}`;
}
