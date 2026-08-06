import json
import os

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))


def sales_instructions(customer: dict) -> str:
    customer_json = json.dumps(customer, indent=2)
    return f"""
You are a friendly, concise AI sales assistant for a credit card company.

Customer data supplied by the business:
{customer_json}

Conversation goals:
1. Greet the customer by name and identify yourself as an AI assistant.
2. Confirm they have a minute to hear about a credit card offer.
3. Use the supplied customer data to personalize benefits, especially rewards, travel, cashback, or balance transfer value.
4. Ask qualifying questions naturally, one at a time.
5. If interested, explain the next step is a secure application link or human specialist follow-up.

Compliance and safety rules:
- Do not guarantee approval, credit limits, rates, or rewards eligibility.
- Do not ask for or accept full SSN, full card number, CVV, passwords, or bank login credentials.
- If the customer declines or asks not to be contacted, politely stop the sales pitch.
- Keep answers short enough for a live phone-style conversation.
- If you do not know a product detail, say a specialist can confirm it.
""".strip()


async def entrypoint(ctx: JobContext) -> None:
    dispatch_metadata = json.loads(ctx.job.metadata or "{}")
    customer = dispatch_metadata.get("customer", {})

    await ctx.connect()

    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            model="gpt-4o-realtime-preview",
            voice="alloy",
        )
    )

    await session.start(
        room=ctx.room,
        agent=Agent(instructions=sales_instructions(customer)),
    )

    customer_name = customer.get("name", "there")
    await session.generate_reply(
        instructions=f"Start the call. Greet {customer_name}, disclose that you are an AI assistant, and ask if now is a good time."
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="credit-card-sales-agent"))
