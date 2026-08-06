import os
import unittest
from unittest.mock import patch

from agora_agent.agentkit import Agent as AgoraAgent

from backend.main import AGORA_SESSIONS, start_agora_agent_session


class FakeSession:
    async def start(self) -> str:
        return "agent-test-id"


class AgoraPipelineTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        AGORA_SESSIONS.clear()
        self.captured = {}

    def capture_session(self, agent, **kwargs):
        self.captured["agent"] = agent
        self.captured["session"] = kwargs
        return FakeSession()

    async def start(self, voice_mode: str) -> str:
        with (
            patch("backend.main.AsyncAgora", return_value=object()),
            patch.object(
                AgoraAgent,
                "create_async_session",
                autospec=True,
                side_effect=self.capture_session,
            ),
            patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False),
        ):
            return await start_agora_agent_session(
                app_id="test-app-id",
                app_certificate="test-certificate",
                channel="test-channel",
                agent_uid="9000001",
                user_uid="1000001",
                instructions="Test instructions",
                greeting_message="Hello",
                name="test-agent-name",
                language="English",
                voice_mode=voice_mode,
            )

    async def test_standard_mode_wires_managed_asr_llm_tts(self) -> None:
        agent_id = await self.start("standard")

        agent = self.captured["agent"]
        self.assertEqual(agent.stt["vendor"], "deepgram")
        self.assertEqual(agent.stt["params"]["model"], "nova-3")
        self.assertEqual(agent.llm["style"], "openai")
        self.assertEqual(agent.llm["params"]["model"], "gpt-4o-mini")
        self.assertEqual(agent.tts["vendor"], "minimax")
        self.assertIsNone(agent.mllm)
        self.assertEqual(agent_id, "agent-test-id")
        self.assertIsInstance(AGORA_SESSIONS[agent_id], FakeSession)

    async def test_realtime_mode_wires_mllm_without_cascaded_stages(self) -> None:
        await self.start("realtime")

        agent = self.captured["agent"]
        self.assertEqual(agent.mllm["vendor"], "openai")
        self.assertEqual(agent.mllm["params"]["model"], "gpt-realtime")
        self.assertIsNone(agent.stt)
        self.assertIsNone(agent.llm)
        self.assertIsNone(agent.tts)

    async def test_session_uses_string_uids_and_remote_uid_array(self) -> None:
        await self.start("standard")

        session = self.captured["session"]
        self.assertEqual(session["channel"], "test-channel")
        self.assertEqual(session["agent_uid"], "9000001")
        self.assertEqual(session["remote_uids"], ["1000001"])
        self.assertFalse(session["enable_string_uid"])
        self.assertEqual(session["name"], "test-agent-name")


if __name__ == "__main__":
    unittest.main()
