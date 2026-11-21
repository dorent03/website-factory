import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();
const ts = (name: string) => text(name).notNull();

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  marketing: json<Record<string, unknown>>('marketing').notNull(),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
});

export const customerLegalProfiles = sqliteTable('customer_legal_profiles', {
  customerId: text('customer_id').primaryKey().references(() => customers.id, { onDelete: 'cascade' }),
  data: json<Record<string, unknown>>('data').notNull(),
  updatedAt: ts('updated_at'),
});

export const websites = sqliteTable('websites', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  siteType: text('site_type').notNull(),
  status: text('status').notNull(),
  generator: text('generator').notNull().default('static-html'),
  functionality: json<Record<string, unknown>>('functionality').notNull(),
  hosting: json<Record<string, unknown>>('hosting').notNull(),
  brief: json<unknown>('brief'),
  briefApproved: integer('brief_approved', { mode: 'boolean' }).notNull().default(false),
  concepts: json<unknown>('concepts'),
  conceptReview: json<unknown>('concept_review'),
  selectedConcept: text('selected_concept'),
  currentVersion: text('current_version'),
  gate: json<unknown>('gate'),
  staleness: json<{ stale: boolean; reasons: string[]; since: string | null }>('staleness').notNull(),
  imported: integer('imported', { mode: 'boolean' }).notNull().default(false),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
}, (t) => [uniqueIndex('websites_customer_slug').on(t.customerId, t.slug)]);

export const websiteVersions = sqliteTable('website_versions', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  label: text('label').notNull(),
  dirName: text('dir_name').notNull(),
  gitCommit: text('git_commit').notNull(),
  agent: text('agent').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  taskId: text('task_id'),
  prompt: text('prompt').notNull(),
  filesChanged: json<string[]>('files_changed').notNull(),
  impact: json<unknown>('impact'),
  qaState: text('qa_state').notNull(),
  legalState: text('legal_state').notNull(),
  restoredFrom: text('restored_from'),
  createdAt: ts('created_at'),
}, (t) => [uniqueIndex('versions_site_number').on(t.websiteId, t.number)]);

export const researchRuns = sqliteTable('research_runs', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  providers: json<string[]>('providers').notNull(),
  summary: json<unknown>('summary'),
  error: text('error').notNull().default(''),
  startedAt: ts('started_at'),
  finishedAt: text('finished_at'),
});

export const researchSources = sqliteTable('research_sources', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => researchRuns.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull(),
  field: text('field').notNull(),
  value: text('value').notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceTitle: text('source_title').notNull(),
  provider: text('provider').notNull(),
  retrievedAt: ts('retrieved_at'),
  confidence: real('confidence').notNull(),
  status: text('status').notNull(),
  quote: text('quote').notNull().default(''),
  note: text('note').notNull().default(''),
}, (t) => [index('sources_customer').on(t.customerId)]);

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  websiteId: text('website_id'),
  kind: text('kind').notNull(),
  category: text('category').notNull(),
  source: text('source').notNull(),
  url: text('url').notNull().default(''),
  license: text('license').notNull().default(''),
  localPath: text('local_path').notNull(),
  alt: text('alt').notNull().default(''),
  purpose: text('purpose').notNull().default(''),
  reviewStatus: text('review_status').notNull(),
  createdAt: ts('created_at'),
});

export const designSystems = sqliteTable('design_systems', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  data: json<unknown>('data').notNull(),
  contrast: json<unknown>('contrast'),
  createdAt: ts('created_at'),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  health: json<unknown>('health'),
  updatedAt: ts('updated_at'),
});

export const agentTasks = sqliteTable('agent_tasks', {
  id: text('id').primaryKey(),
  jobId: text('job_id'),
  customerId: text('customer_id'),
  websiteId: text('website_id'),
  agent: text('agent').notNull(),
  requestedAgent: text('requested_agent').notNull(),
  fallbackUsed: integer('fallback_used', { mode: 'boolean' }).notNull().default(false),
  role: text('role').notNull(),
  objective: text('objective').notNull(),
  context: json<unknown>('context'),
  allowedPaths: json<string[]>('allowed_paths').notNull(),
  inputArtifacts: json<string[]>('input_artifacts').notNull(),
  expectedOutput: text('expected_output').notNull(),
  timeoutMs: integer('timeout_ms').notNull(),
  write: integer('write', { mode: 'boolean' }).notNull(),
  status: text('status').notNull(),
  exitCode: integer('exit_code'),
  durationMs: integer('duration_ms'),
  error: text('error').notNull().default(''),
  errorKind: text('error_kind').notNull().default(''),
  model: text('model').notNull().default(''),
  stdoutTail: text('stdout_tail').notNull().default(''),
  stderrTail: text('stderr_tail').notNull().default(''),
  output: json<unknown>('output'),
  createdAt: ts('created_at'),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
}, (t) => [index('tasks_job').on(t.jobId)]);

export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  customerId: text('customer_id'),
  websiteId: text('website_id'),
  state: text('state').notNull(),
  title: text('title').notNull(),
  steps: json<unknown[]>('steps').notNull(),
  input: json<unknown>('input'),
  error: text('error').notNull().default(''),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
});

export const privacyInventories = sqliteTable('privacy_inventories', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  websiteVersion: text('website_version').notNull(),
  data: json<unknown>('data').notNull(),
  createdAt: ts('created_at'),
});

export const privacyServices = sqliteTable('privacy_services', {
  id: text('id').primaryKey(),
  inventoryId: text('inventory_id').notNull().references(() => privacyInventories.id, { onDelete: 'cascade' }),
  websiteId: text('website_id').notNull(),
  serviceKey: text('service_key').notNull(),
  data: json<unknown>('data').notNull(),
});

export const consentConfigurations = sqliteTable('consent_configurations', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  data: json<unknown>('data').notNull(),
  testResults: json<unknown>('test_results'),
  createdAt: ts('created_at'),
});

export const legalDocuments = sqliteTable('legal_documents', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  version: integer('version').notNull(),
  websiteVersion: text('website_version').notNull(),
  rulesetVersion: text('ruleset_version').notNull(),
  inventoryVersion: integer('inventory_version').notNull(),
  content: text('content').notNull(),
  manualEdits: integer('manual_edits', { mode: 'boolean' }).notNull().default(false),
  reviewStatus: text('review_status').notNull(),
  generatedAt: ts('generated_at'),
});

export const legalAudits = sqliteTable('legal_audits', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  websiteVersion: text('website_version').notNull(),
  data: json<unknown>('data').notNull(),
  createdAt: ts('created_at'),
});

export const qaReports = sqliteTable('qa_reports', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  websiteVersion: text('website_version').notNull(),
  data: json<unknown>('data').notNull(),
  createdAt: ts('created_at'),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull().references(() => websites.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  agent: text('agent').notNull().default(''),
  content: text('content').notNull(),
  jobId: text('job_id'),
  annotations: json<unknown>('annotations'),
  createdAt: ts('created_at'),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: ts('at'),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull().default(''),
  detail: json<unknown>('detail'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: json<unknown>('value').notNull(),
  updatedAt: ts('updated_at'),
});
