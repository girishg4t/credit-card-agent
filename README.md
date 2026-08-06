# Credit Card Sales Voice Agent

Runnable frontend and backend for a LiveKit-powered AI voice agent that can talk to credit card customers using supplied customer data.

## Prerequisites

- Python 3.10+
- Node.js 20+
- A LiveKit Cloud project or self-hosted LiveKit server
- An OpenAI API key for the voice agent

## Setup

1. Copy environment files:

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
```

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

Run these in separate terminals.

1. Backend API:

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

2. LiveKit agent worker:

```bash
source .venv/bin/activate
python backend/agent.py dev
```

3. Frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`, enter customer data, click `Start voice call`, allow microphone access, and speak with the agent.

## How It Works

- The frontend posts customer data to `POST /api/session`.
- The backend creates a LiveKit room name, dispatches the `credit-card-sales-agent` worker with that customer data, and returns a LiveKit participant token.
- The frontend joins the room with microphone enabled.
- The worker joins the same room and uses OpenAI realtime voice through LiveKit Agents.

## Safety Notes

The agent prompt includes basic sales compliance guardrails: identify itself as an AI assistant, avoid guaranteed approvals, avoid collecting full card numbers or SSNs, and stop if the customer declines.
