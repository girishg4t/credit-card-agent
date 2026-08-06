import json
import os
import re

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai

REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
load_dotenv(dotenv_path=os.path.join(REPO_ROOT, ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

DEBT_PROMPT_PATH = os.path.join(REPO_ROOT, "debt-collection-voice-agent-prompt.md")
CREDIT_CARD_PROMPT_PATH = os.path.join(REPO_ROOT, "livekit_reusable_credit_card_llm_system_prompt_template.txt")


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
    contact = record.get("contact", {})
    banking = record.get("bankingProfile", {})
    behavior = record.get("behaviour", {})
    spending = record.get("spendingBehaviour", {})
    eligibility = record.get("eligibility", {})
    ai_context = record.get("aiContext", {})
    conversation = record.get("conversationIntelligence", {})
    recommended_card = eligibility.get("recommendedCard", {})
    preapproved_offer = (eligibility.get("preApprovedOffers") or [{}])[0]
    last_interaction = behavior.get("lastInteraction", {})
    summary = customer.get("summary", {})
    bank_name = os.getenv("BANK_NAME", first_present(recommended_card.get("issuer"), default="CardMate Bank"))
    recommended_card_id = recommended_card.get("cardId")

    values = {
        "variable_name": "value",
        "bank_name": bank_name,
        "customer_id": first_present(record.get("customerId"), customer_info.get("customerId"), summary.get("customer_id")),
        "customer_salutation": first_present(customer_info.get("salutation"), default=""),
        "customer_full_name": first_present(customer_info.get("fullName"), summary.get("name")),
        "customer_last_name": first_present(customer_info.get("lastName"), summary.get("name")),
        "preferred_call_language": language,
        "customer_timezone": first_present(behavior.get("timezone"), default="Asia/Kolkata"),
        "best_call_time": first_present(behavior.get("bestCallTime")),
        "phone_verified": yes_no(contact.get("phoneVerified")),
        "voice_consent_on_file": yes_no(contact.get("voiceConsentOnFile")),
        "consent_for_ai_call_on_file": yes_no(conversation.get("consentForAiCallOnFile")),
        "recorded_consent_reference": first_present(conversation.get("recordedConsentReference")),
        "dnc_registered": yes_no(contact.get("dncRegistered")),
        "marketing_call_opt_out": yes_no(contact.get("marketingCallOptOut")),
        "do_not_call_before": first_present(conversation.get("doNotCallBefore"), default="Not applicable"),
        "call_attempts_last_30_days": first_present(conversation.get("callAttemptsLast30Days"), default="0"),
        "customer_segment": first_present(customer_info.get("customerSegment")),
        "relationship_type": first_present(banking.get("relationshipType")),
        "relationship_tenure_years": first_present(banking.get("relationshipTenureYears")),
        "home_branch_city": first_present(banking.get("homeBranchCity")),
        "customer_country": first_present(customer_info.get("country")),
        "occupation_category": first_present(customer_info.get("occupationCategory")),
        "customer_summary": first_present(ai_context.get("customerSummary")),
        "customer_sentiment": first_present(behavior.get("customerSentiment")),
        "recommended_tone": first_present(ai_context.get("tone")),
        "recommended_conversation_style": first_present(ai_context.get("recommendedConversationStyle")),
        "sales_strategy": first_present(ai_context.get("salesStrategy")),
        "preferred_communication": first_present(behavior.get("preferredCommunication")),
        "marketing_response_rate_percent": first_present(behavior.get("marketingResponseRatePercent")),
        "propensity_to_buy_score": first_present(conversation.get("propensityToBuyScore")),
        "churn_risk_score": first_present(conversation.get("churnRiskScore")),
        "last_interaction_date": first_present(last_interaction.get("date")),
        "last_interaction_channel": first_present(last_interaction.get("channel")),
        "last_interaction_purpose": first_present(last_interaction.get("purpose")),
        "last_interaction_outcome": first_present(last_interaction.get("outcome")),
        "last_offer_made": first_present(conversation.get("lastOfferMade")),
        "last_offer_status": first_present(conversation.get("lastOfferStatus")),
        "customer_intent": first_present(conversation.get("customerIntent")),
        "next_best_action": first_present(conversation.get("nextBestAction")),
        "interested_products": bullet_list(behavior.get("interestedProducts")),
        "top_spend_categories": bullet_list(spending.get("topSpendCategories")),
        "existing_cards_summary": current_cards_summary(record.get("currentCreditCards") or []),
        "recommended_card_id": first_present(recommended_card_id),
        "recommended_card_name": first_present(recommended_card.get("cardName"), summary.get("recommended_card")),
        "recommended_card_issuer": first_present(recommended_card.get("issuer"), bank_name),
        "recommended_card_tier": first_present(recommended_card.get("tier")),
        "recommended_card_network": first_present(recommended_card.get("network")),
        "recommended_card_annual_fee_display": rupees(recommended_card.get("annualFee")),
        "preapproved_offer_id": first_present(preapproved_offer.get("offerId")),
        "offer_valid_till": first_present(preapproved_offer.get("offerValidTill")),
        "first_year_fee_waiver": yes_no(preapproved_offer.get("firstYearFeeWaiver")),
        "joining_benefit": first_present(preapproved_offer.get("joiningBenefit")),
        "documentation_required": first_present(preapproved_offer.get("documentationRequired")),
        "instant_issuance": yes_no(preapproved_offer.get("instantIssuance")),
        "estimated_annual_reward_value_display": rupees(recommended_card.get("estimatedAnnualRewardValue")),
        "estimated_net_annual_benefit_display": rupees(recommended_card.get("estimatedNetAnnualBenefit")),
        "recommended_card_key_benefits": bullet_list(recommended_card.get("keyBenefits")),
        "recommended_card_why_this_card": bullet_list(recommended_card.get("whyThisCard")),
        "eligible_card_alternatives": eligible_card_alternatives(eligibility.get("eligibleCards") or [], recommended_card_id),
        "compliance_notes": bullet_list(ai_context.get("complianceNotes")),
        "do_not_discuss": bullet_list(ai_context.get("doNotDiscuss")),
        "opening_line_suggestion": first_present(ai_context.get("openingLineSuggestion")),
        "approved_verification_steps": "Verify only using bank-approved low-risk checks. Do not request OTP, CVV, PIN, passwords, or full account/card numbers.",
        "official_contact_channel": first_present(os.getenv("OFFICIAL_CONTACT_CHANNEL"), os.getenv("SUPPORT_PHONE"), default="the bank's official support channel"),
        "maximum_discovery_questions": "3",
        "dynamic_confirmed_needs": "the customer's confirmed needs",
        "short_benefit_summary": "; ".join((recommended_card.get("keyBenefits") or [])[:3]) or "approved card benefits",
        "talking_points": bullet_list(ai_context.get("talkingPoints")),
        "likely_objections_and_responses": objections_summary(ai_context.get("likelyObjections") or []),
        "escalate_to_human_rm": yes_no(ai_context.get("escalateToHumanRM")),
        "expected_call_duration_seconds": first_present(ai_context.get("expectedCallDurationSeconds"), default="300"),
        "confirmed_follow_up_datetime": "the confirmed follow-up time",
    }

    return render_double_curly_template(template, values).strip()


def agent_instructions(customer: dict) -> str:
    if customer.get("prompt_override"):
        return customer["prompt_override"]

    language = customer.get("language") or customer.get("summary", {}).get("preferred_language") or "English"
    prompt_type = customer.get("prompt_type") or customer.get("summary", {}).get("dataset_type") or "debt_collection"

    if prompt_type == "credit_card":
        return render_credit_card_prompt(customer, language)

    return render_debt_prompt(customer, language)


async def entrypoint(ctx: JobContext) -> None:
    dispatch_metadata = json.loads(ctx.job.metadata or "{}")
    customer = dispatch_metadata.get("customer", {})
    summary = customer.get("summary", {})
    prompt_type = dispatch_metadata.get("prompt_type") or customer.get("prompt_type") or summary.get("dataset_type") or "debt_collection"
    language = dispatch_metadata.get("language") or customer.get("language") or summary.get("preferred_language") or "English"

    await ctx.connect()

    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            model=os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime"),
            voice="alloy",
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
