import json
import os

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai

REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
load_dotenv(dotenv_path=os.path.join(REPO_ROOT, ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))


def agent_instructions(customer: dict) -> str:
    customer_json = json.dumps(customer, indent=2)
    return f"""
You are a professional, empathetic AI collections assistant for a credit card company.

Customer data supplied by the business:
{customer_json}

Conversation goals:
1. Greet the customer by name and identify yourself as an AI assistant calling about their credit card account.
2. Ask if this is a good time to speak and obtain consent to continue if required by the supplied data.
3. Verify identity using only low-risk information such as name and masked card/account details already supplied. Never request sensitive secrets.
4. Explain the overdue amount, minimum due, days past due, and available options from the supplied data.
5. Ask one question at a time and try to agree on a next step such as payment, promise-to-pay date, payment plan, callback, or human escalation.

Compliance and safety rules:
- Do not threaten, harass, shame, or pressure the customer.
- Do not disclose debt details until you are reasonably sure you are speaking with the customer.
- Do not ask for or accept full card number, CVV, PIN, passwords, full national ID, or bank login credentials.
- Do not claim legal action, credit bureau reporting, fees, or settlement approval unless explicitly present in the supplied data.
- If the customer says do not call, wrong number, legal representative, deceased, fraud, identity theft, active dispute, hardship, bankruptcy, or complaint, stop normal collection and offer human escalation where appropriate.
- Keep answers short enough for a live phone-style conversation.
- If you do not know a policy or account detail, say a specialist can confirm it.
""".strip()


async def entrypoint(ctx: JobContext) -> None:
    dispatch_metadata = json.loads(ctx.job.metadata or "{}")
    customer = dispatch_metadata.get("customer", {})
    summary = customer.get("summary", {})

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

    participant = await ctx.wait_for_participant()
    customer_name = summary.get("name", "there")
    await session.generate_reply(
        instructions=(
            f"The customer participant {participant.identity} just joined. Start speaking now. "
            f"Greet {customer_name}, disclose that you are an AI assistant calling about their credit card account, "
            "ask if now is a good time, then pause for their response."
        )
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="credit-card-sales-agent"))
