import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveKitRoom, RoomAudioRenderer, ControlBar, useParticipants } from '@livekit/components-react';
import '@livekit/components-styles';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const initialCustomer = {
  name: 'Priya Sharma',
  phone: '+1 555 0134',
  city: 'San Jose',
  credit_score_band: '720-760',
  current_card: 'Basic cashback card',
  annual_income_band: '$90k-$120k',
  preferred_benefit: 'travel rewards',
  notes: 'Interested in airport lounge access and no foreign transaction fees.',
};

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
  const [customer, setCustomer] = useState(initialCustomer);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    document.title = session ? `Live call: ${customer.name}` : 'Credit Card Sales Agent';
  }, [customer.name, session]);

  function updateCustomer(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  async function startCall(event) {
    event.preventDefault();
    setError('');
    setIsStarting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer }),
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
          <div>
            <p className="eyebrow">Live sales conversation</p>
            <h1>Talking with {customer.name}</h1>
            <p className="muted">Room: {session.room_name}</p>
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
            <ControlBar variation="minimal" controls={{ camera: false, screenShare: false }} />
          </LiveKitRoom>

          <button className="secondary" onClick={() => setSession(null)}>End call</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AI voice agent</p>
        <h1>Credit card sales calls with customer context</h1>
        <p>
          Add customer details, start a LiveKit room, and speak to the AI sales agent from your browser microphone.
        </p>
      </section>

      <form className="panel" onSubmit={startCall}>
        <div className="grid">
          <label>
            Name
            <input required value={customer.name} onChange={(event) => updateCustomer('name', event.target.value)} />
          </label>
          <label>
            Phone
            <input value={customer.phone} onChange={(event) => updateCustomer('phone', event.target.value)} />
          </label>
          <label>
            City
            <input value={customer.city} onChange={(event) => updateCustomer('city', event.target.value)} />
          </label>
          <label>
            Credit score band
            <input value={customer.credit_score_band} onChange={(event) => updateCustomer('credit_score_band', event.target.value)} />
          </label>
          <label>
            Current card
            <input value={customer.current_card} onChange={(event) => updateCustomer('current_card', event.target.value)} />
          </label>
          <label>
            Income band
            <input value={customer.annual_income_band} onChange={(event) => updateCustomer('annual_income_band', event.target.value)} />
          </label>
          <label className="wide">
            Preferred benefit
            <input value={customer.preferred_benefit} onChange={(event) => updateCustomer('preferred_benefit', event.target.value)} />
          </label>
          <label className="wide">
            Notes
            <textarea rows="4" value={customer.notes} onChange={(event) => updateCustomer('notes', event.target.value)} />
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        <button disabled={isStarting}>{isStarting ? 'Starting...' : 'Start voice call'}</button>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
