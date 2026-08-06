export function parsePersonaPrompt(prompt) {
  const fields = [];

  for (const line of prompt.split(/\r?\n/)) {
    const match = /^-\s+\*\*(.+?)\*\*\s*(.*)$/.exec(line);
    if (match) {
      const marker = match[1];
      fields.push({
        id: `field-${fields.length}`,
        marker,
        label: marker.replace(/\s*[:=]\s*$/, '').trim(),
        value: match[2],
      });
    } else if (fields.length) {
      fields[fields.length - 1].value += `${fields[fields.length - 1].value ? '\n' : ''}${line}`;
    }
  }

  if (fields.length) {
    return { fields, structured: true };
  }

  return {
    fields: [{ id: 'field-0', marker: 'Prompt:', label: 'Prompt', value: prompt }],
    structured: false,
  };
}

export function serializePersonaPrompt(parsed) {
  if (!parsed.structured) {
    return parsed.fields[0]?.value || '';
  }
  return parsed.fields.map((field) => `- **${field.marker}** ${field.value}`).join('\n');
}
