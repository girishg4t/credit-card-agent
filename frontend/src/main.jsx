import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveKitRoom, RoomAudioRenderer, ControlBar, useParticipants, useTranscriptions } from '@livekit/components-react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import '@livekit/components-styles';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const languageOptions = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Gujarati', 'Bengali', 'Punjabi', 'Urdu', 'Konkani'];
const datasetOptions = [
  { value: 'debt_collection', label: 'Debt collection' },
  { value: 'credit_card', label: 'Credit card sales' },
];
const providerOptions = [
  { value: 'livekit', label: 'LiveKit' },
  { value: 'agora', label: 'Agora ConvoAI' },
];
const agoraMllmOptions = [
  { value: 'gemini', label: 'Gemini Live' },
  { value: 'openai', label: 'OpenAI Realtime' },
];
const personalityOptions = [
  { value: 'friendly', label: 'Friendly advisor' },
  { value: 'formal', label: 'Formal banker' },
  { value: 'supportive', label: 'Supportive collections' },
  { value: 'sales', label: 'Sales focused' },
];
const llmModelOptions = [
  { value: 'provider_default', label: 'Provider default' },
  { value: 'gpt_realtime', label: 'OpenAI Realtime' },
  { value: 'gemini_live', label: 'Gemini Live' },
  { value: 'claude', label: 'Claude' },
];
const sttProviderOptions = [
  { value: 'provider_default', label: 'Provider default' },
  { value: 'deepgram', label: 'Deepgram' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
];
const ttsProviderOptions = [
  { value: 'provider_default', label: 'Provider default' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'cartesia', label: 'Cartesia' },
];
const voiceOptions = [
  { value: 'warm_female', label: 'Warm female' },
  { value: 'calm_male', label: 'Calm male' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'energetic', label: 'Energetic' },
];
const openaiVoiceByStyle = {
  warm_female: 'coral',
  calm_male: 'ash',
  neutral: 'alloy',
  energetic: 'verse',
};
const geminiVoiceByStyle = {
  warm_female: 'Aoede',
  calm_male: 'Charon',
  neutral: 'Puck',
  energetic: 'Fenrir',
};
const turnDetectionOptions = [
  { value: 'server_vad', label: 'Server VAD' },
  { value: 'semantic_vad', label: 'Semantic VAD' },
  { value: 'manual', label: 'Manual push-to-talk' },
];
const latencyModeOptions = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'fast', label: 'Fastest response' },
  { value: 'quality', label: 'Higher quality' },
];
const toolOptions = [
  {
    value: 'eligibility_check',
    label: 'Eligibility check',
    description: 'Lets the agent verify whether the customer is eligible before pitching, collecting, or continuing the workflow.',
    alternative: 'Agora can do this by calling your backend from the LLM/tool layer, but there is no Agora-specific eligibility tool built into RTC.',
  },
  {
    value: 'card_recommendation',
    label: 'Card recommendation',
    description: 'Lets the agent use customer context to recommend the best card or offer instead of reading a static script.',
    alternative: 'Agora can pass the same context into ConvoAI instructions; richer recommendation logic should still live in your backend.',
  },
  {
    value: 'payment_plan',
    label: 'Payment plan',
    description: 'Lets the agent discuss installment or minimum-due options for debt collection calls.',
    alternative: 'Agora can support this through prompt instructions and external business APIs, not through a native payment-plan feature.',
  },
  {
    value: 'crm_notes',
    label: 'CRM notes',
    description: 'Lets the agent create structured notes after or during the call for follow-up and audit.',
    alternative: 'Agora provides media/session plumbing; CRM writeback should be implemented in your backend or webhook flow.',
  },
];
const providerFeatureCatalog = {
  livekit: [
    {
      name: 'Agent framework',
      status: 'Native',
      description: 'LiveKit Agents runs a Python/Node agent as a realtime room participant with jobs, dispatch, and agent lifecycle support.',
      alternative: 'Agora uses ConvoAI sessions for the agent, while app-specific orchestration remains mostly in your backend.',
    },
    {
      name: 'Turn detection',
      status: 'Configurable',
      description: 'Controls how the agent detects when the customer is done speaking. Semantic VAD can make conversations feel more natural than simple silence detection.',
      alternative: 'Agora ConvoAI exposes server VAD settings in the mLLM config; semantic turn detection depends on the selected model/provider.',
    },
    {
      name: 'Interruptions',
      status: 'Strong support',
      description: 'Allows customer barge-in so the agent stops talking when the user interrupts.',
      alternative: 'Agora can support interruption behavior through realtime model/VAD configuration, but exact behavior depends on the mLLM provider.',
    },
    {
      name: 'Tool calling',
      status: 'First-class',
      description: 'LiveKit Agents can define tools in code and wire them into the LLM workflow for business actions like eligibility checks or CRM updates.',
      alternative: 'Agora can use model/tool capabilities through ConvoAI and your backend, but the app must own the tool orchestration pattern.',
    },
    {
      name: 'Observability',
      status: 'Built-in cloud support',
      description: 'LiveKit Cloud supports transcripts, traces, and agent observability for debugging call quality and agent behavior.',
      alternative: 'Agora provides RTC analytics and logs; agent transcript/trace evaluation should be added through your app and model provider logs.',
    },
    {
      name: 'Phone calls',
      status: 'SIP ready',
      description: 'LiveKit SIP can dial phone numbers and bring phone participants into the same room as the AI agent.',
      alternative: 'This app currently supports Agora only for browser audio sessions, not phone dial-out.',
    },
  ],
  agora: [
    {
      name: 'RTC media quality',
      status: 'Core strength',
      description: 'Agora is optimized for low-latency global voice/video transport, mobile SDK quality, and production RTC sessions.',
      alternative: 'LiveKit also uses WebRTC and can be self-hosted, but Agora is especially mature as a managed RTC network.',
    },
    {
      name: 'ConvoAI session',
      status: 'Native',
      description: 'Agora ConvoAI joins an RTC channel as an AI agent and connects to Gemini Live or OpenAI Realtime through mLLM config.',
      alternative: 'LiveKit uses an agent worker dispatched into a room, where the agent code owns the AI pipeline.',
    },
    {
      name: 'mLLM provider choice',
      status: 'Configurable',
      description: 'Lets you choose the realtime model provider used by Agora ConvoAI, currently Gemini Live or OpenAI Realtime in this app.',
      alternative: 'LiveKit can integrate many providers through agent SDK plugins or direct model SDK usage.',
    },
    {
      name: 'Voice configuration',
      status: 'Provider mapped',
      description: 'The selected voice style maps to the underlying Gemini/OpenAI voice parameter sent to Agora ConvoAI.',
      alternative: 'LiveKit maps the same UI voice style to the OpenAI realtime voice used by the LiveKit agent.',
    },
    {
      name: 'Backend integrations',
      status: 'Required for tools',
      description: 'Agora does not expose these business tools as native RTC features. Eligibility, CRM updates, and payment-plan logic should run through your backend.',
      alternative: 'LiveKit Agents has a more explicit tool-calling programming model in the agent process.',
    },
    {
      name: 'Phone calls',
      status: 'Not enabled here',
      description: 'This app currently starts Agora as a browser audio session. Phone dial-out is blocked for Agora in the backend.',
      alternative: 'Use LiveKit in this app when you need SIP phone dial-out.',
    },
  ],
};
const defaultAgentConfig = {
  personality: 'friendly',
  llm_model: 'provider_default',
  stt_provider: 'provider_default',
  tts_provider: 'provider_default',
  voice: 'warm_female',
  turn_detection: 'server_vad',
  interruptions: true,
  latency_mode: 'balanced',
  tools: ['eligibility_check', 'card_recommendation'],
  save_transcript: true,
};

function customerCanDial(customer) {
  return Boolean(customer) && customer.allow_voice_calls && !customer.do_not_call && !customer.contact_restricted && Boolean(customer.phone);
}

function providerCallMode(provider) {
  return 'browser';
}

function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value;
}

function withoutPrompt(payload) {
  const { prompt_override: _promptOverride, ...rest } = payload;
  return rest;
}

function providerVoiceLabel(provider, mllmProvider, voiceStyle) {
  if (provider === 'agora' && mllmProvider === 'gemini') {
    return geminiVoiceByStyle[voiceStyle] || 'Provider default';
  }
  return openaiVoiceByStyle[voiceStyle] || 'Provider default';
}

function AgentConnectionStatus() {
  const participants = useParticipants();
  const agentOnline = participants.some((participant) => participant.identity.includes('agent'));

  return (
    <div className={agentOnline ? 'agent-status ready' : 'agent-status loading'}>
      <span className={agentOnline ? 'dot online' : 'dot'} />
      <div>
        <strong>{agentOnline ? 'Agent ready' : 'Connecting AI agent...'}</strong>
        <span>{agentOnline ? 'You can start talking now.' : 'Please wait. Start speaking once the agent is ready.'}</span>
      </div>
    </div>
  );
}

function TranscriptPanel({ onTranscriptChange }) {
  const transcriptions = useTranscriptions();

  useEffect(() => {
    onTranscriptChange(transcriptions.map((entry) => {
      const identity = entry.participantInfo?.identity || '';
      return {
        speaker: identity.toLowerCase().includes('agent') ? 'Agent' : 'Customer',
        identity,
        text: entry.text,
        stream_id: entry.streamInfo?.id || null,
      };
    }));
  }, [transcriptions]);

  return (
    <section className="transcript-panel" aria-live="polite">
      <div className="transcript-header">
        <strong>Live transcript</strong>
        <span>{transcriptions.length ? `${transcriptions.length} updates` : 'Waiting for speech'}</span>
      </div>
      <div className="transcript-feed">
        {transcriptions.length === 0 && (
          <p className="transcript-empty">Transcript will appear here once the agent or customer speaks.</p>
        )}
        {transcriptions.map((entry) => {
          const identity = entry.participantInfo?.identity || '';
          const isAgent = identity.toLowerCase().includes('agent');
          return (
            <article className={isAgent ? 'transcript-line agent' : 'transcript-line customer'} key={entry.streamInfo?.id || `${identity}-${entry.text}`}>
              <span>{isAgent ? 'Agent' : 'Customer'}</span>
              <p>{entry.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AgoraCallRoom({ session }) {
  const [status, setStatus] = useState('Connecting to Agora...');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    let microphoneTrack;

    async function join() {
      try {
        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio') {
            user.audioTrack?.play();
            if (!cancelled) {
              setStatus('Agent audio connected. You can start talking now.');
            }
          }
        });

        client.on('user-unpublished', (_user, mediaType) => {
          if (mediaType === 'audio' && !cancelled) {
            setStatus('Agent audio paused. Waiting for audio...');
          }
        });

        await client.join(session.agora_app_id, session.agora_channel, session.token, session.agora_uid);
        microphoneTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await client.publish([microphoneTrack]);
        if (!cancelled) {
          setStatus('Microphone connected. Waiting for agent audio...');
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught.message || 'Could not connect to Agora.');
          setStatus('Agora connection failed.');
        }
      }
    }

    join();

    return () => {
      cancelled = true;
      if (microphoneTrack) {
        microphoneTrack.stop();
        microphoneTrack.close();
      }
      client.leave().catch(() => {});
    };
  }, [session]);

  return (
    <section className="agora-room">
      <div className={error ? 'agent-status loading' : 'agent-status ready'}>
        <span className={error ? 'dot' : 'dot online'} />
        <div>
          <strong>{error ? 'Agora connection issue' : 'Agora ConvoAI session'}</strong>
          <span>{status}</span>
        </div>
      </div>
      <p className="call-hint">Allow microphone access. Agora ConvoAI joins this channel as the AI agent and responds over audio.</p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function App() {
  const [customers, setCustomers] = useState([]);
  const [datasetType, setDatasetType] = useState('debt_collection');
  const [agentProvider, setAgentProvider] = useState('livekit');
  const [agoraMllmProvider, setAgoraMllmProvider] = useState('gemini');
  const [agentConfig, setAgentConfig] = useState(defaultAgentConfig);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [lastCallMode, setLastCallMode] = useState('browser');
  const [session, setSession] = useState(null);
  const [startedCallPayload, setStartedCallPayload] = useState(null);
  const [callStartedAt, setCallStartedAt] = useState(null);
  const [callTranscript, setCallTranscript] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [evaluationStatus, setEvaluationStatus] = useState('');
  const [pendingCall, setPendingCall] = useState(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [error, setError] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const selectedCustomer = customers.find((customer) => customer.customer_id === selectedCustomerId);
  const isDebtList = datasetType === 'debt_collection';
  const isCreditCardList = datasetType === 'credit_card';
  const isListPage = datasetType === 'debt_collection' || datasetType === 'credit_card';
  const listTitle = isDebtList ? 'Debt queue' : 'Credit card sales queue';
  const listSubtitle = isDebtList ? 'Customers ready for agent calls' : 'Customers ready for card offer calls';

  function updateAgentConfig(key, value) {
    setAgentConfig((current) => ({ ...current, [key]: value }));
  }

  function toggleAgentTool(tool) {
    setAgentConfig((current) => {
      const hasTool = current.tools.includes(tool);
      return {
        ...current,
        tools: hasTool ? current.tools.filter((item) => item !== tool) : [...current.tools, tool],
      };
    });
  }

  function selectedAgentConfig() {
    if (agentProvider === 'agora') {
      const { tools: _tools, ...configWithoutTools } = agentConfig;
      return configWithoutTools;
    }
    return agentConfig;
  }

  function buildCallPayload(customer, language, promptOverride) {
    return {
      customer_id: customer.customer_id,
      language: language || customer.preferred_language || 'English',
      dataset_type: datasetType,
      provider: agentProvider,
      agora_mllm_provider: agoraMllmProvider,
      agent_config: selectedAgentConfig(),
      prompt_override: promptOverride,
    };
  }

  function buildProviderPayloadPreview(customer, language, promptOverride, mode) {
    const selectedCallLanguage = language || customer.preferred_language || 'English';
    const customerContext = {
      summary: {
        ...customer,
        selected_language: selectedCallLanguage,
      },
      language: selectedCallLanguage,
      prompt_type: datasetType,
      agent_config: selectedAgentConfig(),
    };

    const livekitMetadata = {
      customer: customerContext,
      call_type: mode === 'phone' ? 'phone' : 'browser',
      prompt_type: datasetType,
      language: selectedCallLanguage,
      agent_config: selectedAgentConfig(),
    };

    const agoraPreview = {
      channel: 'Generated by backend when call starts',
      user_uid: 'Generated by backend when call starts',
      agent_uid: 'Generated by backend when call starts',
      mllm_provider: agoraMllmProvider,
      provider_voice: providerVoiceLabel('agora', agoraMllmProvider, agentConfig.voice),
      greeting_message: `Hello ${customer.name}, I am an AI assistant calling about ${datasetType === 'credit_card' ? 'your pre-approved credit card offer' : 'your credit card account'}. I will speak in ${selectedCallLanguage}. Is now a good time to talk?`,
      customer_context: customerContext,
      instructions_source: 'Prompt text is hidden in this UI preview. Backend sends the edited prompt as instructions when present.',
    };

    return { livekitMetadata, agoraPreview };
  }

  useEffect(() => {
    document.title = session ? `Live call: ${session.customer.name}` : 'Credit Card Voice Agent';
  }, [session]);

  useEffect(() => {
    async function loadCustomers() {
      setError('');
      setIsLoadingCustomers(true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/customers?dataset_type=${encodeURIComponent(datasetType)}`);
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.detail || 'Could not load customers.');
        }
        setCustomers(body);
        const firstCustomer = body[0];
        setSelectedCustomerId(firstCustomer?.customer_id || '');
        setSelectedLanguage(firstCustomer?.preferred_language || 'English');
      } catch (caught) {
        setError(caught.message);
      } finally {
        setIsLoadingCustomers(false);
      }
    }

    loadCustomers();
  }, [datasetType]);

  async function loadEvaluations() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/evaluations`);
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || 'Could not load evaluations.');
      }
      setEvaluations(body);
    } catch (caught) {
      setEvaluationStatus(caught.message);
    }
  }

  useEffect(() => {
    loadEvaluations();
  }, []);

  function changeDataset(nextDatasetType) {
    setError('');
    setCustomers([]);
    setSelectedCustomerId('');
    setSelectedLanguage('English');
    setIsLoadingCustomers(true);
    setDatasetType(nextDatasetType);
    setSession(null);
    setPendingCall(null);
  }

  function changeCustomer(customerId) {
    const nextCustomer = customers.find((customer) => customer.customer_id === customerId);
    setSelectedCustomerId(customerId);
    setSelectedLanguage(nextCustomer?.preferred_language || 'English');
  }

  async function openCallModal(customer) {
    const rowLanguage = selectedLanguage || customer.preferred_language || 'English';
    setError('');
    setSelectedCustomerId(customer.customer_id);
    setPromptDraft('');
    setIsLoadingPrompt(true);
    setPendingCall({
      customer,
      language: rowLanguage,
      mode: providerCallMode(agentProvider),
      agentConfig: selectedAgentConfig(),
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/prompt-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer.customer_id,
          language: rowLanguage,
          dataset_type: datasetType,
          agent_config: agentConfig,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || 'Could not load prompt preview.');
      }
      setPromptDraft(body.prompt || '');
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsLoadingPrompt(false);
    }
  }

  function closeCallModal() {
    if (!isStarting) {
      setPendingCall(null);
      setPromptDraft('');
    }
  }

  async function confirmCall(event) {
    if (!pendingCall) {
      return;
    }
    await startCall(pendingCall.mode, event, pendingCall.customer, pendingCall.language, promptDraft);
    setPendingCall(null);
    setPromptDraft('');
  }

  async function startCall(mode, event, customerOverride = selectedCustomer, languageOverride = selectedLanguage, promptOverride = null) {
    event?.preventDefault();
    setError('');

    if (!customerOverride) {
      setError('Select a customer first.');
      return;
    }

    setSelectedCustomerId(customerOverride.customer_id);
    setSelectedLanguage(languageOverride || customerOverride.preferred_language || 'English');

    setLastCallMode(mode);
    setIsStarting(true);

    try {
      const endpoint = mode === 'phone' ? '/api/call' : '/api/session';
      const requestPayload = buildCallPayload(customerOverride, languageOverride, promptOverride);
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || `Could not start the ${agentProvider === 'agora' ? 'Agora ConvoAI' : 'LiveKit'} session.`);
      }

      setStartedCallPayload(requestPayload);
      setCallStartedAt(new Date().toISOString());
      setCallTranscript([]);
      setEvaluationStatus('');
      setSession(body);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsStarting(false);
    }
  }

  async function saveEvaluationIfEnabled() {
    if (!session || !startedCallPayload?.agent_config?.save_transcript) {
      return false;
    }

    const endedAt = new Date();
    const startedAt = callStartedAt ? new Date(callStartedAt) : endedAt;
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
    const payload = {
      provider: session.provider,
      room_name: session.room_name,
      customer_id: session.customer.customer_id,
      customer_name: session.customer.name,
      dataset_type: startedCallPayload.dataset_type,
      language: startedCallPayload.language,
      started_at: callStartedAt,
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      agent_config: startedCallPayload.agent_config,
      transcript: callTranscript,
      metrics: {
        transcript_updates: callTranscript.length,
        phone_call_started: session.phone_call_started,
        provider_voice: providerVoiceLabel(session.provider, startedCallPayload.agora_mllm_provider, startedCallPayload.agent_config.voice),
      },
    };

    const response = await fetch(`${API_BASE_URL}/api/evaluations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.detail || 'Could not save evaluation.');
    }
    await loadEvaluations();
    return true;
  }

  async function endCall() {
    try {
      const saved = await saveEvaluationIfEnabled();
      setEvaluationStatus(saved ? 'Saved transcript and evaluation metrics.' : 'Call ended. Metrics saving was disabled.');
    } catch (caught) {
      setEvaluationStatus(caught.message);
    } finally {
      setSession(null);
      setStartedCallPayload(null);
      setCallStartedAt(null);
      setCallTranscript([]);
    }
  }

  function renderPayloadPreviews() {
    if (!pendingCall) {
      return null;
    }

    const endpoint = pendingCall.mode === 'phone' ? '/api/call' : '/api/session';
    const apiPayload = withoutPrompt(buildCallPayload(pendingCall.customer, pendingCall.language, promptDraft));
    const { livekitMetadata, agoraPreview } = buildProviderPayloadPreview(
      pendingCall.customer,
      pendingCall.language,
      promptDraft,
      pendingCall.mode,
    );

    return (
      <section className="payload-preview-group" aria-label="Call payload previews">
        <details className="payload-preview">
          <summary>View exact frontend API payload sent to {endpoint}</summary>
          <pre>{JSON.stringify(apiPayload, null, 2)}</pre>
        </details>

        <details className="payload-preview">
          <summary>View LiveKit agent dispatch metadata</summary>
          <pre>{JSON.stringify(livekitMetadata, null, 2)}</pre>
        </details>

        <details className="payload-preview">
          <summary>View Agora ConvoAI agent parameters</summary>
          <pre>{JSON.stringify(agoraPreview, null, 2)}</pre>
        </details>
      </section>
    );
  }

  function renderProviderFeatures() {
    const features = providerFeatureCatalog[agentProvider] || [];
    const otherProvider = agentProvider === 'agora' ? 'LiveKit' : 'Agora';

    return (
      <section className="provider-feature-panel" aria-label={`${agentProvider === 'agora' ? 'Agora' : 'LiveKit'} feature comparison`}>
        <div className="feature-panel-header">
          <div>
            <p className="eyebrow">Provider feature comparison</p>
            <h3>{agentProvider === 'agora' ? 'Agora ConvoAI options' : 'LiveKit agent options'}</h3>
          </div>
          <span className="count-pill">Compared with {otherProvider}</span>
        </div>
        <div className="feature-card-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.name} title={`${feature.description} Alternative: ${feature.alternative}`}>
              <div className="feature-card-title">
                <strong>{feature.name}</strong>
                <span>{feature.status}</span>
              </div>
              <p>{feature.description}</p>
              <details className="feature-help">
                <summary>What is the alternative?</summary>
                <p>{feature.alternative}</p>
              </details>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderStartedConfigSummary() {
    const config = startedCallPayload?.agent_config || agentConfig;
    const tools = config.tools || [];

    return (
      <section className="started-config" aria-label="Agent options selected for this call">
        <div className="started-config-header">
          <div>
            <p className="eyebrow">Selected agent options</p>
            <h3>Configuration used for this call</h3>
          </div>
          <span className="count-pill">{startedCallPayload?.provider === 'agora' ? 'Agora' : 'LiveKit'}</span>
        </div>

        <section className="customer-summary live-customer-summary">
          <div><strong>Provider</strong><span>{startedCallPayload?.provider === 'agora' ? 'Agora ConvoAI' : 'LiveKit'}</span></div>
          {startedCallPayload?.provider === 'agora' && <div><strong>Agora model</strong><span>{startedCallPayload.agora_mllm_provider === 'openai' ? 'OpenAI Realtime' : 'Gemini Live'}</span></div>}
          <div><strong>Language</strong><span>{startedCallPayload?.language || session.language || selectedLanguage}</span></div>
          <div><strong>Call type</strong><span>{startedCallPayload?.dataset_type === 'credit_card' ? 'Credit card sales' : 'Debt collection'}</span></div>
          <div><strong>Personality</strong><span>{optionLabel(personalityOptions, config.personality)}</span></div>
          <div><strong>LLM model</strong><span>{optionLabel(llmModelOptions, config.llm_model)}</span></div>
          <div><strong>STT</strong><span>{optionLabel(sttProviderOptions, config.stt_provider)}</span></div>
          <div><strong>TTS</strong><span>{optionLabel(ttsProviderOptions, config.tts_provider)}</span></div>
          <div><strong>Voice style</strong><span>{optionLabel(voiceOptions, config.voice)}</span></div>
          <div><strong>Provider voice</strong><span>{providerVoiceLabel(startedCallPayload?.provider, startedCallPayload?.agora_mllm_provider, config.voice)}</span></div>
          <div><strong>Turn detection</strong><span>{optionLabel(turnDetectionOptions, config.turn_detection)}</span></div>
          <div><strong>Interruptions</strong><span>{config.interruptions ? 'Allowed' : 'Disabled'}</span></div>
          <div><strong>Latency mode</strong><span>{optionLabel(latencyModeOptions, config.latency_mode)}</span></div>
          {startedCallPayload?.provider === 'livekit' && <div><strong>Tools</strong><span>{tools.length ? tools.map((tool) => optionLabel(toolOptions, tool)).join(', ') : 'None'}</span></div>}
          <div><strong>Metrics</strong><span>{config.save_transcript ? 'Transcript and metrics enabled' : 'Not saved'}</span></div>
        </section>

        {startedCallPayload && (
          <details className="payload-preview">
            <summary>View exact payload used to start this call</summary>
            <pre>{JSON.stringify(withoutPrompt(startedCallPayload), null, 2)}</pre>
          </details>
        )}
      </section>
    );
  }

  function renderEvaluationHistory() {
    return (
      <section className="panel evaluation-history" aria-label="Saved call evaluations">
        <div className="setup-header">
          <div>
            <p className="eyebrow">Saved evaluations</p>
            <h2>Agora vs LiveKit comparison history</h2>
          </div>
          <span className="count-pill">{evaluations.length} saved</span>
        </div>

        {evaluationStatus && <p className="call-hint">{evaluationStatus}</p>}

        {evaluations.length === 0 ? (
          <p className="transcript-empty">No saved evaluations yet. Start and end a call with transcript/metrics enabled to save one here.</p>
        ) : (
          <div className="evaluation-list">
            {evaluations.slice(0, 6).map((evaluation) => (
              <article className="evaluation-card" key={evaluation.id || evaluation.room_name}>
                <div className="feature-card-title">
                  <strong>{evaluation.provider === 'agora' ? 'Agora ConvoAI' : 'LiveKit'} - {evaluation.customer_name || evaluation.customer_id}</strong>
                  <span>{evaluation.duration_seconds ?? 0}s</span>
                </div>
                <p>{evaluation.dataset_type === 'credit_card' ? 'Credit card sales' : 'Debt collection'} · {evaluation.language || 'Language not set'} · {evaluation.metrics?.transcript_updates ?? 0} transcript updates</p>
                <section className="customer-summary evaluation-summary">
                  <div><strong>Voice</strong><span>{evaluation.metrics?.provider_voice || optionLabel(voiceOptions, evaluation.agent_config?.voice)}</span></div>
                  <div><strong>Turn detection</strong><span>{optionLabel(turnDetectionOptions, evaluation.agent_config?.turn_detection)}</span></div>
                  <div><strong>Interruptions</strong><span>{evaluation.agent_config?.interruptions ? 'Allowed' : 'Disabled'}</span></div>
                  <div><strong>Latency</strong><span>{optionLabel(latencyModeOptions, evaluation.agent_config?.latency_mode)}</span></div>
                </section>
                <details className="payload-preview">
                  <summary>View saved transcript and metrics</summary>
                  <pre>{JSON.stringify(evaluation, null, 2)}</pre>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (session) {
    return (
      <main className="page call-page">
        <section className="call-card">
          <div className="call-header">
            <p className="eyebrow">Live {session.provider === 'agora' ? 'Agora ConvoAI' : 'LiveKit'} {session.customer.dataset_type === 'credit_card' ? 'credit card sales' : 'collections'} conversation</p>
            <h1>{session.phone_call_started ? 'Calling' : 'Testing'} {session.customer.name}</h1>
            <p className="muted">Room: {session.room_name}</p>
            <p className="muted">Language: {session.language || selectedLanguage}</p>
            {session.provider === 'agora' && <p className="muted">Agora model: {session.agora_mllm_provider === 'openai' ? 'OpenAI Realtime' : 'Gemini Live'}</p>}
            {session.provider === 'agora' && <p className="muted">Agent ID: {session.agora_agent_id || session.agora_agent_uid}</p>}
            {session.phone_call_started && <p className="muted">Dialed: {session.customer.phone}</p>}
          </div>

          <section className="customer-summary live-customer-summary" aria-label="Customer information for this call">
            <div><strong>Customer ID</strong><span>{session.customer.customer_id}</span></div>
            <div><strong>Name</strong><span>{session.customer.name}</span></div>
            <div><strong>DOB</strong><span>{session.customer.date_of_birth || 'Not available'}</span></div>
            <div><strong>Phone</strong><span>{session.customer.phone || 'Missing'}</span></div>
            <div><strong>Provider</strong><span>{session.provider === 'agora' ? 'Agora ConvoAI' : 'LiveKit'}</span></div>
            <div><strong>Scenario</strong><span>{session.customer.scenario || '-'}</span></div>
            {session.customer.dataset_type === 'debt_collection' && <div><strong>Outstanding</strong><span>INR {session.customer.outstanding_amount ?? '-'}</span></div>}
            {session.customer.dataset_type === 'debt_collection' && <div><strong>Minimum due</strong><span>INR {session.customer.minimum_due ?? '-'}</span></div>}
            {session.customer.dataset_type === 'debt_collection' && <div><strong>DPD</strong><span>{session.customer.days_past_due ?? '-'}</span></div>}
            {session.customer.dataset_type === 'credit_card' && <div><strong>Recommended card</strong><span>{session.customer.recommended_card || '-'}</span></div>}
          </section>

          {renderStartedConfigSummary()}

          {session.provider === 'agora' ? (
            <AgoraCallRoom session={session} />
          ) : (
            <LiveKitRoom
              serverUrl={session.livekit_url}
              token={session.token}
              connect={true}
              audio={{
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }}
              video={false}
              onDisconnected={endCall}
            >
              <RoomAudioRenderer />
              <AgentConnectionStatus />
              <TranscriptPanel onTranscriptChange={setCallTranscript} />
              <p className="call-hint">Allow microphone access. The agent will greet you when it is ready, then you can speak normally.</p>
              <ControlBar variation="minimal" controls={{ camera: false, screenShare: false }} />
            </LiveKitRoom>
          )}

          <div className="actions call-actions">
            <button className="secondary" onClick={endCall}>End call</button>
            <button onClick={(event) => startCall(lastCallMode, event)} disabled={isStarting}>
              {isStarting ? 'Starting...' : 'Make call again'}
            </button>
            <button className="light-button" onClick={endCall}>Change customer</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={isListPage ? 'page debt-page' : 'page'}>
      <section className={isListPage ? 'hero debt-hero' : 'hero'}>
        <p className="eyebrow">AI voice agent</p>
        <h1>Credit card calls with customer context</h1>
        <p>
          Select a provider, call type, and customer from the JSON datasets, then test in your browser or dial through LiveKit SIP.
        </p>
      </section>

      <form className="panel call-setup">
        <div className="setup-header">
          <div>
            <p className="eyebrow">Call setup</p>
            <h2>Select provider, call type, customer, and language</h2>
          </div>
          <span className="count-pill">{isLoadingCustomers ? 'Loading...' : `${customers.length} customers`}</span>
        </div>

        <div className={isListPage ? 'selector-grid top-controls debt-control-row' : 'selector-grid top-controls'}>
          <label>
            Agent provider
            <select value={agentProvider} onChange={(event) => setAgentProvider(event.target.value)}>
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {agentProvider === 'agora' && (
            <label>
              Agora model
              <select value={agoraMllmProvider} onChange={(event) => setAgoraMllmProvider(event.target.value)}>
                {agoraMllmOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}

          <label>
            Call type
            <select value={datasetType} onChange={(event) => changeDataset(event.target.value)}>
              {datasetOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {isListPage && (
            <label>
              Language
              <select
                disabled={isLoadingCustomers}
                value={selectedLanguage}
                onChange={(event) => setSelectedLanguage(event.target.value)}
              >
                {languageOptions.map((language) => (
                  <option key={language} value={language}>{language}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {renderProviderFeatures()}

        <section className="agent-config-screen" aria-label="Agent configuration before the call">
          <div className="config-heading">
            <div>
              <p className="eyebrow">Agent configuration</p>
              <h3>Choose how the AI agent should behave before starting the call</h3>
            </div>
            <button type="button" className="light-button compact-button" onClick={() => setAgentConfig(defaultAgentConfig)}>
              Reset defaults
            </button>
          </div>

          <div className="config-grid">
            <label>
              Agent personality
              <select value={agentConfig.personality} onChange={(event) => updateAgentConfig('personality', event.target.value)}>
                {personalityOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              LLM / realtime model
              <select value={agentConfig.llm_model} onChange={(event) => updateAgentConfig('llm_model', event.target.value)}>
                {llmModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Speech-to-text
              <select value={agentConfig.stt_provider} onChange={(event) => updateAgentConfig('stt_provider', event.target.value)}>
                {sttProviderOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Text-to-speech
              <select value={agentConfig.tts_provider} onChange={(event) => updateAgentConfig('tts_provider', event.target.value)}>
                {ttsProviderOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Voice style
              <select value={agentConfig.voice} onChange={(event) => updateAgentConfig('voice', event.target.value)}>
                {voiceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Turn detection
              <select value={agentConfig.turn_detection} onChange={(event) => updateAgentConfig('turn_detection', event.target.value)}>
                {turnDetectionOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Latency mode
              <select value={agentConfig.latency_mode} onChange={(event) => updateAgentConfig('latency_mode', event.target.value)}>
                {latencyModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              Interruptions
              <select value={agentConfig.interruptions ? 'enabled' : 'disabled'} onChange={(event) => updateAgentConfig('interruptions', event.target.value === 'enabled')}>
                <option value="enabled">Allow customer barge-in</option>
                <option value="disabled">Agent finishes each response</option>
              </select>
            </label>
          </div>

          {agentProvider === 'livekit' ? (
            <div className="config-toggles">
              <div>
                <strong>Tools enabled</strong>
                <span>Select the tools this LiveKit agent can use during the call.</span>
              </div>
              <div className="tool-chip-grid">
                {toolOptions.map((option) => (
                  <article className="tool-card" key={option.value} title={`${option.description} Alternative: ${option.alternative}`}>
                    <label className="tool-chip">
                      <input
                        type="checkbox"
                        checked={agentConfig.tools.includes(option.value)}
                        onChange={() => toggleAgentTool(option.value)}
                      />
                      {option.label}
                    </label>
                    <p>{option.description}</p>
                    <details className="feature-help">
                      <summary>Agora alternative</summary>
                      <p>{option.alternative}</p>
                    </details>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <p className="call-hint">
              Agora tools are not shown because these business actions are not native Agora RTC options. Eligibility checks, CRM notes, and payment-plan actions should be implemented through your backend or model-provider tool calling.
            </p>
          )}

          <label className="config-checkbox">
            <input
              type="checkbox"
              checked={agentConfig.save_transcript}
              onChange={(event) => updateAgentConfig('save_transcript', event.target.checked)}
            />
            Save transcript and evaluation metrics for Agora vs LiveKit comparison
          </label>
        </section>

        {!isListPage && (
        <div className="selector-grid">
          {!isListPage && (
            <label>
              Customer
              <select
                disabled={isLoadingCustomers || customers.length === 0}
                value={selectedCustomerId}
                onChange={(event) => changeCustomer(event.target.value)}
              >
                {!selectedCustomerId && <option value="">Select a customer</option>}
                {customers.map((customer) => (
                  <option key={customer.customer_id} value={customer.customer_id}>
                    {customer.customer_id} - {customer.name} - {customer.recommended_card || customer.scenario}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Language
            <select
              disabled={isLoadingCustomers}
              value={selectedLanguage}
              onChange={(event) => setSelectedLanguage(event.target.value)}
            >
              {languageOptions.map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>
          </label>
        </div>
        )}

        {isListPage && (
          <section className="debt-list" aria-label={`${isDebtList ? 'Debt collection' : 'Credit card sales'} customer list`}>
            <div className="debt-list-header">
              <div>
                <p className="eyebrow">{listTitle}</p>
                <h3>{listSubtitle}</h3>
              </div>
              <span>{isLoadingCustomers ? 'Loading customers...' : `${customers.length} customers`}</span>
            </div>

            <div className="debt-table-wrap">
              <table className="debt-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>{isDebtList ? 'Scenario' : 'Recommended card'}</th>
                    <th>{isDebtList ? 'Outstanding' : 'Offered limit'}</th>
                    <th>{isDebtList ? 'DPD' : 'Annual fee'}</th>
                    {isCreditCardList && <th>Match score</th>}
                    <th>Language</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const rowLanguage = selectedLanguage || customer.preferred_language || 'English';
                    const canDial = customerCanDial(customer);
                    return (
                      <tr key={customer.customer_id} className={customer.customer_id === selectedCustomerId ? 'selected-row' : ''}>
                        <td data-label="Customer">
                          <strong>{customer.name}</strong>
                          <span>{customer.customer_id}</span>
                        </td>
                        <td data-label={isDebtList ? 'Scenario' : 'Recommended card'}>{isDebtList ? (customer.scenario || '-') : (customer.recommended_card || '-')}</td>
                        <td data-label={isDebtList ? 'Outstanding' : 'Offered limit'}>INR {isDebtList ? (customer.outstanding_amount ?? '-') : (customer.offered_credit_limit ?? '-')}</td>
                        <td data-label={isDebtList ? 'DPD' : 'Annual fee'}>{isDebtList ? (customer.days_past_due ?? '-') : `INR ${customer.annual_fee ?? '-'}`}</td>
                        {isCreditCardList && <td data-label="Match score">{customer.match_score ?? '-'}</td>}
                        <td data-label="Language">{rowLanguage}</td>
                        <td data-label="Status">
                          <span className={canDial ? 'status-pill clear' : 'status-pill blocked'}>{canDial ? 'Callable' : 'Restricted'}</span>
                        </td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            <button type="button" className="call-button" disabled={isStarting} onClick={() => openCallModal(customer)}>
                              Call customer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!isListPage && selectedCustomer && (
          <section className="customer-summary">
            <div><strong>Phone</strong><span>{selectedCustomer.phone || 'Missing'}</span></div>
            <div><strong>City</strong><span>{selectedCustomer.city || 'Unknown'}</span></div>
            <div><strong>Dataset language</strong><span>{selectedCustomer.preferred_language || 'Unknown'}</span></div>
            <div><strong>Call language</strong><span>{selectedLanguage}</span></div>
            {datasetType === 'debt_collection' && <div><strong>Outstanding</strong><span>INR {selectedCustomer.outstanding_amount ?? '-'}</span></div>}
            {datasetType === 'debt_collection' && <div><strong>Minimum due</strong><span>INR {selectedCustomer.minimum_due ?? '-'}</span></div>}
            {datasetType === 'debt_collection' && <div><strong>DPD</strong><span>{selectedCustomer.days_past_due ?? '-'}</span></div>}
            {datasetType === 'credit_card' && <div><strong>Recommended card</strong><span>{selectedCustomer.recommended_card || '-'}</span></div>}
            {datasetType === 'credit_card' && <div><strong>Offered limit</strong><span>INR {selectedCustomer.offered_credit_limit ?? '-'}</span></div>}
            {datasetType === 'credit_card' && <div><strong>Annual fee</strong><span>INR {selectedCustomer.annual_fee ?? '-'}</span></div>}
            {datasetType === 'credit_card' && <div><strong>Match score</strong><span>{selectedCustomer.match_score ?? '-'}</span></div>}
            <div><strong>Scenario</strong><span>{selectedCustomer.scenario || '-'}</span></div>
            <div><strong>Priority</strong><span>{selectedCustomer.priority || '-'}</span></div>
          </section>
        )}

        {!isListPage && selectedCustomer && (selectedCustomer.do_not_call || selectedCustomer.contact_restricted || !selectedCustomer.allow_voice_calls) && (
          <p className="warning">This customer is restricted for voice calls. Phone dial-out will be blocked by the backend.</p>
        )}

        {error && <p className="error">{error}</p>}

        {!isListPage && (
          <div className="actions">
            <button type="button" disabled={isStarting || isLoadingCustomers || !selectedCustomer} onClick={(event) => startCall('browser', event)}>
              {isStarting ? 'Starting...' : 'Test in browser'}
            </button>
            <button type="button" className="call-button" disabled={isStarting || isLoadingCustomers || !selectedCustomer || agentProvider === 'agora'} onClick={(event) => startCall('phone', event)}>
              {isStarting ? 'Dialing...' : 'Make phone call'}
            </button>
          </div>
        )}
      </form>

      {renderEvaluationHistory()}

      {pendingCall && (
        <div className="modal-backdrop" role="presentation" onClick={closeCallModal}>
          <section className="call-modal" role="dialog" aria-modal="true" aria-labelledby="call-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="call-modal-header">
              <div>
                <p className="eyebrow">Confirm call</p>
                <h2 id="call-modal-title">{pendingCall.customer.name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeCallModal} aria-label="Close call details">x</button>
            </div>

            <section className="customer-summary modal-summary">
              <div><strong>Customer ID</strong><span>{pendingCall.customer.customer_id}</span></div>
              <div><strong>Phone</strong><span>{pendingCall.customer.phone || 'Missing'}</span></div>
              <div><strong>Provider</strong><span>{agentProvider === 'agora' ? 'Agora ConvoAI' : 'LiveKit'}</span></div>
              {agentProvider === 'agora' && <div><strong>Agora model</strong><span>{agoraMllmProvider === 'gemini' ? 'Gemini Live' : 'OpenAI Realtime'}</span></div>}
              <div><strong>Call mode</strong><span>{pendingCall.mode === 'phone' ? 'Phone call' : 'Browser conversation'}</span></div>
              <div><strong>Language</strong><span>{pendingCall.language}</span></div>
              <div><strong>Personality</strong><span>{optionLabel(personalityOptions, pendingCall.agentConfig.personality)}</span></div>
              <div><strong>LLM model</strong><span>{optionLabel(llmModelOptions, pendingCall.agentConfig.llm_model)}</span></div>
              <div><strong>STT</strong><span>{optionLabel(sttProviderOptions, pendingCall.agentConfig.stt_provider)}</span></div>
              <div><strong>TTS / voice style</strong><span>{optionLabel(ttsProviderOptions, pendingCall.agentConfig.tts_provider)} / {optionLabel(voiceOptions, pendingCall.agentConfig.voice)}</span></div>
              <div><strong>Provider voice</strong><span>{providerVoiceLabel(agentProvider, agoraMllmProvider, pendingCall.agentConfig.voice)}</span></div>
              <div><strong>Turn detection</strong><span>{optionLabel(turnDetectionOptions, pendingCall.agentConfig.turn_detection)}</span></div>
              <div><strong>Interruptions</strong><span>{pendingCall.agentConfig.interruptions ? 'Allowed' : 'Disabled'}</span></div>
              <div><strong>Latency mode</strong><span>{optionLabel(latencyModeOptions, pendingCall.agentConfig.latency_mode)}</span></div>
              {agentProvider === 'livekit' && <div><strong>Tools</strong><span>{pendingCall.agentConfig.tools.length ? pendingCall.agentConfig.tools.map((tool) => optionLabel(toolOptions, tool)).join(', ') : 'None'}</span></div>}
              <div><strong>Metrics</strong><span>{pendingCall.agentConfig.save_transcript ? 'Transcript and metrics enabled' : 'Not saved'}</span></div>
              <div><strong>Scenario</strong><span>{pendingCall.customer.scenario || '-'}</span></div>
              {pendingCall.customer.dataset_type === 'debt_collection' && <div><strong>Outstanding</strong><span>INR {pendingCall.customer.outstanding_amount ?? '-'}</span></div>}
              {pendingCall.customer.dataset_type === 'debt_collection' && <div><strong>Minimum due</strong><span>INR {pendingCall.customer.minimum_due ?? '-'}</span></div>}
              {pendingCall.customer.dataset_type === 'debt_collection' && <div><strong>DPD</strong><span>{pendingCall.customer.days_past_due ?? '-'}</span></div>}
              {pendingCall.customer.dataset_type === 'credit_card' && <div><strong>Recommended card</strong><span>{pendingCall.customer.recommended_card || '-'}</span></div>}
              {pendingCall.customer.dataset_type === 'credit_card' && <div><strong>Offered limit</strong><span>INR {pendingCall.customer.offered_credit_limit ?? '-'}</span></div>}
              {pendingCall.customer.dataset_type === 'credit_card' && <div><strong>Annual fee</strong><span>INR {pendingCall.customer.annual_fee ?? '-'}</span></div>}
              {pendingCall.customer.dataset_type === 'credit_card' && <div><strong>Match score</strong><span>{pendingCall.customer.match_score ?? '-'}</span></div>}
              <div><strong>Status</strong><span>{customerCanDial(pendingCall.customer) ? 'Callable' : 'Restricted for phone dial-out'}</span></div>
            </section>

            {agentProvider === 'agora' && (
              <p className="call-hint">Agora ConvoAI starts a browser audio session. Use LiveKit if you need a real phone dial-out.</p>
            )}

            {renderPayloadPreviews()}

            <p className="call-hint">
              Agent instructions are generated in the background and hidden here. Use the expandable payload sections to review all non-prompt call parameters.
            </p>

            <div className="actions call-modal-actions">
              <button type="button" className="light-button" onClick={closeCallModal}>Cancel</button>
              <button type="button" className="call-button" disabled={isStarting || isLoadingPrompt || !promptDraft.trim()} onClick={confirmCall}>
                {isStarting ? 'Starting...' : 'Start call'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
