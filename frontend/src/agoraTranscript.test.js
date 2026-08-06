import test from 'node:test';
import assert from 'node:assert/strict';
import { agoraTranscriptKey, isAgoraAgentTranscript, normalizeAgoraTranscript } from './agoraTranscript.js';

test('normalizes the complete Agora transcript history', () => {
  const history = [{ uid: '10', text: 'Hello', stream_id: 1, turn_id: 2 }, { uid: '20', text: '   ' }, null];
  assert.deepEqual(normalizeAgoraTranscript(history), [history[0]]);
  assert.deepEqual(normalizeAgoraTranscript(null), []);
});

test('classifies numeric and string agent UIDs consistently', () => {
  assert.equal(isAgoraAgentTranscript({ uid: '9000001' }, 9000001), true);
  assert.equal(isAgoraAgentTranscript({ uid: '1000001' }, 9000001), false);
});

test('builds a stable key from Agora transcript fields', () => {
  assert.equal(agoraTranscriptKey({ uid: '7', stream_id: 3, turn_id: 9 }, 0), '7-3-9');
});
