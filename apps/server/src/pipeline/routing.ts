export type EditRoute = { kind: 'design' | 'content' | 'technical' | 'analysis' | 'privacy-check' | 'review'; agents: string; reason: string };

const RULES: Array<[EditRoute['kind'], RegExp, string]> = [
  ['review', /\b(review|überprüf|prüf(e|en)?\s+(die|das)\s+(finale|gesamte|komplette)|final(e)?\s+website)\b/i, 'full review → Claude visual review + Codex technical QA'],
  ['privacy-check', /\b(l(ä|ae)dt|load(s|ed)?|request(s)?|anfrage).*\b(vor|before|ohne|without)\b.*\b(consent|einwilligung|zustimmung)\b|\bconsent[- ]?(test|qa)\b/i, 'runtime privacy question → browser network/consent test (Codex QA role)'],
  ['analysis', /(analy[sz]\w*|erkl(ä|ae)r\w*|bewerte\w*|explain\w*|assess\w*|check\w*)\b.*(datenschutz|impressum|privacy|legal|rechtlich)/i, 'legal analysis → Claude reasoning + legal audit'],
  ['technical', /\b(overflow|bug|fix|kaputt|broken|fehler|error|console|a11y|accessib|barriere|wcag|alt[- ]?text|performance|lighthouse|ladezeit|speed|seo|meta|sitemap|robots|responsive|mobile menu|mobil(es)? men(ü|u)|self-?host|fonts? lokal|selbst hosten|security|sicherheit|refactor|semantic|html|css|js|javascript|entfern\w* google maps|remove google maps|validat)/i, 'technical change → Codex implements'],
  ['content', /\b(text|copy|formulier|wording|headline|überschrift|tonalit|tone|inhalt|content|schreib|rewrite|beschreibung|slogan|ansprache)\b/i, 'content change → Claude writes, Codex applies'],
  ['design', /\b(design|premium|apple|look|layout|farb|color|colour|blau|blue|typo|schrift|font|spacing|abstand|hero|navigation|nav|modern|eleganter?|minimal|hierarch|bild|image|animation|section|seite hinzu|add .* page|neue seite|landing|kart(e|en)|card)/i, 'design change → Claude directs, Codex implements'],
];

/** AUTO routing for the AI editor. Shown to the user before anything runs. */
export function classifyEdit(text: string): EditRoute {
  for (const [kind, re, reason] of RULES) if (re.test(text)) return { kind, agents: agentsFor(kind), reason };
  return { kind: 'design', agents: agentsFor('design'), reason: 'general change → Claude directs, Codex implements' };
}

function agentsFor(kind: EditRoute['kind']): string {
  return { design: 'Claude → Codex', content: 'Claude → Codex', technical: 'Codex', analysis: 'Claude + Legal Audit', 'privacy-check': 'Codex (browser QA)', review: 'Claude + Codex' }[kind];
}
