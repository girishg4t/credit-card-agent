import React, { useEffect, useMemo, useState } from 'react';
import { parsePersonaPrompt, serializePersonaPrompt } from './personaPrompt';

function personaLabel(key) {
  return key.split('_').map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(' ');
}

export function AgentPromptEditor({ apiBaseUrl, onClose }) {
  const [snapshot, setSnapshot] = useState(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');

  async function loadPersonas() {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/prompts/debt-collection/personas`);
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || 'Could not load the agent prompt.');
      }
      setSnapshot(body);
      const nextKey = body.personas.some((persona) => persona.key === selectedKey) ? selectedKey : body.personas[0]?.key || '';
      setSelectedKey(nextKey);
      const selected = body.personas.find((persona) => persona.key === nextKey);
      setForm(selected ? parsePersonaPrompt(selected.content) : null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPersonas();
  }, []);

  const selectedPersona = snapshot?.personas.find((persona) => persona.key === selectedKey);
  const serializedPrompt = useMemo(() => form ? serializePersonaPrompt(form) : '', [form]);
  const isDirty = Boolean(selectedPersona) && serializedPrompt !== selectedPersona.content;

  function selectPersona(key) {
    setSelectedKey(key);
    setError('');
    setGeneratedPrompt('');
    setCopyStatus('');
    const selected = snapshot?.personas.find((persona) => persona.key === key);
    setForm(selected ? parsePersonaPrompt(selected.content) : null);
  }

  function updateField(id, value) {
    setGeneratedPrompt('');
    setCopyStatus('');
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field) => field.id === id ? { ...field, value } : field),
    }));
  }

  async function savePrompt() {
    if (!snapshot || !selectedKey || !serializedPrompt.trim()) {
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/prompts/debt-collection/personas/${encodeURIComponent(selectedKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_revision: snapshot.revision, content: serializedPrompt }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || 'Could not save the agent prompt.');
      }
      setSnapshot(body);
      const saved = body.personas.find((persona) => persona.key === selectedKey);
      setForm(saved ? parsePersonaPrompt(saved.content) : form);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function generatePrompt() {
    if (!selectedKey || !serializedPrompt.trim()) {
      return;
    }
    setIsGenerating(true);
    setGeneratedPrompt('');
    setCopyStatus('');
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/prompts/debt-collection/personas/${encodeURIComponent(selectedKey)}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: serializedPrompt }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || 'Could not generate the system prompt.');
      }
      setGeneratedPrompt(body.content);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyGeneratedPrompt() {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopyStatus('Copied');
    } catch {
      setError('Could not copy the generated prompt. Select the preview text and copy it manually.');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !isSaving && !isGenerating && onClose()}>
      <section className="call-modal prompt-modal" role="dialog" aria-modal="true" aria-labelledby="agent-prompt-title" onClick={(event) => event.stopPropagation()}>
        <div className="call-modal-header">
          <div>
            <p className="eyebrow">Debt collection</p>
            <h2 id="agent-prompt-title">Agent Prompt</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={isSaving || isGenerating} aria-label="Close agent prompt editor">x</button>
        </div>

        {isLoading ? (
          <p className="muted">Loading persona prompts...</p>
        ) : (
          <div className="prompt-editor">
            <label className="prompt-editor-persona">
              Persona
              <select value={selectedKey} onChange={(event) => selectPersona(event.target.value)} disabled={isSaving || isGenerating}>
                {snapshot?.personas.map((persona) => (
                  <option key={persona.key} value={persona.key}>{personaLabel(persona.key)}</option>
                ))}
              </select>
            </label>

            <div className="prompt-editor-fields">
              {form?.fields.map((field) => (
                <label key={field.id} className="prompt-editor-field">
                  {field.label}
                  <textarea
                    value={field.value}
                    onChange={(event) => updateField(field.id, event.target.value)}
                    rows={Math.min(5, Math.max(2, Math.ceil(field.value.length / 76)))}
                    disabled={isSaving || isGenerating}
                  />
                </label>
              ))}
            </div>

            {generatedPrompt && (
              <section className="generated-prompt" aria-labelledby="generated-prompt-title">
                <div className="generated-prompt-header">
                  <div>
                    <p className="eyebrow">Generated system prompt</p>
                    <h3 id="generated-prompt-title">{personaLabel(selectedKey)}</h3>
                  </div>
                  <button type="button" className="light-button" onClick={copyGeneratedPrompt}>
                    {copyStatus || 'Copy prompt'}
                  </button>
                </div>
                <textarea readOnly value={generatedPrompt} rows={18} aria-label="Generated system prompt preview" />
                <p className="muted">Generated in memory from agent.md. No Markdown file was changed.</p>
              </section>
            )}
          </div>
        )}

        {error && (
          <div className="prompt-editor-error">
            <span>{error}</span>
            <button type="button" className="light-button" onClick={loadPersonas} disabled={isLoading || isSaving || isGenerating}>Reload</button>
          </div>
        )}

        <div className="actions call-modal-actions prompt-editor-actions">
          <button type="button" className="light-button" onClick={onClose} disabled={isSaving || isGenerating}>Cancel</button>
          <button type="button" className="secondary" onClick={generatePrompt} disabled={isLoading || isSaving || isGenerating || !serializedPrompt.trim()}>
            {isGenerating ? 'Generating...' : 'Generate prompt'}
          </button>
          <button type="button" onClick={savePrompt} disabled={isLoading || isSaving || isGenerating || !isDirty || !serializedPrompt.trim()}>
            {isSaving ? 'Saving...' : 'Save prompt'}
          </button>
        </div>
      </section>
    </div>
  );
}
