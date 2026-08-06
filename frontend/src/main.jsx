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

function customerCanDial(customer) {
  return Boolean(customer) && customer.allow_voice_calls && !customer.do_not_call && !customer.contact_restricted && Boolean(customer.phone);
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

function TranscriptPanel() {
  const transcriptions = useTranscriptions();

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
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [lastCallMode, setLastCallMode] = useState('browser');
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const selectedCustomer = customers.find((customer) => customer.customer_id === selectedCustomerId);
  const canStartCall = !isStarting && !isLoadingCustomers && Boolean(selectedCustomer);
  const isDebtList = datasetType === 'debt_collection';

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

  function changeDataset(nextDatasetType) {
    setError('');
    setCustomers([]);
    setSelectedCustomerId('');
    setSelectedLanguage('English');
    setIsLoadingCustomers(true);
    setDatasetType(nextDatasetType);
    setSession(null);
  }

  function changeCustomer(customerId) {
    const nextCustomer = customers.find((customer) => customer.customer_id === customerId);
    setSelectedCustomerId(customerId);
    setSelectedLanguage(nextCustomer?.preferred_language || 'English');
  }

  async function startCall(mode, event, customerOverride = selectedCustomer, languageOverride = selectedLanguage) {
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
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerOverride.customer_id,
          language: languageOverride || customerOverride.preferred_language || 'English',
          dataset_type: datasetType,
          provider: agentProvider,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || `Could not start the ${agentProvider === 'agora' ? 'Agora ConvoAI' : 'LiveKit'} session.`);
      }

      setSession(body);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsStarting(false);
    }
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
            {session.provider === 'agora' && <p className="muted">Agent ID: {session.agora_agent_id || session.agora_agent_uid}</p>}
            {session.phone_call_started && <p className="muted">Dialed: {session.customer.phone}</p>}
          </div>

          {session.provider === 'agora' ? (
            <AgoraCallRoom session={session} />
          ) : (
            <LiveKitRoom
              serverUrl={session.livekit_url}
              token={session.token}
              connect={true}
              audio={true}
              video={false}
              onDisconnected={() => setSession(null)}
            >
              <RoomAudioRenderer />
              <AgentConnectionStatus />
              <TranscriptPanel />
              <p className="call-hint">Allow microphone access. The agent will greet you when it is ready, then you can speak normally.</p>
              <ControlBar variation="minimal" controls={{ camera: false, screenShare: false }} />
            </LiveKitRoom>
          )}

          <div className="actions call-actions">
            <button className="secondary" onClick={() => setSession(null)}>End call</button>
            <button onClick={(event) => startCall(lastCallMode, event)} disabled={isStarting}>
              {isStarting ? 'Starting...' : 'Make call again'}
            </button>
            <button className="light-button" onClick={() => setSession(null)}>Change customer</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
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

        <div className="selector-grid">
          <label>
            Agent provider
            <select value={agentProvider} onChange={(event) => setAgentProvider(event.target.value)}>
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Call type
            <select value={datasetType} onChange={(event) => changeDataset(event.target.value)}>
              {datasetOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="selector-grid">
          <label>
            Customer
            <select
              disabled={isLoadingCustomers || customers.length === 0 || isDebtList}
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

        {isDebtList && (
          <section className="debt-list" aria-label="Debt collection customer list">
            <div className="debt-list-header">
              <div>
                <p className="eyebrow">Debt queue</p>
                <h3>Customers ready for agent calls</h3>
              </div>
              <span>{isLoadingCustomers ? 'Loading customers...' : `${customers.length} rows`}</span>
            </div>

            <div className="debt-table-wrap">
              <table className="debt-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Scenario</th>
                    <th>Outstanding</th>
                    <th>DPD</th>
                    <th>Language</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const rowLanguage = customer.preferred_language || selectedLanguage || 'English';
                    const canDial = customerCanDial(customer);
                    return (
                      <tr key={customer.customer_id} className={customer.customer_id === selectedCustomerId ? 'selected-row' : ''}>
                        <td data-label="Customer">
                          <strong>{customer.name}</strong>
                          <span>{customer.customer_id}</span>
                        </td>
                        <td data-label="Scenario">{customer.scenario || '-'}</td>
                        <td data-label="Outstanding">INR {customer.outstanding_amount ?? '-'}</td>
                        <td data-label="DPD">{customer.days_past_due ?? '-'}</td>
                        <td data-label="Language">{rowLanguage}</td>
                        <td data-label="Status">
                          <span className={canDial ? 'status-pill clear' : 'status-pill blocked'}>{canDial ? 'Callable' : 'Restricted'}</span>
                        </td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            <button type="button" disabled={isStarting} onClick={(event) => startCall('browser', event, customer, rowLanguage)}>
                              Browser
                            </button>
                            <button type="button" className="call-button" disabled={isStarting || !canDial || agentProvider === 'agora'} onClick={(event) => startCall('phone', event, customer, rowLanguage)}>
                              Phone
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

        {selectedCustomer && (
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

        {selectedCustomer && (selectedCustomer.do_not_call || selectedCustomer.contact_restricted || !selectedCustomer.allow_voice_calls) && (
          <p className="warning">This customer is restricted for voice calls. Phone dial-out will be blocked by the backend.</p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" disabled={!canStartCall} onClick={(event) => startCall('browser', event)}>
            {isStarting ? 'Starting...' : 'Test in browser'}
          </button>
          <button type="button" className="call-button" disabled={!canStartCall || agentProvider === 'agora'} onClick={(event) => startCall('phone', event)}>
            {isStarting ? 'Dialing...' : 'Make phone call'}
          </button>
        </div>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
