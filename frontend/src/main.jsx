import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveKitRoom, RoomAudioRenderer, ControlBar, useParticipants, useTranscriptions } from '@livekit/components-react';
import '@livekit/components-styles';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const languageOptions = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Gujarati', 'Bengali', 'Punjabi', 'Urdu', 'Konkani'];
const datasetOptions = [
  { value: 'debt_collection', label: 'Debt collection' },
  { value: 'credit_card', label: 'Credit card sales' },
];

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

function App() {
  const [customers, setCustomers] = useState([]);
  const [datasetType, setDatasetType] = useState('debt_collection');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [lastCallMode, setLastCallMode] = useState('browser');
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const selectedCustomer = customers.find((customer) => customer.customer_id === selectedCustomerId);
  const canStartCall = !isStarting && !isLoadingCustomers && Boolean(selectedCustomer);

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

  async function startCall(mode, event) {
    event?.preventDefault();
    setError('');

    if (!selectedCustomer) {
      setError('Select a customer first.');
      return;
    }

    setLastCallMode(mode);
    setIsStarting(true);

    try {
      const endpoint = mode === 'phone' ? '/api/call' : '/api/session';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selectedCustomer.customer_id, language: selectedLanguage, dataset_type: datasetType }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || 'Could not start the LiveKit session.');
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
            <p className="eyebrow">Live {session.customer.dataset_type === 'credit_card' ? 'credit card sales' : 'collections'} conversation</p>
            <h1>{session.phone_call_started ? 'Calling' : 'Testing'} {session.customer.name}</h1>
            <p className="muted">Room: {session.room_name}</p>
            <p className="muted">Language: {session.language || selectedLanguage}</p>
            {session.phone_call_started && <p className="muted">Dialed: {session.customer.phone}</p>}
          </div>

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
          Select a call type and customer from the JSON datasets, test the agent in your browser, or dial the customer through LiveKit SIP.
        </p>
      </section>

      <form className="panel call-setup">
        <div className="setup-header">
          <div>
            <p className="eyebrow">Call setup</p>
            <h2>Select call type, customer, and language</h2>
          </div>
          <span className="count-pill">{isLoadingCustomers ? 'Loading...' : `${customers.length} customers`}</span>
        </div>

        <label>
          Call type
          <select value={datasetType} onChange={(event) => changeDataset(event.target.value)}>
            {datasetOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div className="selector-grid">
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
          <button type="button" className="call-button" disabled={!canStartCall} onClick={(event) => startCall('phone', event)}>
            {isStarting ? 'Dialing...' : 'Make phone call'}
          </button>
        </div>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
