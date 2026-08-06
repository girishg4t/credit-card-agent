import hashlib
import os
import re
import tempfile
import threading


REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
DEBT_PROMPT_PATH = os.path.join(REPO_ROOT, "debt-collection-voice-agent-prompt.md")
AGENT_PROMPT_PATH = os.path.join(REPO_ROOT, "agent.md")
_FILE_LOCK = threading.Lock()
_IDENTITY_SECTION = re.compile(r"^## 2\. IDENTITY & UNIVERSAL RULES.*$", re.MULTILINE)
_SECTION_HEADING = re.compile(r"^## 4\. PERSONA PLAYBOOKS\s*$", re.MULTILINE)
_NEXT_SECTION = re.compile(r"^## 5\.", re.MULTILINE)
_PERSONA_HEADING = re.compile(r"^### ([A-Z][A-Z0-9_]*)\s*$", re.MULTILINE)
_HEADING_INJECTION = re.compile(r"^#{2,3}\s", re.MULTILINE)


class PromptConflictError(Exception):
    pass


def prompt_revision(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _persona_ranges(source: str) -> list[dict]:
    section = _SECTION_HEADING.search(source)
    if not section:
        raise ValueError("Debt collection prompt is missing the PERSONA PLAYBOOKS section")

    next_section = _NEXT_SECTION.search(source, section.end())
    if not next_section:
        raise ValueError("Debt collection prompt is missing the section after PERSONA PLAYBOOKS")

    section_end = next_section.start()
    separator = source.rfind("\n---", section.end(), section_end)
    if separator >= 0:
        section_end = separator

    headings = list(_PERSONA_HEADING.finditer(source, section.end(), section_end))
    personas = []
    for index, heading in enumerate(headings):
        content_start = heading.end()
        if source.startswith("\r\n", content_start):
            content_start += 2
        elif source.startswith("\n", content_start):
            content_start += 1

        content_end = headings[index + 1].start() if index + 1 < len(headings) else section_end
        while content_end > content_start and source[content_end - 1] in "\r\n":
            content_end -= 1

        personas.append({
            "key": heading.group(1),
            "content": source[content_start:content_end],
            "content_start": content_start,
            "content_end": content_end,
        })
    return personas


def parse_persona_prompts(source: str) -> list[dict[str, str]]:
    return [{"key": item["key"], "content": item["content"]} for item in _persona_ranges(source)]


def _validate_persona_content(content: str) -> None:
    if not content.strip():
        raise ValueError("Persona prompt cannot be empty")
    if _HEADING_INJECTION.search(content):
        raise ValueError("Persona prompt cannot contain Markdown section headings")


def replace_persona_prompt(source: str, persona_key: str, content: str) -> str:
    _validate_persona_content(content)

    persona = next((item for item in _persona_ranges(source) if item["key"] == persona_key), None)
    if not persona:
        raise KeyError(persona_key)

    normalized = content.replace("\r\n", "\n")
    if "\r\n" in source:
        normalized = normalized.replace("\n", "\r\n")
    return source[:persona["content_start"]] + normalized + source[persona["content_end"]:]


def read_persona_prompts(path: str = DEBT_PROMPT_PATH) -> dict:
    with open(path, encoding="utf-8") as prompt_file:
        source = prompt_file.read()
    return {"revision": prompt_revision(source), "personas": parse_persona_prompts(source)}


def generate_persona_system_prompt(persona_key: str, content: str, path: str = AGENT_PROMPT_PATH) -> dict[str, str]:
    _validate_persona_content(content)

    with open(path, encoding="utf-8") as prompt_file:
        source = prompt_file.read()

    identity_section = _IDENTITY_SECTION.search(source)
    persona_section = _SECTION_HEADING.search(source)
    next_section = _NEXT_SECTION.search(source, persona_section.end() if persona_section else 0)
    if not identity_section or not persona_section or not next_section:
        raise ValueError("agent.md is missing a required system prompt section")

    persona_headings = _PERSONA_HEADING.finditer(source, persona_section.end(), next_section.start())
    if not any(heading.group(1) == persona_key for heading in persona_headings):
        raise KeyError(persona_key)

    shared_sections = source[identity_section.start():persona_section.start()].strip()
    closing_sections = source[next_section.start():].strip()
    normalized_content = content.replace("\r\n", "\n").strip()
    generated = "\n\n".join([
        f"# System Prompt - {persona_key}",
        f"ACTIVE_PERSONA: {persona_key}",
        shared_sections,
        "## 4. ACTIVE PERSONA PLAYBOOK",
        "Use only the selected persona below. Do not adopt or infer another persona during the call.",
        f"### {persona_key}\n{normalized_content}",
        closing_sections,
    ])
    return {"persona_key": persona_key, "content": generated + "\n"}


def update_persona_prompt(persona_key: str, content: str, expected_revision: str, path: str = DEBT_PROMPT_PATH) -> dict:
    with _FILE_LOCK:
        with open(path, encoding="utf-8") as prompt_file:
            source = prompt_file.read()

        if prompt_revision(source) != expected_revision:
            raise PromptConflictError("The agent prompt changed after the editor loaded. Reload before saving.")

        updated = replace_persona_prompt(source, persona_key, content)
        file_mode = os.stat(path).st_mode
        descriptor, temporary_path = tempfile.mkstemp(prefix=".debt-prompt-", suffix=".tmp", dir=os.path.dirname(path))
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as temporary_file:
                temporary_file.write(updated)
                temporary_file.flush()
                os.fsync(temporary_file.fileno())
            os.chmod(temporary_path, file_mode)
            os.replace(temporary_path, path)
        finally:
            if os.path.exists(temporary_path):
                os.unlink(temporary_path)

    return read_persona_prompts(path)
