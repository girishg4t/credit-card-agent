import os
import tempfile
import unittest

from backend.prompt_editor import (
    PromptConflictError,
    generate_persona_system_prompt,
    parse_persona_prompts,
    prompt_revision,
    replace_persona_prompt,
    update_persona_prompt,
)


FIXTURE = """# Agent\n\n## 4. PERSONA PLAYBOOKS\n\nIntro remains.\n\n### PERSONA_A\n- **Tone dials:** warm.\n- **Goal:** help.\n\n### PERSONA_B\n- **Goal:** resolve.\n\n---\n\n## 5. NEXT\n\nUntouched.\n"""
AGENT_FIXTURE = """# Agent\n\n## 1. CONFIGURATION\n\nIgnored.\n\n## 2. IDENTITY & UNIVERSAL RULES\n\nUniversal rules.\n\n## 3. STANDARD CALL FLOW\n\nStandard flow.\n\n## 4. PERSONA PLAYBOOKS\n\n### PERSONA_A\n- **Goal:** source A.\n\n### PERSONA_B\n- **Goal:** source B.\n\n### WORKFLOW_START\nWorkflow metadata.\n\n---\n\n## 5. EDGE CASE PLAYBOOK\n\nEdge cases.\n\n## 6. WHAT SUCCESS LOOKS LIKE\n\nSuccess rules.\n"""


class PromptEditorTests(unittest.TestCase):
    def test_parses_persona_blocks(self):
        personas = parse_persona_prompts(FIXTURE)
        self.assertEqual([item["key"] for item in personas], ["PERSONA_A", "PERSONA_B"])
        self.assertIn("Tone dials", personas[0]["content"])

    def test_replaces_only_selected_persona(self):
        updated = replace_persona_prompt(FIXTURE, "PERSONA_A", "- **Goal:** updated.")
        self.assertIn("### PERSONA_A\n- **Goal:** updated.", updated)
        self.assertIn("### PERSONA_B\n- **Goal:** resolve.", updated)
        self.assertTrue(updated.endswith("## 5. NEXT\n\nUntouched.\n"))

    def test_rejects_unknown_persona_and_heading_injection(self):
        with self.assertRaises(KeyError):
            replace_persona_prompt(FIXTURE, "UNKNOWN", "- **Goal:** no.")
        with self.assertRaises(ValueError):
            replace_persona_prompt(FIXTURE, "PERSONA_A", "## Injected")

    def test_rejects_stale_revision_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "prompt.md")
            with open(path, "w", encoding="utf-8") as prompt_file:
                prompt_file.write(FIXTURE)
            with self.assertRaises(PromptConflictError):
                update_persona_prompt("PERSONA_A", "- **Goal:** changed.", "stale", path)
            with open(path, encoding="utf-8") as prompt_file:
                self.assertEqual(prompt_file.read(), FIXTURE)

    def test_updates_file_with_current_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "prompt.md")
            with open(path, "w", encoding="utf-8") as prompt_file:
                prompt_file.write(FIXTURE)
            result = update_persona_prompt("PERSONA_A", "- **Goal:** changed.", prompt_revision(FIXTURE), path)
            self.assertNotEqual(result["revision"], prompt_revision(FIXTURE))
            self.assertEqual(result["personas"][0]["content"], "- **Goal:** changed.")

    def test_generates_selected_persona_with_shared_sections_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "agent.md")
            with open(path, "w", encoding="utf-8") as prompt_file:
                prompt_file.write(AGENT_FIXTURE)

            result = generate_persona_system_prompt("PERSONA_A", "- **Goal:** current editor value.", path)

            self.assertIn("ACTIVE_PERSONA: PERSONA_A", result["content"])
            self.assertIn("## 2. IDENTITY & UNIVERSAL RULES", result["content"])
            self.assertIn("## 3. STANDARD CALL FLOW", result["content"])
            self.assertIn("### PERSONA_A\n- **Goal:** current editor value.", result["content"])
            self.assertIn("## 5. EDGE CASE PLAYBOOK", result["content"])
            self.assertIn("## 6. WHAT SUCCESS LOOKS LIKE", result["content"])
            self.assertNotIn("source A", result["content"])
            self.assertNotIn("PERSONA_B", result["content"])
            self.assertNotIn("WORKFLOW_START", result["content"])
            with open(path, encoding="utf-8") as prompt_file:
                self.assertEqual(prompt_file.read(), AGENT_FIXTURE)

    def test_generate_rejects_unknown_persona(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "agent.md")
            with open(path, "w", encoding="utf-8") as prompt_file:
                prompt_file.write(AGENT_FIXTURE)
            with self.assertRaises(KeyError):
                generate_persona_system_prompt("UNKNOWN", "- **Goal:** no.", path)


if __name__ == "__main__":
    unittest.main()
