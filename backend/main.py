import json
import os
import uuid
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel, Field

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))


AGENT_NAME = "credit-card-sales-agent"


class CustomerData(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    credit_score_band: str | None = Field(default=None, max_length=80)
    current_card: str | None = Field(default=None, max_length=120)
    annual_income_band: str | None = Field(default=None, max_length=80)
    preferred_benefit: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class SessionRequest(BaseModel):
    customer: CustomerData


class SessionResponse(BaseModel):
    livekit_url: str
    token: str
    room_name: str
    participant_name: str


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise HTTPException(status_code=500, detail=f"Missing required environment variable: {name}")
    return value


def customer_payload(customer: CustomerData) -> dict[str, Any]:
    data = customer.model_dump()
    return {key: value for key, value in data.items() if value not in (None, "")}


app = FastAPI(title="Credit Card Sales Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/session", response_model=SessionResponse)
async def create_session(payload: SessionRequest) -> SessionResponse:
    livekit_url = require_env("LIVEKIT_URL")
    api_key = require_env("LIVEKIT_API_KEY")
    api_secret = require_env("LIVEKIT_API_SECRET")

    room_name = f"credit-card-sales-{uuid.uuid4().hex[:12]}"
    participant_name = f"customer-{uuid.uuid4().hex[:8]}"
    metadata = json.dumps({"customer": customer_payload(payload.customer)})

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(participant_name)
        .with_name(payload.customer.name)
        .with_metadata(metadata)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .to_jwt()
    )

    lkapi = api.LiveKitAPI(livekit_url, api_key, api_secret)
    try:
        await lkapi.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name=AGENT_NAME,
                room=room_name,
                metadata=metadata,
            )
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not dispatch LiveKit agent: {exc}") from exc
    finally:
        await lkapi.aclose()

    return SessionResponse(
        livekit_url=livekit_url,
        token=token,
        room_name=room_name,
        participant_name=participant_name,
    )
