# Credit Card Collections Voice Agent

Runnable frontend and backend for a LiveKit-powered AI voice agent that can talk to credit card customers using `debt_collection_100_customers.json`.

## Prerequisites

- Python 3.10+
- Node.js 20+
- A LiveKit Cloud project or self-hosted LiveKit server
- An OpenAI API key for the LiveKit voice agent
- A Google Gemini API key for Agora ConvoAI Gemini Live sessions
- Optional: a LiveKit outbound SIP trunk for dialing real phone numbers

## Setup

1. Copy environment files, or use a repo-root `.env` for backend secrets:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. Fill `backend/.env`:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
OPENAI_API_KEY=your_openai_api_key
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy
LIVEKIT_TURN_DETECTION_TYPE=server_vad
LIVEKIT_SERVER_VAD_THRESHOLD=0.7
LIVEKIT_SERVER_VAD_PREFIX_PADDING_MS=300
LIVEKIT_SERVER_VAD_SILENCE_DURATION_MS=400
LIVEKIT_SEMANTIC_VAD_EAGERNESS=medium
LIVEKIT_SIP_KRISP_ENABLED=true
GOOGLE_GEMINI_API_KEY=your_google_gemini_api_key
AGORA_GEMINI_URL=wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
AGORA_GEMINI_MODEL=gemini-3.1-flash-live-preview
AGORA_GEMINI_VOICE=Charon
LIVEKIT_SIP_TRUNK_ID=your_livekit_outbound_sip_trunk_id
```

`LIVEKIT_SIP_TRUNK_ID` is required only for `Call customer phone`. Browser testing works without it.

Agora ConvoAI lets you choose `OpenAI Realtime` or `Gemini Live` in the UI. Gemini Live is selected by default. The Agora docs currently show `gemini-3.1-flash-live-preview`; set `AGORA_GEMINI_MODEL` to a different Gemini Live model ID if your Google/Agora account supports it.

LiveKit browser calls use WebRTC echo cancellation, noise suppression, and automatic gain control. LiveKit SIP dial-out enables Krisp by default with `LIVEKIT_SIP_KRISP_ENABLED=true`. For OpenAI Realtime turn detection, `server_vad` is tuned for noisy phone/browser audio; set `LIVEKIT_TURN_DETECTION_TYPE=semantic_vad` if you prefer semantic endpointing.

The backend loads environment variables from both `.env` at the repo root and `backend/.env`.

3. Install backend dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

4. Install frontend dependencies:

```bash
cd frontend
npm install
```

## Run

Quick start all processes in the background:

```bash
scripts/start.sh
```

Stop all processes:

```bash
scripts/stop.sh
```

Runtime logs are written under `.run/logs/`.

Manual run commands are below if you prefer separate terminals.

Run these in separate terminals.

1. Backend API:

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

2. LiveKit agent worker:

```bash
source .venv/bin/activate
python backend/agent.py start
```

3. Frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`, select a customer, then choose one of these actions:

- `Test in browser`: joins a LiveKit room from your browser so you can talk to the agent as the customer.
- `Call customer phone`: dials the selected customer's phone number through LiveKit SIP and joins the room for monitoring.

## How It Works

- The backend loads customers from `debt_collection_100_customers.json`.
- The frontend loads customer summaries from `GET /api/customers`.
- `POST /api/session` creates a browser test room for the selected customer.
- `POST /api/call` creates a room, dispatches the LiveKit agent, and starts an outbound SIP call to the selected customer.
- The worker joins the same room and uses OpenAI realtime voice through LiveKit Agents.

## Safety Notes

The backend blocks phone dial-out for records marked `doNotCall`, `allowVoiceCalls=false`, wrong number, contact restricted, deceased, legal representation, bankruptcy/insolvency, or collections hold. The agent prompt also avoids sensitive data collection and escalates regulated scenarios.
