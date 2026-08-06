import json
import logging
import os
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Literal

from agora_agent.agentkit.token import generate_convo_ai_token
from agora_token_builder import RtcTokenBuilder
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel, Field

from backend.agent import agent_instructions

REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
load_dotenv(dotenv_path=os.path.join(REPO_ROOT, ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))


logger = logging.getLogger("credit-card-agent")
AGENT_NAME = "credit-card-sales-agent"
DatasetType = Literal["debt_collection", "credit_card"]
VoiceMode = Literal["standard", "realtime"]
AgentProvider = Literal["livekit", "agora"]
DATASET_PATHS: dict[DatasetType, str] = {
    "debt_collection": os.getenv("DEBT_COLLECTION_DATA_PATH", os.getenv("CUSTOMER_DATA_PATH", "debt_collection_100_customers.json")),
    "credit_card": os.getenv("CREDIT_CARD_DATA_PATH", "customers.json"),
}


class CustomerSummary(BaseModel):
    dataset_type: DatasetType = "debt_collection"
    customer_id: str
    name: str
    phone: str | None = None
    city: str | None = None
    preferred_language: str | None = None
    scenario: str | None = None
    priority: str | None = None
    outstanding_amount: float | int | None = None
    minimum_due: float | int | None = None
    days_past_due: int | None = None
    recommended_card: str | None = None
    offered_credit_limit: float | int | None = None
    annual_fee: float | int | None = None
    match_score: float | int | None = None
    allow_voice_calls: bool = False
    do_not_call: bool = False
    contact_restricted: bool = False


class SessionRequest(BaseModel):
    customer_id: str = Field(..., min_length=1, max_length=80)
    language: str | None = Field(default=None, max_length=80)
    dataset_type: DatasetType = "debt_collection"
    voice_mode: VoiceMode = "standard"
    provider: AgentProvider = "livekit"


class PhoneCallRequest(SessionRequest):
    wait_until_answered: bool = False


class SessionResponse(BaseModel):
    provider: AgentProvider = "livekit"
    livekit_url: str | None = None
    token: str
    room_name: str
    participant_name: str
    customer: CustomerSummary
    language: str | None = None
    phone_call_started: bool = False
    voice_mode: VoiceMode = "standard"
    agora_app_id: str | None = None
    agora_channel: str | None = None
    agora_uid: str | None = None
    agora_agent_uid: str | None = None
    agora_agent_id: str | None = None


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise HTTPException(status_code=500, detail=f"Missing required environment variable: {name}")
    return value


def dataset_path_for(dataset_type: DatasetType) -> str:
    configured_path = DATASET_PATHS[dataset_type]
    return configured_path if os.path.isabs(configured_path) else os.path.join(REPO_ROOT, configured_path)


def load_dataset(dataset_type: DatasetType) -> dict[str, Any] | list[dict[str, Any]]:
    dataset_path = dataset_path_for(dataset_type)
    try:
        with open(dataset_path, encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=f"Customer data file not found: {dataset_path}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Customer data file is invalid JSON: {exc}") from exc


def all_customer_records(dataset_type: DatasetType) -> list[dict[str, Any]]:
    dataset = load_dataset(dataset_type)
    if dataset_type == "credit_card":
        if not isinstance(dataset, list):
            raise HTTPException(status_code=500, detail="Credit card customer data file must contain a customer array")
        return dataset

    if not isinstance(dataset, dict):
        raise HTTPException(status_code=500, detail="Debt collection customer data file must contain an object")
    customers = dataset.get("customers")
    if not isinstance(customers, list):
        raise HTTPException(status_code=500, detail="Customer data file must contain a customers array")
    return customers


def summarize_customer(record: dict[str, Any], dataset_type: DatasetType = "debt_collection") -> CustomerSummary:
    if dataset_type == "credit_card":
        customer = record.get("customerInformation", {})
        contact = record.get("contact", {})
        eligibility = record.get("eligibility", {})
        recommended_card = eligibility.get("recommendedCard", {})
        ai_context = record.get("aiContext", {})

        return CustomerSummary(
            dataset_type=dataset_type,
            customer_id=record.get("customerId") or customer.get("customerId", ""),
            name=customer.get("fullName", "Unknown Customer"),
            phone=contact.get("phone"),
            city=customer.get("city"),
            preferred_language=contact.get("preferredCallLanguage") or customer.get("preferredLanguage"),
            scenario="Credit card offer",
            priority=ai_context.get("recommendedConversationStyle"),
            recommended_card=recommended_card.get("cardName"),
            offered_credit_limit=recommended_card.get("offeredCreditLimit"),
            annual_fee=recommended_card.get("annualFee"),
            match_score=recommended_card.get("matchScore"),
            allow_voice_calls=bool(contact.get("voiceConsentOnFile")) and not bool(contact.get("dncRegistered")),
            do_not_call=bool(contact.get("dncRegistered")) or bool(contact.get("marketingCallOptOut")),
            contact_restricted=not bool(contact.get("phoneVerified", True)),
        )

    customer = record.get("customer", {})
    account = (record.get("accounts") or [{}])[0]
    case = record.get("collectionCase", {})
    preferences = record.get("communicationPreferences", {})
    compliance = record.get("compliance", {})

    return CustomerSummary(
        dataset_type=dataset_type,
        customer_id=customer.get("customerId", ""),
        name=customer.get("fullName", "Unknown Customer"),
        phone=customer.get("phone"),
        city=customer.get("city"),
        preferred_language=customer.get("preferredLanguage"),
        scenario=case.get("scenario"),
        priority=case.get("priority"),
        outstanding_amount=account.get("outstandingAmount"),
        minimum_due=account.get("minimumDue"),
        days_past_due=account.get("daysPastDue"),
        allow_voice_calls=bool(preferences.get("allowVoiceCalls")),
        do_not_call=bool(preferences.get("doNotCall")),
        contact_restricted=bool(compliance.get("contactRestricted")),
    )


def record_customer_id(record: dict[str, Any], dataset_type: DatasetType) -> str | None:
    if dataset_type == "credit_card":
        return record.get("customerId") or record.get("customerInformation", {}).get("customerId")
    return record.get("customer", {}).get("customerId")


def find_customer_record(customer_id: str, dataset_type: DatasetType) -> dict[str, Any]:
    for record in all_customer_records(dataset_type):
        if record_customer_id(record, dataset_type) == customer_id:
            return record
    raise HTTPException(status_code=404, detail=f"Customer not found: {customer_id}")


def assert_customer_can_be_called(record: dict[str, Any], dataset_type: DatasetType) -> None:
    summary = summarize_customer(record, dataset_type)
    if dataset_type == "credit_card":
        contact = record.get("contact", {})
        blocked_reasons = []
        if not summary.phone:
            blocked_reasons.append("missing phone number")
        if not summary.allow_voice_calls:
            blocked_reasons.append("voice calls are not allowed")
        if summary.do_not_call:
            blocked_reasons.append("customer is marked do-not-call or marketing opt-out")
        if summary.contact_restricted:
            blocked_reasons.append("phone number is not verified")
        if contact.get("preferredCommunication") and contact.get("preferredCommunication") != "Voice Call":
            blocked_reasons.append("customer does not prefer voice calls")
        if blocked_reasons:
            raise HTTPException(status_code=409, detail="Cannot call customer: " + ", ".join(blocked_reasons))
        return

    preferences = record.get("communicationPreferences", {})
    compliance = record.get("compliance", {})
    fraud_and_dispute = record.get("fraudAndDispute", {})
    customer = record.get("customer", {})

    blocked_reasons = []
    if not summary.phone:
        blocked_reasons.append("missing phone number")
    if not summary.allow_voice_calls:
        blocked_reasons.append("voice calls are not allowed")
    if summary.do_not_call:
        blocked_reasons.append("customer is marked do-not-call")
    if preferences.get("wrongNumberFlag"):
        blocked_reasons.append("phone number is marked wrong")
    if summary.contact_restricted:
        blocked_reasons.append("contact is compliance restricted")
    if customer.get("deceasedFlag"):
        blocked_reasons.append("customer is marked deceased")
    if customer.get("legalRepresentationFlag"):
        blocked_reasons.append("customer has legal representation")
    if customer.get("bankruptcyOrInsolvencyFlag"):
        blocked_reasons.append("customer has bankruptcy or insolvency flag")
    if fraud_and_dispute.get("collectionsHold"):
        blocked_reasons.append("collections hold is active")

    if blocked_reasons:
        raise HTTPException(status_code=409, detail="Cannot call customer: " + ", ".join(blocked_reasons))


def customer_payload(record: dict[str, Any], language: str | None, dataset_type: DatasetType) -> dict[str, Any]:
    summary = summarize_customer(record, dataset_type).model_dump()
    if language:
        summary["selected_language"] = language
    return {
        "summary": summary,
        "record": record,
        "language": language or summary.get("preferred_language"),
        "prompt_type": dataset_type,
    }


async def create_livekit_session(
    record: dict[str, Any],
    *,
    dial_phone: bool,
    dataset_type: DatasetType,
    language: str | None = None,
    voice_mode: VoiceMode = "standard",
    wait_until_answered: bool = False,
) -> SessionResponse:
    if dial_phone:
        assert_customer_can_be_called(record, dataset_type)

    summary = summarize_customer(record, dataset_type)
    livekit_url = require_env("LIVEKIT_URL")
    api_key = require_env("LIVEKIT_API_KEY")
    api_secret = require_env("LIVEKIT_API_SECRET")

    room_prefix = "debt-collection" if dataset_type == "debt_collection" else "credit-card-offer"
    room_name = f"{room_prefix}-{summary.customer_id.lower()}-{uuid.uuid4().hex[:8]}"
    participant_name = f"operator-{uuid.uuid4().hex[:8]}"
    selected_language = language or summary.preferred_language
    metadata = json.dumps({
        "customer": customer_payload(record, selected_language, dataset_type),
        "call_type": "phone" if dial_phone else "browser",
        "prompt_type": dataset_type,
        "language": selected_language,
        "voice_mode": voice_mode,
    })

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(participant_name)
        .with_name("Operator")
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

        if dial_phone:
            trunk_id = require_env("LIVEKIT_SIP_TRUNK_ID")
            await lkapi.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    sip_trunk_id=trunk_id,
                    sip_call_to=summary.phone,
                    room_name=room_name,
                    participant_identity=f"phone-{summary.customer_id}",
                    participant_name=summary.name,
                    participant_metadata=json.dumps({"customer_id": summary.customer_id}),
                    wait_until_answered=wait_until_answered,
                    play_ringtone=True,
                )
            )
    except HTTPException:
        raise
    except Exception as exc:
        action = "start phone call" if dial_phone else "dispatch LiveKit agent"
        raise HTTPException(status_code=502, detail=f"Could not {action}: {exc}") from exc
    finally:
        await lkapi.aclose()

    return SessionResponse(
        provider="livekit",
        livekit_url=livekit_url,
        token=token,
        room_name=room_name,
        participant_name=participant_name,
        customer=summary,
        language=selected_language,
        phone_call_started=dial_phone,
        voice_mode=voice_mode,
    )


def start_agora_agent_session(
    *,
    app_id: str,
    app_certificate: str,
    channel: str,
    agent_uid: str,
    user_uid: str,
    instructions: str,
    greeting_message: str,
    name: str,
) -> str:
    token_ttl = int(os.getenv("AGORA_TOKEN_TTL_SECONDS", "3600"))
    agent_token = generate_convo_ai_token(
        app_id=app_id,
        app_certificate=app_certificate,
        channel_name=channel,
        account=agent_uid,
        token_expire=token_ttl,
        privilege_expire=token_ttl,
    )
    body = {
        "name": name,
        "properties": {
            "channel": channel,
            "token": agent_token,
            "agent_rtc_uid": agent_uid,
            "remote_rtc_uids": [user_uid],
            "enable_string_uid": True,
            "idle_timeout": int(os.getenv("AGORA_AGENT_IDLE_TIMEOUT", "60")),
            "mllm": {
                "enable": True,
                "url": os.getenv("OPENAI_REALTIME_URL", "wss://api.openai.com/v1/realtime"),
                "api_key": require_env("OPENAI_API_KEY"),
                "params": {
                    "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime"),
                    "voice": os.getenv("OPENAI_REALTIME_VOICE", "alloy"),
                    "instructions": instructions,
                    "input_audio_transcription": {
                        "model": os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"),
                    },
                },
                "turn_detection": {
                    "mode": "server_vad",
                    "server_vad_config": {
                        "prefix_padding_ms": 800,
                        "silence_duration_ms": 640,
                        "threshold": 0.5,
                    },
                },
                "greeting_message": greeting_message,
                "input_modalities": ["audio", "text"],
                "output_modalities": ["text", "audio"],
                "vendor": "openai",
            },
        },
    }
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.agora.io/api/conversational-ai-agent/v2/projects/{app_id}/join",
        data=data,
        method="POST",
        headers={
            "Authorization": f"agora token={agent_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Agora API returned {exc.code}: {detail}") from exc

    return payload.get("agent_id") or payload.get("id") or name


async def create_agora_session(
    record: dict[str, Any],
    *,
    dial_phone: bool,
    dataset_type: DatasetType,
    language: str | None = None,
) -> SessionResponse:
    if dial_phone:
        raise HTTPException(status_code=400, detail="Agora provider currently supports browser calls only. Choose LiveKit for phone dial-out.")

    summary = summarize_customer(record, dataset_type)
    selected_language = language or summary.preferred_language
    app_id = require_env("APPID")
    app_certificate = require_env("APP_CERTIFICATE")

    channel_prefix = "agora-debt" if dataset_type == "debt_collection" else "agora-card"
    channel = f"{channel_prefix}-{summary.customer_id.lower()}-{uuid.uuid4().hex[:8]}"
    user_uid = f"user-{uuid.uuid4().hex[:8]}"
    agent_uid = f"agent-{uuid.uuid4().hex[:8]}"
    name = f"card-agent-{uuid.uuid4().hex[:8]}"

    customer_context = customer_payload(record, selected_language, dataset_type)
    instructions = agent_instructions(customer_context)
    greeting_message = (
        f"Hello {summary.name}, I am an AI assistant calling about "
        f"{'your pre-approved credit card offer' if dataset_type == 'credit_card' else 'your credit card account'}. "
        f"I will speak in {selected_language or 'English'}. Is now a good time to talk?"
    )
    expires_at = int(time.time()) + int(os.getenv("AGORA_TOKEN_TTL_SECONDS", "3600"))
    token = RtcTokenBuilder.buildTokenWithAccount(app_id, app_certificate, channel, user_uid, 1, expires_at)

    try:
        import asyncio

        agent_id = await asyncio.to_thread(
            start_agora_agent_session,
            app_id=app_id,
            app_certificate=app_certificate,
            channel=channel,
            agent_uid=agent_uid,
            user_uid=user_uid,
            instructions=instructions,
            greeting_message=greeting_message,
            name=name,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not start Agora ConvoAI agent: {exc}") from exc

    return SessionResponse(
        provider="agora",
        token=token,
        room_name=channel,
        participant_name=user_uid,
        customer=summary,
        language=selected_language,
        phone_call_started=False,
        voice_mode="realtime",
        agora_app_id=app_id,
        agora_channel=channel,
        agora_uid=user_uid,
        agora_agent_uid=agent_uid,
        agora_agent_id=agent_id,
    )


app = FastAPI(title="Credit Card Collections Agent API")

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


@app.get("/api/customers", response_model=list[CustomerSummary])
def list_customers(dataset_type: DatasetType = "debt_collection") -> list[CustomerSummary]:
    return [summarize_customer(record, dataset_type) for record in all_customer_records(dataset_type)]


@app.post("/api/session", response_model=SessionResponse)
async def create_session(payload: SessionRequest) -> SessionResponse:
    record = find_customer_record(payload.customer_id, payload.dataset_type)
    logger.info(
        "api_provider=%s endpoint=/api/session mode=browser dataset=%s customer_id=%s",
        payload.provider,
        payload.dataset_type,
        payload.customer_id,
    )
    if payload.provider == "agora":
        return await create_agora_session(record, dial_phone=False, dataset_type=payload.dataset_type, language=payload.language)
    return await create_livekit_session(
        record,
        dial_phone=False,
        dataset_type=payload.dataset_type,
        language=payload.language,
        voice_mode=payload.voice_mode,
    )


@app.post("/api/call", response_model=SessionResponse)
async def call_customer(payload: PhoneCallRequest) -> SessionResponse:
    record = find_customer_record(payload.customer_id, payload.dataset_type)
    logger.info(
        "api_provider=%s endpoint=/api/call mode=phone dataset=%s customer_id=%s",
        payload.provider,
        payload.dataset_type,
        payload.customer_id,
    )
    if payload.provider == "agora":
        return await create_agora_session(record, dial_phone=True, dataset_type=payload.dataset_type, language=payload.language)
    return await create_livekit_session(
        record,
        dial_phone=True,
        dataset_type=payload.dataset_type,
        language=payload.language,
        voice_mode=payload.voice_mode,
        wait_until_answered=payload.wait_until_answered,
    )
