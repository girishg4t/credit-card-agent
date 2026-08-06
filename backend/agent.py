import json
import os
import re

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai
from openai.types.beta.realtime.session import TurnDetection

REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
load_dotenv(dotenv_path=os.path.join(REPO_ROOT, ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

DEBT_PROMPT_PATH = os.path.join(REPO_ROOT, "debt-collection-voice-agent-prompt.md")
CREDIT_CARD_PROMPT_PATH = os.path.join(REPO_ROOT, "CardMate_AI_Relationship_Manager_System_Prompt.md")
OPENAI_VOICE_BY_STYLE = {
    "warm_female": "coral",
    "calm_male": "ash",
    "neutral": "alloy",
    "energetic": "verse",
}


def read_prompt_template(path: str) -> str:
    with open(path, encoding="utf-8") as file:
        return file.read()


def first_present(*values, default: str = "Not provided") -> str:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return str(value)
    return default


def rupees(value) -> str:
    if value is None or value == "":
        return "Not provided"
    try:
        return f"Rs. {float(value):,.0f}"
    except (TypeError, ValueError):
        return str(value)


def yes_no(value) -> str:
    if value is None:
        return "Not provided"
    return "yes" if bool(value) else "no"


def bullet_list(values) -> str:
    if not values:
        return "- Not provided"
    if isinstance(values, str):
        return f"- {values}"
    return "\n".join(f"- {value}" for value in values)


def render_double_curly_template(template: str, values: dict[str, str]) -> str:
    def replace(match: re.Match) -> str:
        key = match.group(1)
        return str(values.get(key, "Not provided"))

    return re.sub(r"\{\{([a-zA-Z0-9_]+)\}\}", replace, template)


def debt_persona(record: dict, summary: dict) -> str:
    scenario = (summary.get("scenario") or record.get("collectionCase", {}).get("scenario") or "").upper()
    account = (record.get("accounts") or [{}])[0]
    customer = record.get("customer", {})
    segment = (customer.get("customerSegment") or "").upper()
    days_past_due = account.get("daysPastDue") or summary.get("days_past_due") or 0

    if scenario in {"FRAUD_REPORTED", "IDENTITY_THEFT", "DISPUTE", "CARD_NEVER_USED"}:
        return "FRAUD_CLAIMANT"
    if scenario == "JOB_LOSS":
        return "JOB_LOSS_DISTRESSED"
    if scenario in {"HARDSHIP", "MEDICAL_EMERGENCY"}:
        return "LIFE_EVENT_DISTRESSED"
    if scenario in {"MULTIPLE_OVERDUE_ACCOUNTS", "MISSED_EMI_INSTALLMENT", "PAYMENT_PLAN_REQUEST"}:
        return "OVERLEVERAGED_JUGGLER"
    if scenario in {"BROKEN_PROMISE", "MULTIPLE_BROKEN_PROMISES", "PROMISE_TO_PAY", "CHANGE_PTP_DATE"}:
        return "CHRONIC_ROLLER"
    if scenario in {"NO_ANSWER", "CUSTOMER_HANGUP", "EMAIL_ONLY_REQUEST"}:
        return "GHOST_DISENGAGED"
    if scenario in {"REJECTED_ALL_OFFERS", "ABUSIVE_CUSTOMER"}:
        return "STRATEGIC_DEFAULTER"
    if scenario in {"SETTLEMENT_NEGOTIATION", "SETTLEMENT_APPROVED_PENDING"} or days_past_due >= 720:
        return "LONGTAIL_DEFAULTER"
    if segment in {"HNI", "PREMIUM"}:
        return "HNI_PREMIUM"
    if customer.get("age") and customer.get("age") <= 24:
        return "STUDENT_FIRST_JOBBER"
    return "FORGETFUL_PAYER"


def render_debt_prompt(customer: dict, language: str) -> str:
    template = read_prompt_template(DEBT_PROMPT_PATH)
    summary = customer.get("summary", {})
    record = customer.get("record", {})
    account = (record.get("accounts") or [{}])[0]
    offers = record.get("offers", {})
    preferences = record.get("communicationPreferences", {})
    case = record.get("collectionCase", {})
    payments = record.get("payments") or record.get("paymentHistory") or []
    last_payment_date = "Not provided"
    if payments and isinstance(payments, list):
        last_payment = payments[-1]
        last_payment_date = first_present(last_payment.get("paymentDate"), last_payment.get("date"))

    hardship_programs = "None"
    if offers.get("hardshipEligible"):
        hardship_programs = first_present(
            offers.get("hardshipProgram"),
            offers.get("hardshipOptions"),
            case.get("nextBestAction"),
            default="Hardship support available; follow bank-approved options",
        )

    rendered = template
    rendered = rendered.replace("ACTIVE_PERSONA: <choose ONE from the enum below>", f"ACTIVE_PERSONA: {debt_persona(record, summary)}")
    rendered = rendered.replace("CUSTOMER_NAME: <name>", f"CUSTOMER_NAME: {first_present(summary.get('name'), record.get('customer', {}).get('fullName'))}")
    rendered = rendered.replace("OUTSTANDING_AMOUNT: <₹ amount>", f"OUTSTANDING_AMOUNT: {rupees(summary.get('outstanding_amount') or account.get('outstandingAmount'))}")
    rendered = rendered.replace("DAYS_PAST_DUE: <number>", f"DAYS_PAST_DUE: {first_present(summary.get('days_past_due'), account.get('daysPastDue'))}")
    rendered = rendered.replace("MINIMUM_DUE: <₹ amount>", f"MINIMUM_DUE: {rupees(summary.get('minimum_due') or account.get('minimumDue'))}")
    rendered = rendered.replace("LAST_PAYMENT_DATE: <date>", f"LAST_PAYMENT_DATE: {last_payment_date}")
    rendered = rendered.replace("SETTLEMENT_AUTHORITY: <max discount % the agent may offer, e.g. 0% / 20% / 40%>", f"SETTLEMENT_AUTHORITY: {offers.get('maximumSettlementDiscountPercent', 0)}%")
    rendered = rendered.replace("HARDSHIP_PROGRAMS_AVAILABLE: <e.g. 3-month moratorium; EMI restructure at X%; none>", f"HARDSHIP_PROGRAMS_AVAILABLE: {hardship_programs}")
    rendered = rendered.replace("CALLBACK_NUMBER: <number>", f"CALLBACK_NUMBER: {first_present(os.getenv('CALLBACK_NUMBER'), os.getenv('SUPPORT_PHONE'), preferences.get('callbackNumber'), summary.get('phone'))}")
    rendered = rendered.replace("LANGUAGE: <primary language; agent may mirror customer's language switch>", f"LANGUAGE: {language}")

    context = {
        "summary": summary,
        "collectionCase": case,
        "communicationPreferences": preferences,
        "compliance": record.get("compliance", {}),
        "financialAssessment": record.get("financialAssessment", {}),
        "fraudAndDispute": record.get("fraudAndDispute", {}),
        "analytics": record.get("analytics", {}),
    }
    return f"{rendered}\n\n---\n\n## Dynamic customer context for this call\n\n```json\n{json.dumps(context, indent=2)}\n```".strip()


def current_cards_summary(cards: list[dict]) -> str:
    if not cards:
        return "- Not provided"
    lines = []
    for card in cards[:5]:
        lines.append(
            f"- {first_present(card.get('cardName'))}, issuer {first_present(card.get('issuer'))}, "
            f"tier {first_present(card.get('cardTier'))}, usage {first_present(card.get('cardUsage'))}"
        )
    return "\n".join(lines)


def eligible_card_alternatives(cards: list[dict], recommended_card_id: str | None) -> str:
    alternatives = [card for card in cards if card.get("cardId") != recommended_card_id]
    if not alternatives:
        return "- Not provided"
    return "\n".join(
        f"- {first_present(card.get('cardName'))}: annual fee {rupees(card.get('annualFee'))}, estimated annual reward value {rupees(card.get('estimatedAnnualRewardValue'))}"
        for card in alternatives[:5]
    )


def objections_summary(objections: list[dict]) -> str:
    if not objections:
        return "- Not provided"
    return "\n".join(
        f"- Objection: {first_present(item.get('objection'))}. Suggested response: {first_present(item.get('suggestedResponse'))}"
        for item in objections[:5]
    )


def render_credit_card_prompt(customer: dict, language: str) -> str:
    template = read_prompt_template(CREDIT_CARD_PROMPT_PATH)
    record = customer.get("record", {})
    customer_info = record.get("customerInformation", {})
    banking = record.get("bankingProfile", {})
    behavior = record.get("behaviour", {})
    spending = record.get("spendingBehaviour", {})
    lifestyle = record.get("lifestyle", {})
    eligibility = record.get("eligibility", {})
    ai_context = record.get("aiContext", {})
    conversation = record.get("conversationIntelligence", {})
    recommended_card = eligibility.get("recommendedCard", {})
    preapproved_offer = (eligibility.get("preApprovedOffers") or [{}])[0]
    summary = customer.get("summary", {})
    customer_name = first_present(customer_info.get("fullName"), summary.get("name"))
    eligible_cards = eligibility.get("eligibleCards") or []
    recommended_card_id = recommended_card.get("cardId")
    config_values = {
        "CUSTOMER_NAME": customer_name,
        "AGE": first_present(customer_info.get("age")),
        "GENDER": first_present(customer_info.get("gender")),
        "CUSTOMER_SEGMENT": first_present(customer_info.get("customerSegment")),
        "PREFERRED_LANGUAGE": language,
        "CITY": first_present(customer_info.get("city")),
        "OCCUPATION": first_present(customer_info.get("occupation")),
        "COMPANY": first_present(customer_info.get("company")),
        "DESIGNATION": first_present(customer_info.get("designation")),
        "ANNUAL_INCOME": first_present(customer_info.get("annualIncomeDisplay"), rupees(customer_info.get("annualIncome"))),
        "CUSTOMER_SINCE": first_present(banking.get("customerSince")),
        "RELATIONSHIP_TYPE": first_present(banking.get("relationshipType")),
        "CREDIT_SCORE": first_present(banking.get("creditScore")),
        "EXISTING_CARDS": current_cards_summary(record.get("currentCreditCards") or []),
        "RECOMMENDED_CARD": first_present(recommended_card.get("cardName"), summary.get("recommended_card")),
        "RECOMMENDED_CARD_REASON": bullet_list(recommended_card.get("whyThisCard")),
        "SPENDING_BEHAVIOUR": json.dumps(spending, ensure_ascii=False),
        "LIFESTYLE": json.dumps(lifestyle, ensure_ascii=False),
        "CUSTOMER_SUMMARY": first_present(ai_context.get("customerSummary")),
        "LIKELY_OBJECTIONS": objections_summary(ai_context.get("likelyObjections") or []),
        "SALES_STRATEGY": first_present(ai_context.get("salesStrategy")),
        "TONE": first_present(ai_context.get("tone")),
        "UPSELL_OPPORTUNITIES": bullet_list(ai_context.get("upsellOpportunities")),
        "CROSS_SELL_PRODUCTS": bullet_list(ai_context.get("crossSellProducts")),
        "CONVERSATION_HISTORY": json.dumps(conversation.get("conversationHistory") or [], ensure_ascii=False),
        "LAST_OFFER_STATUS": first_present(conversation.get("lastOfferStatus")),
        "CUSTOMER_INTENT": first_present(conversation.get("customerIntent")),
        "NEXT_BEST_ACTION": first_present(conversation.get("nextBestAction")),
    }
    rendered = template.replace("<Customer Name>", customer_name)
    for key, value in config_values.items():
        rendered = rendered.replace(f"{key}:", f"{key}: {value}")

    dynamic_context = {
        "recommendedCard": recommended_card,
        "preApprovedOffer": preapproved_offer,
        "eligibleCardAlternatives": [card for card in eligible_cards if card.get("cardId") != recommended_card_id],
        "talkingPoints": ai_context.get("talkingPoints"),
        "complianceNotes": ai_context.get("complianceNotes"),
        "doNotDiscuss": ai_context.get("doNotDiscuss"),
        "openingLineSuggestion": ai_context.get("openingLineSuggestion"),
    }
    return f"{rendered}\n\n---\n\n## Dynamic CardMate customer context for this call\n\n```json\n{json.dumps(dynamic_context, indent=2, ensure_ascii=False)}\n```".strip()


def agent_instructions(customer: dict) -> str:
    agent_config = customer.get("agent_config")
    if customer.get("prompt_override"):
        instructions = customer["prompt_override"]
    else:
        language = customer.get("language") or customer.get("summary", {}).get("preferred_language") or "English"
        prompt_type = customer.get("prompt_type") or customer.get("summary", {}).get("dataset_type") or "debt_collection"

        if prompt_type == "credit_card":
            instructions = render_credit_card_prompt(customer, language)
        else:
            instructions = render_debt_prompt(customer, language)

    if not agent_config:
        return instructions

    return f"{instructions}\n\n---\n\n## Operator-selected agent configuration\n\n```json\n{json.dumps(agent_config, indent=2, ensure_ascii=False)}\n```".strip()


def realtime_turn_detection() -> TurnDetection:
    turn_detection_type = os.getenv("LIVEKIT_TURN_DETECTION_TYPE", "server_vad")
    if turn_detection_type == "semantic_vad":
        return TurnDetection(
            type="semantic_vad",
            eagerness=os.getenv("LIVEKIT_SEMANTIC_VAD_EAGERNESS", "medium"),
            create_response=True,
            interrupt_response=True,
        )

    return TurnDetection(
        type="server_vad",
        threshold=float(os.getenv("LIVEKIT_SERVER_VAD_THRESHOLD", "0.7")),
        prefix_padding_ms=int(os.getenv("LIVEKIT_SERVER_VAD_PREFIX_PADDING_MS", "300")),
        silence_duration_ms=int(os.getenv("LIVEKIT_SERVER_VAD_SILENCE_DURATION_MS", "400")),
        create_response=True,
        interrupt_response=True,
    )


def realtime_voice(agent_config: dict | None) -> str:
    configured_voice = (agent_config or {}).get("voice")
    return OPENAI_VOICE_BY_STYLE.get(configured_voice, os.getenv("OPENAI_REALTIME_VOICE", "alloy"))


async def entrypoint(ctx: JobContext) -> None:
    dispatch_metadata = json.loads(ctx.job.metadata or "{}")
    customer = dispatch_metadata.get("customer", {})
    summary = customer.get("summary", {})
    prompt_type = dispatch_metadata.get("prompt_type") or customer.get("prompt_type") or summary.get("dataset_type") or "debt_collection"
    language = dispatch_metadata.get("language") or customer.get("language") or summary.get("preferred_language") or "English"
    agent_config = dispatch_metadata.get("agent_config") or customer.get("agent_config") or {}

    await ctx.connect()

    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            model=os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime"),
            voice=realtime_voice(agent_config),
            turn_detection=realtime_turn_detection(),
        )
    )

    await session.start(
        room=ctx.room,
        agent=Agent(instructions=agent_instructions(customer)),
    )

    try:
        participant = await ctx.wait_for_participant()
    except RuntimeError as exc:
        if "room disconnected" in str(exc):
            return
        raise

    customer_name = summary.get("name", "there")
    if prompt_type == "credit_card":
        opening_context = "their pre-approved credit card offer"
    else:
        opening_context = "their credit card account"

    await session.generate_reply(
        instructions=(
            f"The customer participant {participant.identity} just joined. Start speaking now. "
            f"Greet {customer_name}, disclose that you are an AI assistant calling about {opening_context}, "
            f"speak in {language}, ask if now is a good time, then pause for their response."
        )
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="credit-card-sales-agent"))
