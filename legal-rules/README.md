# legal-rules – Ruleset der Legal & Privacy Engine

> **Haftungsausschluss / Disclaimer.** Die Engine führt **technische Prüfungen** gegen dieses Regelwerk durch. Sie ersetzt **keine Rechtsberatung**. Ergebnisse lauten ausschließlich **PASS / WARNING / FAIL / MANUAL REVIEW REQUIRED** – niemals Prozentwerte, niemals „rechtssicher“, „abmahnsicher“ oder „DSGVO-konform garantiert“. Regeln mit dem Hinweis `LAWYER REVIEW` in `manualCheck` und alle Punkte unter [Anwaltliche Prüfung erforderlich](#anwaltliche-prüfung-erforderlich) müssen von einer zugelassenen Rechtsanwältin / einem zugelassenen Rechtsanwalt geprüft werden, bevor eine Website als freigegeben gilt.

Stand: **2026-11-02** (alle Quellen an diesem Tag abgerufen). Nächste planmäßige Review: siehe [Review-Rhythmus](#review-rhythmus).

## Struktur

```
legal-rules/
  README.md                       ← diese Datei
  germany/
    sources.json                  ← alle Quellen mit Abrufdatum, Typ (primary/guidance) und was sie belegen
    datenschutz-sections.json     ← Katalog der Datenschutzerklärungs-Abschnitte je Dienstkategorie (nur Themen, keine Rechtstexte)
    imprint/*.json                ← Anbieterkennzeichnung, Geschäftsbriefe, Rechtsformen, Berufsrecht, MStV
    privacy/*.json                ← DSGVO-Informationspflichten, Drittanbieter, Formulare, Sicherheit
    consent/*.json                ← § 25 TDDDG, Banner, Einbettungen, Newsletter
    ecommerce/*.json              ← VSBG, PAngV, BGB-Fernabsatz, Widerrufsfunktion, GPSR
    recruiting/*.json             ← Bewerberdaten, AGG
    accessibility/*.json          ← BFSG / BFSGV
```

Die Engine lädt jede `legal-rules/**/*.json` **außer** `sources.json` und `datenschutz-sections.json` als Regel (diese beiden Dateien haben kein `id`/`automatedCheck` und sind daran erkennbar). **Eine Regel pro Datei**, Dateiname = ID ohne `de.<kategorie>.`-Präfix.

### Regelschema

```json
{ "id": "de.imprint.legal-form", "title": "…", "description": "…", "jurisdiction": "DE|EU",
  "category": "imprint|privacy|consent|ecommerce|recruiting|accessibility",
  "sources": [{ "title": "…", "url": "…", "publisher": "…", "retrieved": "2026-11-02" }],
  "lastReviewed": "2026-11-02", "ruleVersion": "1.0.0",
  "severity": "blocker|major|minor|info",
  "appliesWhen": { "siteTypes": [], "modules": [], "legalForms": [], "conditions": [] },
  "requiredFields": [],
  "automatedCheck": { "checkId": "…", "params": {} },
  "manualCheck": "…oder null" }
```

### Semantik (Vorschlag für die Engine)

- **appliesWhen**: leeres Array = keine Einschränkung. `siteTypes`, `modules`, `legalForms`: Regel gilt, wenn der Wert des Kunden **in** der Liste ist (ODER). `conditions`: **alle** Bedingungen müssen wahr sein (UND). Die vier Felder werden untereinander UND-verknüpft.
- **requiredFields**: Felder des `CustomerLegalProfile`, die vorhanden sein müssen. Fehlt ein Feld bei einer Regel mit `severity: blocker`, ist die rechtliche Freigabe blockiert. **Werte werden niemals erfunden, geschätzt oder aus anderen Feldern abgeleitet.**
- **automatedCheck.params** sind check-spezifisch. Unbekannte Param-Schlüssel soll ein Check ignorieren (nicht fehlschlagen). `proposedCheck` / `proposedCondition` in Params sind Hinweise auf noch nicht existierende Checks (siehe unten), keine aktiven Check-IDs.
- **manualCheck**: nicht `null` → das Ergebnis enthält zusätzlich ein Element **MANUAL REVIEW REQUIRED**, auch wenn der automatische Teil PASS ist. `module.manual-review` liefert immer nur MANUAL REVIEW REQUIRED.
- **Empfohlene Abbildung Ergebnis → Status**:

  | Situation | Status |
  |---|---|
  | automatischer Check bestanden, kein `manualCheck` | PASS |
  | automatischer Check bestanden, `manualCheck` vorhanden | PASS + MANUAL REVIEW REQUIRED |
  | Check nicht bestanden, severity `blocker` oder `major` | FAIL |
  | Check nicht bestanden, severity `minor` / `info` | WARNING |
  | Check nicht ausführbar (fehlende Eingangsdaten, Netzwerkfehler) | MANUAL REVIEW REQUIRED – nie PASS |
  | `module.manual-review` | MANUAL REVIEW REQUIRED |

  Rechtliche Freigabe nur, wenn **kein FAIL bei blocker-Regeln** und **alle MANUAL-REVIEW-Punkte von blocker-Regeln** von einem Menschen abgeschlossen wurden.

### Vokabular `legalForms` (Vorschlag – im Auftrag nicht festgelegt)

`einzelunternehmen` (nicht eingetragen), `ek` (eingetragener Kaufmann), `gbr`, `egbr` (im Gesellschaftsregister eingetragen, § 707a BGB), `ohg`, `kg` (inkl. GmbH & Co. KG), `gmbh`, `ug`, `ag`, `ev`. Die Engine muss die Profilwerte darauf abbilden. Weitere Formen (PartG/PartG mbB, eG, KGaA, Stiftung, Ltd./ausländische Rechtsformen) sind noch **nicht** abgedeckt → MANUAL REVIEW.

| Rechtsform | zusätzlich zu Name/Anschrift/E-Mail relevante Regeln |
|---|---|
| Einzelunternehmen | provider-identity (Vor- und Nachname!), ggf. vat-id, economic-id, regulated-profession |
| e.K. | legal-form („e.K.“ etc.), register-entry, business-letters-kaufmann |
| GbR / eGbR | legal-form, representatives-partnerships; eGbR zusätzlich egbr-designation, register-entry |
| OHG / KG | legal-form, representatives-partnerships, register-entry, business-letters-kaufmann |
| GmbH / UG | legal-form, representatives-legal-persons, register-entry, capital-disclosure, liquidation-status, business-letters-gmbh; UG zusätzlich ug-designation |
| AG | wie GmbH, business-letters-ag |
| e.V. | legal-form, representatives-legal-persons, register-entry (Vereinsregister) |

## Aktualisierung einer Regel

1. Primärquelle erneut abrufen (siehe `sources.json`), Änderungen am Wortlaut/Status prüfen.
2. Regel anpassen, `lastReviewed` auf das Prüfdatum setzen, `sources[].retrieved` aktualisieren.
3. `ruleVersion` nach SemVer erhöhen: **patch** = nur Text/Quellen; **minor** = neue/geänderte Params oder Bedingungen ohne Verschärfung; **major** = Verschärfung, neue `requiredFields`, Severity-Erhöhung oder neue Pflicht.
4. Neue Quellen in `germany/sources.json` mit `establishes` (eine Zeile) und `type` eintragen.
5. Alle JSON-Dateien parsen und prüfen, dass jede Regel ≥ 1 Primärquellen-URL hat (siehe Validierung).
6. Inhaltliche Änderungen mit rechtlicher Wirkung: Vier-Augen-Prinzip, bei `LAWYER REVIEW`-Regeln anwaltliche Freigabe dokumentieren.
7. Nie eine Regel stillschweigend löschen: aufgehobene Pflichten bleiben als Regel mit Hinweis bestehen, wenn veraltete Inhalte aktiv entfernt werden müssen (Beispiel `de.ecommerce.odr-link-obsolete`).

### Validierung (manuell bis ein Skript existiert)

```bash
find legal-rules -name '*.json' -exec python3 -m json.tool {} \; > /dev/null && echo OK
```

Zusätzlich muss jede Regel: nur erlaubte `checkId`s und Bedingungen verwenden, `module.manual-review` immer mit `manualCheck` kombinieren und mindestens eine Quelle auf einem Primärquellen-Host haben (gesetze-im-internet.de, eur-lex.europa.eu, recht.bund.de, gesetze-bayern.de, datenschutzkonferenz-online.de, bundesfachstelle-barrierefreiheit.de).

## Review-Rhythmus

- **Quartalsweise** (Jan/Apr/Jul/Okt): alle Quellen in `sources.json` auf Änderungen prüfen; DSK-Liste der Orientierungshilfen, Aktualitätendienst von gesetze-im-internet.de und Bundesgesetzblatt (recht.bund.de) durchsehen.
- **Ereignisbezogen sofort**: neue DSK-Orientierungshilfe oder -Beschluss; Urteil des EuGH/BGH zu Impressum, Cookies, Einbettungen; Änderungen an DDG, TDDDG, BGB-Fernabsatz, PAngV, BFSG/BFSGV, MStV.
- **Beobachtungsliste (Stand 2026-11-02)**:
  - EU „Digital Omnibus“ – Kommissionsvorschlag zur Verlagerung der Cookie-Regeln in die DSGVO (Art. 88a/88b). Laut Berichten hat der Rat am 21.10.2026 ein Verhandlungsmandat ohne diese Artikel beschlossen; Parlamentsposition offen. **Kein geltendes Recht** – § 25 TDDDG gilt unverändert.
  - EuGH C-703/25 P (Latombe) – Rechtsmittel gegen die Bestätigung des EU-US Data Privacy Framework. Bei Ungültigerklärung: `de.privacy.third-country-transfers` und alle US-Abschnitte in `datenschutz-sections.json` sofort anpassen.
  - Vergabe der Wirtschafts-Identifikationsnummer durch das BZSt (Abschluss für 2026 angekündigt).
  - Harmonisierte Normen zum European Accessibility Act (Konformitätsvermutung für BFSG).
  - Beschäftigtendatenschutzgesetz (Ersatz für § 26 BDSG nach EuGH C-34/21).
  - Musterwiderrufsbelehrung/-formular in der seit 19.06.2026 geltenden Fassung (Anlagen zum EGBGB).

## Quellenpolitik

- **Nur Primärquellen** als Grundlage: amtliche Gesetzestexte (gesetze-im-internet.de, Landesrechtsportale), EU-Recht (EUR-Lex), Bundesgesetzblatt (recht.bund.de / BMJ), Veröffentlichungen von DSK, BfDI und Landesdatenschutzbehörden, Material der Bundesfachstelle Barrierefreiheit.
- **Rechtsprechung** (curia.europa.eu, Bundes- und Landesgerichte) nur als `type: "guidance"` – sie stützt eine Regel, begründet sie aber nie allein.
- **Blogs, Kanzlei-Artikel, Generatoren, IHK-Merkblätter** dürfen nur helfen, Primärquellen zu finden. Sie werden nicht zitiert.
- Jede Quelle trägt ein Abrufdatum. Rechtliche Fakten werden bei jeder Review neu verifiziert, nicht aus dem Gedächtnis übernommen.

## Wichtige Rechtsänderungen seit 2024 (in diesem Regelwerk berücksichtigt)

| Seit | Änderung | Regeln |
|---|---|---|
| 01.01.2024 | MoPeG: eingetragene GbR muss „eGbR“ führen (§ 707a BGB) | `de.imprint.egbr-designation` |
| 14.05.2024 | TMG → **DDG** (§ 5 DDG statt § 5 TMG), TTDSG → **TDDDG** (§ 25 unverändert). Verweise auf „§ 5 TMG“/„TTDSG“ in Impressum/DSE sind veraltet | `de.imprint.*`, `de.consent.*` |
| Nov 2024 | DSK-OH Digitale Dienste Version 1.2 (aktuell, keine neuere Fassung am 2026-11-02) | `de.consent.*`, `de.privacy.*` |
| Ende 2024 | Vergabe der W-IdNr. (§ 139c AO) beginnt; Angabe nach § 5 Abs. 1 Nr. 6 DDG | `de.imprint.economic-id` |
| 13.12.2024 | GPSR (VO (EU) 2023/988) gilt – Produktangaben im Online-Angebot (Art. 19) | `de.ecommerce.product-safety-info` |
| 01.04.2025 | EinwV vom 06.02.2025 (BGBl. 2025 I Nr. 32) – anerkannte Einwilligungsverwaltungsdienste – in Kraft | `de.consent.pims-information` |
| 28.06.2025 | **BFSG** gilt für B2C-E-Commerce-Dienstleistungen; Kleinstunternehmen (Dienstleistungen) ausgenommen | `de.accessibility.*` |
| 20.07.2025 | **OS-Plattform eingestellt**, VO 524/2013 aufgehoben (VO 2024/3228) → Link-Pflicht entfallen, alte Links entfernen | `de.ecommerce.odr-link-obsolete` |
| 03.09.2025 | EuG bestätigt EU-US DPF (T-553/23); Rechtsmittel C-703/25 P anhängig | `de.privacy.third-country-transfers` |
| 01.12.2025 | Aktuelle Fassung des MStV (§ 18 unverändert, verweist auf §§ 5, 6 DDG) | `de.imprint.editorial-responsible` |
| 2026 (Datum nicht verifiziert) | UWG-Anhang enthält Verbote nicht belegter allgemeiner Umweltaussagen und eigener Nachhaltigkeitssiegel (Nr. 2a, 4a, 4b – Umsetzung RL (EU) 2024/825) | `de.ecommerce.environmental-claims` |
| 19.06.2026 | **Elektronische Widerrufsfunktion** „Vertrag widerrufen“ (§ 356a BGB, BGBl. 2026 I Nr. 28, RL (EU) 2023/2673) | `de.ecommerce.withdrawal-function`, `de.ecommerce.withdrawal-information` |

## Anwaltliche Prüfung erforderlich

Folgende Punkte kann die Engine nicht entscheiden; sie sind in den Regeln mit `LAWYER REVIEW` markiert:

1. Rechtsgrundlagen-Bewertung, insbesondere Interessenabwägungen nach Art. 6 Abs. 1 lit. f DSGVO (`de.privacy.legal-basis`).
2. Einstufung von Cookies/Analyse als „unbedingt erforderlich“ (`de.consent.required-determination`), OSM-Drittkacheln.
3. Gemeinsame Verantwortlichkeit bei Einbettungen (YouTube etc.), Auftragsverarbeitung vs. eigene Verantwortlichkeit (`de.privacy.processor-agreements`).
4. Ob ein Unternehmensblog „journalistisch-redaktionell“ ist (`de.imprint.editorial-responsible`).
5. Vertretungsangaben bei Personengesellschaften, GmbH & Co. KG (`de.imprint.representatives-partnerships`).
6. Verhältnis USt-IdNr./W-IdNr. im Impressum (`de.imprint.economic-id`).
7. Berufsrecht reglementierter Berufe über DDG/DL-InfoV hinaus (`de.imprint.regulated-profession`).
8. Widerrufsbelehrung je Vertragstyp und aktuelle Muster (`de.ecommerce.withdrawal-information`).
9. BFSG-Grenzfälle (Buchung ohne Entgelt, Anfrage mit späterem Vertragsschluss, B2B-Shops) (`de.accessibility.bfsg-applicability`).
10. Rechtsgrundlage und Löschfristen bei Bewerberdaten (`de.recruiting.legal-basis`, `de.recruiting.retention`).
11. Newsletter-Bestandskundenausnahme und Tracking in E-Mails (`de.consent.newsletter-opt-in`).
12. Gesundheitsdaten in Buchungsformularen (`de.privacy.booking-form-minimization`).
13. Umwelt-/Nachhaltigkeitsaussagen und Siegel (`de.ecommerce.environmental-claims`).

## Verweise aus Skills

Skills zitieren Regeln als `legal-rules/germany/<kategorie>/<datei>.json` bzw. über die Regel-`id` (z. B. `de.consent.reject-works`) und Abschnitte der Datenschutzerklärung über `datenschutz-sections.json#<key>` (z. B. `#youtube`). Das Feld `consentRequiredUnderTDDDG25` (`yes`/`no`/`depends`) je Abschnitt ist die Quelle für `consentRequired` in `privacy-inventory.json`; `depends` → MANUAL REVIEW REQUIRED.

## Proposed check IDs

Echte Anforderungen, für die es noch keinen Check gibt. Die betroffenen Regeln nutzen vorerst `module.manual-review` und nennen den Vorschlag in `params.proposedCheck`.

| Vorgeschlagene checkId | Zweck | Regeln |
|---|---|---|
| `content.no-obsolete-odr-link` | Keine Links auf ec.europa.eu/consumers/odr und keine Verweise auf Art. 14 ODR-VO; keine veralteten Normzitate („§ 5 TMG“, „TTDSG“, „§ 55 RStV“) | `de.ecommerce.odr-link-obsolete`, `de.imprint.editorial-responsible` |
| `ecommerce.vsbg-statement-present` | Aussage zur Teilnahme an Verbraucherschlichtung auf der Website | `de.ecommerce.vsbg-dispute-info` |
| `ecommerce.order-button-label` | Finaler Bestellbutton „zahlungspflichtig bestellen“ o. ä. | `de.ecommerce.button-solution` |
| `ecommerce.withdrawal-function-present` | Button „Vertrag widerrufen“ + Bestätigungsschritt erreichbar | `de.ecommerce.withdrawal-function` |
| `consent.banner-information-complete` | Banner nennt Zwecke, Anbieter, Laufzeiten, Drittland; Abgleich mit CMP-Konfiguration | `de.consent.informed` |
| `accessibility.automated-audit` | axe-/WCAG-2.1-AA-Teilprüfung (nur Teilabdeckung, Rest manuell) | `de.accessibility.requirements` |
| `accessibility.statement-present` | Barrierefreiheitsinformationen nach Anlage 3 BFSG vorhanden | `de.accessibility.statement` |
| `recruiting.job-ad-wording` | Heuristische Prüfung von Stellenanzeigen auf AGG-kritische Begriffe (nur WARNING/MANUAL REVIEW) | `de.recruiting.non-discriminatory-ads` |
| `email.business-letter-footer` | Pflichtangaben in generierten E-Mail-Vorlagen (§ 37a/§ 125 HGB, § 35a GmbHG, § 80 AktG) | `de.imprint.business-letters-*` |
| `content.reviews-provenance` | Herkunft/Echtheitshinweis für Bewertungen und Testimonials | `de.ecommerce.reviews-and-testimonials` |
| `content.claims-substantiated` | Umwelt-/Nachhaltigkeits- und sonstige Werbeaussagen gegen hinterlegte Nachweise prüfen | `de.ecommerce.environmental-claims` |
| `assets.license-known` | Urheberrechtliche Lizenz je Asset (getrennt von Personenabbildungen) | (neue Kategorie nötig, s. u.) |

## Proposed conditions

| Bedingung | Warum | Regeln |
|---|---|---|
| `hasEconomicId` | W-IdNr. zugeteilt → Angabe nach § 5 Abs. 1 Nr. 6 DDG automatisch prüfbar | `de.imprint.economic-id` |
| `requiresPermit` | erlaubnispflichtige Tätigkeit → Aufsichtsbehörde (§ 5 Abs. 1 Nr. 3 DDG) | `de.imprint.supervisory-authority` |
| `hasProfessionalLiabilityInsurance` | DL-InfoV § 2 Abs. 1 Nr. 11 | `de.imprint.professional-liability-insurance` |
| `concludesDistanceContractsOnline` | Shop **oder** entgeltliche Online-Buchung → § 356a BGB, BFSG | `de.ecommerce.withdrawal-function`, `de.accessibility.*` |
| `offersSubscriptions` | § 312k BGB Kündigungsbutton | `de.ecommerce.cancellation-button` |
| `isMicroEnterprise` | BFSG-Ausnahme (§ 3 Abs. 3 BFSG) | `de.accessibility.*` |
| `employeesOver10` | § 36 Abs. 3 VSBG | `de.ecommerce.vsbg-dispute-info` |
| `sellsPhysicalProducts` | GPSR Art. 19, PAngV-Grundpreis | `de.ecommerce.product-safety-info`, `de.ecommerce.price-indication` |
| `hasDataProtectionOfficer` | Art. 13 Abs. 1 lit. b DSGVO | `de.privacy.controller-identity` |

## Proposed CustomerLegalProfile fields

`professionalLiabilityInsurer` (Name, Anschrift, Geltungsbereich), `supervisoryBoardChair`, `shareCapital` + `outstandingContributions`, `inLiquidation`, `dataProtectionOfficer`, `employeeCount` (Stichtag 31.12. Vorjahr), `annualTurnover`, `balanceSheetTotal`, `consumerArbitration` (bereit/verpflichtet/nicht + Stelle).

## Bewusst nicht abgedeckt (Kategorie/Check fehlt)

- **Urheberrecht/Lizenzen** an Bildern, Texten, Fonts (UrhG) – vorgeschlagene Kategorie `copyright`, Check `assets.license-known`.
- **KI-Transparenz** (Art. 50 KI-VO, z. B. Chatbots, KI-generierte Bilder) – Geltungsbeginn und etwaige Verschiebungen durch den „Digital Omnibus“ nicht verifiziert; vorgeschlagene Kategorie `ai-transparency`.
- **Audiovisuelle Mediendienste** (§ 5 Abs. 1 Nr. 8 DDG) und **Social-Bots** (§ 18 Abs. 3 MStV) – für Unternehmenswebsites selten.
- **Digital Services Act** (Kontaktstellen, Melde- und Abhilfeverfahren) – nur für Vermittlungsdienste/Plattformen relevant (z. B. bei Nutzerinhalten).
- Rechtsformen außerhalb des obigen Vokabulars sowie ausländische Anbieter.
