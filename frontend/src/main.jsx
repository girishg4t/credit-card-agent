import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveKitRoom, RoomAudioRenderer, ControlBar, useParticipants } from '@livekit/components-react';
import '@livekit/components-styles';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const languageOptions = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Gujarati', 'Bengali'];

function ParticipantsBadge() {
  const participants = useParticipants();
  const agentOnline = participants.some((participant) => participant.identity.includes('agent'));

  return (
    <div className="call-status">
      <span className={agentOnline ? 'dot online' : 'dot'} />
      {agentOnline ? 'Agent connected' : 'Waiting for agent'}
    </div>
  );
}

function App() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [lastCallMode, setLastCallMode] = useState('browser');
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const selectedCustomer = customers.find((customer) => customer.customer_id === selectedCustomerId);

  useEffect(() => {
    document.title = session ? `Live call: ${session.customer.name}` : 'Credit Card Collections Agent';
  }, [session]);

  useEffect(() => {
    async function loadCustomers() {
      setError('');
      setIsLoadingCustomers(true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/customers`);
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
  }, []);

  function changeCustomer(customerId) {
    const nextCustomer = customers.find((customer) => customer.customer_id === customerId);
    setSelectedCustomerId(customerId);
    setSelectedLanguage(nextCustomer?.preferred_language || 'English');
  }

  async function startCall(mode, event) {
    event?.preventDefault();
    setError('');

    if (!selectedCustomerId) {
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
        body: JSON.stringify({ customer_id: selectedCustomerId, language: selectedLanguage }),
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
            <p className="eyebrow">Live collections conversation</p>
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
            <ParticipantsBadge />
            <p className="call-hint">Allow microphone access. The agent will greet you when it connects, then you can speak normally.</p>
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
        <h1>Credit card collection calls with customer context</h1>
        <p>
          Select a customer from the JSON dataset, test the agent in your browser, or dial the customer through LiveKit SIP.
        </p>
      </section>

      <form className="panel call-setup">
        <div className="setup-header">
          <div>
            <p className="eyebrow">Call setup</p>
            <h2>Select customer and language</h2>
          </div>
          <span className="count-pill">{customers.length} customers</span>
        </div>

        <div className="selector-grid">
          <label>
            Customer
            <select
              disabled={isLoadingCustomers}
              value={selectedCustomerId}
              onChange={(event) => changeCustomer(event.target.value)}
            >
              {customers.map((customer) => (
                <option key={customer.customer_id} value={customer.customer_id}>
                  {customer.customer_id} - {customer.name} - {customer.scenario}
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
            <div><strong>Outstanding</strong><span>INR {selectedCustomer.outstanding_amount ?? '-'}</span></div>
            <div><strong>Minimum due</strong><span>INR {selectedCustomer.minimum_due ?? '-'}</span></div>
            <div><strong>DPD</strong><span>{selectedCustomer.days_past_due ?? '-'}</span></div>
            <div><strong>Scenario</strong><span>{selectedCustomer.scenario || '-'}</span></div>
            <div><strong>Priority</strong><span>{selectedCustomer.priority || '-'}</span></div>
          </section>
        )}

        {selectedCustomer && (selectedCustomer.do_not_call || selectedCustomer.contact_restricted || !selectedCustomer.allow_voice_calls) && (
          <p className="warning">This customer is restricted for voice calls. Phone dial-out will be blocked by the backend.</p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" disabled={isStarting || isLoadingCustomers} onClick={(event) => startCall('browser', event)}>
            {isStarting ? 'Starting...' : 'Test in browser'}
          </button>
          <button type="button" className="call-button" disabled={isStarting || isLoadingCustomers} onClick={(event) => startCall('phone', event)}>
            {isStarting ? 'Dialing...' : 'Make phone call'}
          </button>
        </div>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
