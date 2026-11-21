import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

/**
 * Converts a Zod schema into a strict JSON Schema accepted by both
 * `claude --json-schema` and `codex exec --output-schema` (OpenAI strict mode):
 * every object closed, every property required, no defaults.
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, { target: 'draft-7', io: 'output', unrepresentable: 'any' }) as JsonSchema;
  delete raw.$schema;
  return strictify(raw) as JsonSchema;
}

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== 'object') return node;
  const obj = { ...(node as Record<string, unknown>) };
  delete obj.default;
  delete obj.format;
  delete obj.pattern;
  for (const [k, v] of Object.entries(obj)) obj[k] = strictify(v);
  if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
    obj.additionalProperties = false;
    obj.required = Object.keys(obj.properties as object);
  }
  return obj;
}
