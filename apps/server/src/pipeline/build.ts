import { registerJobKind, type StepDef } from '../orchestrator/jobs.ts';
import { fixStep, maxRounds, renderStep, reviewStep, stepConsent, stepDesignSystem, stepGate, stepImplement, stepLegal, stepPrivacy, stepQA, stepTechnicalFix } from './steps.ts';

const reviewLoop = (): StepDef[] => {
  const steps: StepDef[] = [];
  for (let r = 1; r <= maxRounds(); r++) {
    steps.push({ key: `render-r${r}`, label: `Browser render (round ${r})`, agent: 'Browser', state: 'rendering', run: renderStep(`r${r}`) });
    steps.push({ key: `review-r${r}`, label: `Claude visual review (round ${r})`, agent: 'Claude', state: 'visual-review', run: reviewStep(`r${r}`, r) });
    steps.push({ key: `visual-fix-${r}`, label: `Codex design fixes (round ${r})`, agent: 'Codex', state: 'fixing', run: fixStep(`r${r}`, r) });
  }
  return steps;
};

const qaTail = (): StepDef[] => [
  { key: 'qa-1', label: 'Technical QA (responsive · a11y · SEO · performance · security · links · forms)', agent: 'Browser', state: 'technical-review', run: stepQA },
  { key: 'tech-fix', label: 'Codex technical fixes', agent: 'Codex', state: 'fixing', run: stepTechnicalFix },
  // Privacy may update Factory-generated files (consent, Datenschutz), so QA re-runs afterwards on the final version.
  { key: 'privacy', label: 'Privacy inventory (fresh browser: network · cookies · storage)', agent: 'Browser', state: 'privacy-audit', run: stepPrivacy },
  { key: 'consent', label: 'Consent QA (4 fresh contexts)', agent: 'Browser', state: 'privacy-audit', run: stepConsent },
  { key: 'qa-2', label: 'Technical QA on final version', agent: 'Browser', state: 'responsive-qa', run: stepQA },
  { key: 'legal', label: 'Legal / compliance audit', agent: 'Factory', state: 'legal-audit', run: stepLegal },
  { key: 'render-final', label: 'Browser render (final)', agent: 'Browser', state: 'rendering', run: renderStep('final') },
  { key: 'review-final', label: 'Claude final review (second review)', agent: 'Claude', state: 'visual-review', run: reviewStep('final', 99) },
  { key: 'gate', label: 'Production gate', agent: 'Factory', state: 'manual-review', run: stepGate },
];

registerJobKind('build', () => [
  { key: 'design-system', label: 'Design system from selected concept', agent: 'Factory', state: 'designing', run: stepDesignSystem },
  { key: 'implement', label: 'Codex implementation (isolated worktree)', agent: 'Codex', state: 'implementing', run: stepImplement },
  ...reviewLoop(),
  ...qaTail(),
]);

registerJobKind('visual-review', () => [
  { key: 'render-final', label: 'Browser render', agent: 'Browser', state: 'rendering', run: renderStep('final') },
  { key: 'review-final', label: 'Claude visual review', agent: 'Claude', state: 'visual-review', run: reviewStep('final', 99) },
  { key: 'gate', label: 'Production gate', agent: 'Factory', state: 'manual-review', run: stepGate },
]);

registerJobKind('technical-qa', () => [
  { key: 'qa-1', label: 'Technical QA', agent: 'Browser', state: 'technical-review', run: stepQA },
  { key: 'tech-fix', label: 'Codex technical fixes', agent: 'Codex', state: 'fixing', run: stepTechnicalFix },
  { key: 'qa-2', label: 'Technical QA re-run', agent: 'Browser', state: 'technical-review', run: stepQA },
  { key: 'gate', label: 'Production gate', agent: 'Factory', state: 'manual-review', run: stepGate },
]);

registerJobKind('qa', () => [
  { key: 'privacy', label: 'Privacy inventory', agent: 'Browser', state: 'privacy-audit', run: stepPrivacy },
  { key: 'consent', label: 'Consent QA', agent: 'Browser', state: 'privacy-audit', run: stepConsent },
  { key: 'qa-1', label: 'Technical QA', agent: 'Browser', state: 'technical-review', run: stepQA },
  { key: 'legal', label: 'Legal audit', agent: 'Factory', state: 'legal-audit', run: stepLegal },
  { key: 'gate', label: 'Production gate', agent: 'Factory', state: 'manual-review', run: stepGate },
]);

registerJobKind('privacy', () => [
  { key: 'privacy', label: 'Privacy inventory', agent: 'Browser', state: 'privacy-audit', run: stepPrivacy },
  { key: 'consent', label: 'Consent QA', agent: 'Browser', state: 'privacy-audit', run: stepConsent },
  { key: 'gate', label: 'Production gate', agent: 'Factory', state: 'manual-review', run: stepGate },
]);

registerJobKind('legal', () => [
  { key: 'privacy', label: 'Privacy inventory', agent: 'Browser', state: 'privacy-audit', run: stepPrivacy },
  { key: 'consent', label: 'Consent QA', agent: 'Browser', state: 'privacy-audit', run: stepConsent },
  { key: 'legal', label: 'Legal audit', agent: 'Factory', state: 'legal-audit', run: stepLegal },
  { key: 'gate', label: 'Production gate', agent: 'Factory', state: 'manual-review', run: stepGate },
]);

export { qaTail };
