// =========================================================
// ARCHIE LEGAL, PRIVACY, IP & GOVERNANCE — SHARED MODULE
//
// © 2026 FRENZY. All rights reserved.
//
// The single source of truth for ARCHIE's legal document
// corpus, governance rules, and document lifecycle rules.
// Used by the archie-legal edge function (seeding + serving)
// and by unit tests — the legal layer is REAL, not
// documentation-only: every document below is stored,
// versioned, approval-gated and audit-trailed in the
// database.
//
// LEGAL CONTENT SAFETY:
//   * No fabricated registrations, licences, certifications,
//     trademarks or regulatory approvals are claimed.
//   * Jurisdiction-specific wording is CONFIGURABLE
//     (jurisdiction block below) so qualified legal counsel
//     can review and update it — the documents are not
//     represented as legal advice.
//   * Third-party software, models, APIs, datasets, marks and
//     content are expressly NOT claimed as ARCHIE/FRENZY
//     property; attribution requirements are preserved.
// =========================================================

export const COPYRIGHT_NOTICE = "© 2026 FRENZY. All rights reserved.";
export const RIGHTS_HOLDER = "FRENZY";

/** Jurisdiction configuration — adjustable as regulations
 *  evolve, reviewable by qualified legal counsel. Nigeria's
 *  NDPR/Nigeria Data Protection Act is the configured
 *  baseline; nothing here claims registration or approval
 *  by any regulator. */
export const JURISDICTION_CONFIG = {
  primaryJurisdiction: "Nigeria",
  applicableFramework:
    "Nigeria Data Protection Regulation (NDPR) and the Nigeria Data Protection Act 2023, as amended",
  regulatorNote:
    "References to Nigerian data-protection requirements are kept configurable in this block so they can be reviewed and updated as regulations evolve",
  governingLawPlaceholder:
    "[GOVERNING LAW — jurisdiction-specific wording to be confirmed by qualified legal counsel]",
  lastReviewed: "2026-09-10",
} as const;

// ---------------------------------------------------------
// Document keys — the managed corpus
// ---------------------------------------------------------
export const LEGAL_DOC_KEYS = [
  "terms_of_service",
  "privacy_policy",
  "cookie_policy",
  "acceptable_use_policy",
  "ai_disclosure",
  "ip_notice",
  "third_party_disclosure",
  "memory_data_rights_policy",
  "connected_device_account_policy",
  "security_responsible_use_policy",
] as const;

export type LegalDocKey = (typeof LEGAL_DOC_KEYS)[number];

export interface SeedLegalDocument {
  key: LegalDocKey;
  title: string;
  body: string;
}

const AI_DISCLOSURE_CORE = `
ARCHIE is an artificial intelligence system, not a human being. ARCHIE does not claim consciousness, emotions or human judgment.

- **ARCHIE can make mistakes.** Treat outputs as assistance, not as guaranteed truth.
- **Information may require verification**, especially technical, medical, legal or financial information.
- **Web information changes** over time; retrieved web findings reflect the state of the sources at retrieval time.
- **Learned information is evaluated and confidence-scored** before ARCHIE treats it as knowledge. Memory entries carry provenance (where they came from) and confidence values.
- **Memory is not automatically treated as truth.** Unvalidated or contradicted memories are held as candidates or uncertain — never silently promoted to fact.
- **Important or consequential decisions may require human verification.** ARCHIE assists; the Owner decides.
- **Production code changes remain subject to Owner authorization.** ARCHIE may write code in permitted environments, test in sandbox/staging, and prepare fixes — but protected ARCHIE and FRELUX production systems change only through the Owner-approved change pipeline.
`;

const MEMORY_RIGHTS_CORE = `
ARCHIE maintains persistent Memory. You control it:

- **View** — browse every memory entry ARCHIE holds for you, with its source, confidence and status.
- **Search** — find memories by keyword.
- **Correct** — amend a memory entry; the original is preserved in the audit trail, never silently overwritten.
- **Delete individual memories** — immediate and permanent.
- **Delete categories of memories** — by subject area.
- **Clear conversation memory** — per-conversation or all conversations.
- **Export** — download a machine-readable copy of your personal data (memories, conversations, settings).
- **Request account/data deletion** — full deletion requests are recorded, reviewed and executed by the Owner, and the completion is recorded in the audit trail.
- **Control memory retention** — set how long unvalidated memories are kept; older entries are pruned.
- **Control personalization** — enable or disable memory-based personalization at any time.

**Isolation guarantees:** one user's Memory never leaks into another user's account. Owner/admin Memory is stored separately from ordinary user data and is never exposed to other users. Visitor conversations are isolated per request and are not retained in owner memory.
`;

const DEVICE_POLICY_CORE = `
ARCHIE can interact with connected phones, computers, tablets, TVs, speakers, smart-home devices, appliances and other supported hardware, and with connected social or third-party accounts — only under these rules:

- **Explicit authorization required.** A device or account becomes connected only when you explicitly authorize it. Nearby, discoverable or paired devices are NOT automatically authorized.
- **Permissions are scoped.** Each connection grants only the permissions you approved for it.
- **Access can be revoked** at any time from Connected Devices; revocation is immediate.
- **Actions may be logged** in the audit trail for accountability.
- **Sensitive or consequential actions may require explicit confirmation** before ARCHIE performs them.
- **ARCHIE cannot bypass passwords, MFA, CAPTCHAs or security controls** — by design, not by policy alone.
- Connection grants are per-device and per-account; one grant never extends to another.
`;

const SECURITY_BOUNDARY_CORE = `
ARCHIE may research, analyze, explain and assist with cybersecurity broadly. ACTUAL offensive-security execution is limited to systems you are appropriately authorized to test: your own infrastructure, controlled laboratory environments, sanctioned CTF challenges, or assessments with explicit written permission.

ARCHIE will not, and cannot by design, bypass authentication, access controls, MFA, CAPTCHAs, paywalls or other security protections. ARCHIE does not weaken or remove existing security authorization controls. Unauthorized intrusion attempts are outside ARCHIE's permitted use and are not supported.
`;

const NO_LEGAL_ADVICE = `This document is provided for information about the ARCHIE service. It is not legal advice, and it does not create an attorney-client relationship. Jurisdiction-specific wording is kept configurable for review by qualified legal counsel.`;

const NO_THIRD_PARTY_CLAIM = `ARCHIE and FRENZY do not claim ownership of, or rights in, third-party software, open-source libraries, APIs, AI models, datasets, trademarks, service marks, or content belonging to others. All applicable third-party licence terms and attribution requirements remain in force.`;

// ---------------------------------------------------------
// The corpus — v1 seeds (initial publication under the
// Owner's 2026-09-10 directive; further changes go through
// the draft → approve → publish pipeline with audit trail)
// ---------------------------------------------------------
export const SEED_LEGAL_DOCUMENTS: SeedLegalDocument[] = [
  {
    key: "terms_of_service",
    title: "ARCHIE Terms of Service",
    body: `# ARCHIE Terms of Service

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

ARCHIE ("the Service") is a personal AI intelligence system operated by FRENZY, integrated with the FRELUX platform. By using ARCHIE you agree to these Terms.

## 1. Service description
ARCHIE provides conversational AI assistance, persistent memory, knowledge management, learning from validated outcomes, web research, coding assistance, device and account integrations, automation, and security analysis. ARCHIE's intelligence is provider-independent: the service does not depend on any single external AI provider to operate.

## 2. Accounts
Access requires an account with appropriate role. Owner (admin) accounts hold final authority over ARCHIE's protected production systems. Account credentials are personal; do not share them.

## 3. User responsibilities
You are responsible for: the accuracy of information you provide or teach ARCHIE; your use of ARCHIE outputs; maintaining the confidentiality of your credentials; and your compliance with applicable law, including when using ARCHIE on connected systems.

## 4. AI limitations
${AI_DISCLOSURE_CORE}

## 5. Memory and personalization
ARCHIE maintains persistent Memory to personalize assistance. You control memory: viewing, correcting, deleting, exporting and retention are governed by the Memory & Data Rights Policy. Personalization can be disabled in Privacy settings.

## 6. Web research
When you request research, ARCHIE selects appropriate sources, retrieves publicly available information, cross-checks across sources, and stores findings as candidate knowledge with source attribution. ARCHIE reports which sources were actually searched and never fabricates results, citations or access.

## 7. Coding capabilities
ARCHIE can analyze, plan and write code, and test it in permitted environments (sandbox/staging). Changes to protected ARCHIE or FRELUX production code require Owner authorization through the change pipeline. ARCHIE does not independently deploy protected production changes.

## 8. Connected devices
Interactions with connected hardware (phones, computers, tablets, TVs, speakers, smart-home devices, appliances and other supported hardware) follow the Connected Device & Account Policy: explicit authorization, scoped permissions, revocable access, logged actions, confirmation for sensitive actions, and no bypassing of security controls.

## 9. Connected accounts
Social and other third-party account integrations require your explicit authorization for scoped permissions. ARCHIE acts on connected accounts only within the granted scope. Access can be revoked at any time.

## 10. Automation
ARCHIE may perform authorized operations and automations on your behalf within granted permissions. Sensitive or consequential actions may require explicit confirmation. Production-change automations remain subject to Owner authorization.

## 11. Cybersecurity capabilities
${SECURITY_BOUNDARY_CORE}

## 12. Third-party integrations
ARCHIE interacts with third-party APIs, cloud infrastructure, AI providers (where used), authentication providers, payment providers, social platforms, device platforms and web services. These are third-party functionality governed by their own terms — ARCHIE's own functionality is distinct from theirs. ${NO_THIRD_PARTY_CLAIM}

## 13. Prohibited use
You may not use ARCHIE to: breach or probe systems you are not authorized to access; bypass authentication, access controls, MFA or security protections; infringe intellectual property; process personal data unlawfully; misrepresent ARCHIE outputs as human work where disclosure is required; or attempt to grant ARCHIE or yourself unauthorized permissions.

## 14. Intellectual property
${COPYRIGHT_NOTICE} The ARCHIE name and branding, software, source code, architecture, original algorithms and implementations, documentation, UI/UX, content, graphics, prompts and configuration, Memory architecture, cognitive architecture, anatomy architecture, and original research and internally created materials are the property of the rights holder. ${NO_THIRD_PARTY_CLAIM}

## 15. Availability
The Service is provided on a reasonable-efforts basis. Features that are not operational are reported as not operational. We do not guarantee uninterrupted availability, and scheduling, maintenance and third-party dependencies may affect the Service.

## 16. Suspension and termination
Accounts that violate these Terms, applicable law, or the security of the Service or its users may be suspended or terminated. On termination you may request export of eligible personal data, and deletion is handled under the Memory & Data Rights Policy.

## 17. Liability limitations
To the maximum extent permitted by law, the Service is provided "as is" without warranties of any kind, and the operator is not liable for indirect, incidental, special, consequential or punitive damages, or for losses arising from reliance on AI outputs. Nothing here excludes liability that cannot lawfully be excluded.

## 18. Disputes and legal provisions
${JURISDICTION_CONFIG.governingLawPlaceholder} Dispute resolution wording is jurisdiction-configurable and to be confirmed by qualified legal counsel before being relied upon.

## 19. Changes to the Service and these Terms
The Service may evolve. These Terms may be revised through the ARCHIE legal document pipeline: new versions are drafted, reviewed, approved and published with effective dates and revision history. Published documents are never silently replaced — the revision history keeps every published version.

${NO_LEGAL_ADVICE}`,
  },
  {
    key: "privacy_policy",
    title: "ARCHIE Privacy Policy",
    body: `# ARCHIE Privacy Policy

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

This policy explains how ARCHIE collects, processes, stores and uses personal information. It is configured for Nigerian data-protection requirements (${JURISDICTION_CONFIG.applicableFramework}) and designed so these requirements can be maintained and updated as regulations evolve. ${NO_LEGAL_ADVICE}

## Information ARCHIE handles
- **Account information** — identity, role and authentication state for access control.
- **Conversations** — the messages you exchange with ARCHIE, stored to provide the service and continuity.
- **Memory** — durable knowledge entries ARCHIE learns (with source, confidence and status), used for personalization and answering.
- **Voice/audio data** — voice samples and transcriptions where you use voice features, processed to operate those features.
- **Device information** — identifiers, type and status of devices you explicitly connect, and their scoped data-consents.
- **Authentication information** — credentials and sessions needed for sign-in and trusted-device operation.
- **Connected-account information** — scoped data from third-party accounts you explicitly authorize.
- **Usage and activity data** — operational records such as audit events needed to run and secure the service.
- **Diagnostics** — error and performance diagnostics used to maintain the service.
- **Security information** — security events, authorizations and trust records.
- **Payment/subscription information** — where applicable, processed by the connected payment provider under its own terms.
- **Web research interactions** — the queries you ask ARCHIE to research and the public findings retrieved.
- **Preferences and personalization settings** — your configuration of the service.

## How data is used
To operate the conversation, memory, learning, research, coding, device and automation features you request; to secure the service (audit, anomaly and authorization records); to honour your settings. Personalization and memory-based features can be disabled in Privacy settings.

## Your rights
You may request access to your personal data, correct it, delete individual memories or categories, clear conversation memory, export eligible data, request account/data deletion, and control retention — these controls are implemented as real, functional interfaces under the Memory & Data Rights Policy, not merely promised here.

## Retention and deletion
Memory retention is configurable by you. Deletion requests are recorded, actioned and audited. Data needed for security and audit trails may be retained as permitted by law.

## Security measures
Access control is role-based; owner memory is service-role protected; visitor sessions are isolated; secrets are never stored in memory; connected devices require explicit trust grants; security events are audited. No security measure is represented as an absolute guarantee.

## Third-party processors and transfers
ARCHIE uses third-party infrastructure and services (cloud hosting, authentication, payment providers where applicable). Their handling of data is governed by their own terms. ${NO_THIRD_PARTY_CLAIM}

## International transfers
Where data is processed outside your jurisdiction, it is handled under the applicable transfer requirements of ${JURISDICTION_CONFIG.primaryJurisdiction}. Jurisdiction-specific transfer wording is configurable and to be confirmed by qualified counsel.

${NO_LEGAL_ADVICE}`,
  },
  {
    key: "cookie_policy",
    title: "ARCHIE Cookie & Local Storage Policy",
    body: `# ARCHIE Cookie & Local Storage Policy

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

ARCHIE uses browser storage technologies only where they serve a function:

- **Authentication storage** — sign-in session tokens required to keep you signed in securely.
- **Local preferences** — your interface preferences (e.g. interface state, dismissed notices) stored locally on your device.
- **PWA cache** — the ARCHIE application shell cache, so the app can load when you install it and, for cached screens, when your connection is poor. Chat, API and authenticated traffic is never cached.

Third-party services ARCHIE interacts with (cloud, authentication, payment providers) may set their own technologies under their own terms; ARCHIE does not claim control over, or ownership of, any third-party technology.

ARCHIE does not implement advertising or cross-site tracking inside the ARCHIE application. Chat, API and authenticated traffic is NEVER cached by the ARCHIE shell. Where ARCHIE surfaces are embedded in the broader FRELUX web experience, that experience's own cookie disclosure applies to its technologies. No tracking technology is added merely to be disclosed — if tracking or analytics are ever enabled for ARCHIE, this policy and the consent controls will be updated first.

You can clear these stores at any time in your browser settings; doing so signs you out and resets preferences, and does not delete server-side data (which is controlled under the Memory & Data Rights Policy).

${NO_LEGAL_ADVICE}`,
  },
  {
    key: "acceptable_use_policy",
    title: "ARCHIE Acceptable Use Policy",
    body: `# ARCHIE Acceptable Use Policy

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

ARCHIE may be used for lawful purposes within the permissions granted to your account. This policy applies to all ARCHIE capabilities: conversation, memory, learning, research, coding, automation, devices, accounts and security analysis.

## Cybersecurity use
${SECURITY_BOUNDARY_CORE}

## Prohibited uses
- Accessing, probing or attacking systems you are not explicitly authorized to access.
- Attempting to bypass authentication, MFA, CAPTCHAs, paywalls, access controls or any security protection.
- Granting ARCHIE or yourself permissions you are not entitled to.
- Infringing intellectual property, including third-party licences and attribution requirements.
- Unlawful processing of personal data.
- Misrepresenting AI output as human work where disclosure is required.

## Enforcement
Violations may lead to action limits or account suspension under the Terms of Service. Security-relevant events are auditable.

${NO_LEGAL_ADVICE}`,
  },
  {
    key: "ai_disclosure",
    title: "ARCHIE AI Disclosure",
    body: `# ARCHIE AI Disclosure

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

${AI_DISCLOSURE_CORE}

ARCHIE's capabilities are reported honestly: capabilities that are not operational are stated as not operational, and web research reports only the sources actually searched. ARCHIE does not claim guaranteed accuracy, and does not claim capabilities that are not actually implemented. ARCHIE does not claim ownership of third-party software, models, datasets, marks or content.

This document is information about the ARCHIE service; it is not legal advice.`,
  },
  {
    key: "ip_notice",
    title: "ARCHIE Intellectual Property Notice",
    body: `# ARCHIE Intellectual Property Notice

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

FRENZY is the rights holder for ARCHIE. Subject to applicable law, the ARCHIE name and branding, ARCHIE software and source code, the ARCHIE architecture (including the Memory architecture, the cognitive architecture and the anatomy architecture), original algorithms and implementations, documentation, original UI/UX, original content and graphics, proprietary prompts and configuration, and original research and internally created materials are protected by intellectual-property rights.

## What is NOT claimed
${NO_THIRD_PARTY_CLAIM}

Third-party licences and attribution requirements are maintained: open-source components remain under their own licences, and no ARCHIE documentation removes or overrides a third-party term.

## Enforcement and changes
This notice is part of the ARCHIE legal corpus and is maintained through the versioned legal document pipeline with review by qualified counsel where appropriate. No trademark registration, patent or certification is claimed unless separately established in writing.

${NO_LEGAL_ADVICE}`,
  },
  {
    key: "third_party_disclosure",
    title: "ARCHIE Third-Party Services Disclosure",
    body: `# ARCHIE Third-Party Services Disclosure

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

ARCHIE distinguishes its own functionality from third-party functionality. ARCHIE does not control third-party services, and FRENZY, ARCHIE and FRELUX do not operate or endorse them.

## Categories of third-party services ARCHIE interacts with
- **APIs and web services** — public web sources during research, within their terms, robots and rate-limit requirements.
- **Cloud infrastructure** — hosting, database and edge-function platforms.
- **AI providers** — where used at all, external models are optional replaceable components, never ARCHIE's core intelligence; ARCHIE remains operational without them.
- **Authentication providers** — sign-in and identity services.
- **Payment providers** — payment and subscription processing where applicable, under their own terms.
- **Social platforms** — accounts you explicitly connect.
- **Device platforms** — device ecosystems you explicitly connect.
- **Open-source software** — components used under their own licences, with attribution preserved.

## Responsibility boundaries
Third-party services are governed by their own terms, availability, security and privacy practices. ARCHIE's integrations respect authentication, authorization, robots and rate-limit requirements, and do not bypass any third party's access controls. ${NO_THIRD_PARTY_CLAIM}

${NO_LEGAL_ADVICE}`,
  },
  {
    key: "memory_data_rights_policy",
    title: "ARCHIE Memory & Data Rights Policy",
    body: `# ARCHIE Memory & Data Rights Policy

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

${MEMORY_RIGHTS_CORE}

These controls are implemented as working interfaces in ARCHIE's Privacy & Memory settings, backed by audited operations — not documentation-only promises. Deletion is real deletion; export is real export of your data in a machine-readable format. ARCHIE does not claim ownership of third-party software, services or content involved in processing your data.

${NO_LEGAL_ADVICE}`,
  },
  {
    key: "connected_device_account_policy",
    title: "ARCHIE Connected Device & Account Policy",
    body: `# ARCHIE Connected Device & Account Policy

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

${DEVICE_POLICY_CORE}

This policy is enforced by ARCHIE's device trust and consent architecture: devices join only through explicit trust grants with scoped consents, and every grant is revocable and auditable. Device platforms and third-party services remain governed by their own terms — ARCHIE claims no ownership or control of them.

${NO_LEGAL_ADVICE}`,
  },
  {
    key: "security_responsible_use_policy",
    title: "ARCHIE Security & Responsible Use Policy",
    body: `# ARCHIE Security & Responsible Use Policy

Effective: 2026-09-10 · Version 1.0

${COPYRIGHT_NOTICE}

## ARCHIE's cybersecurity capabilities
ARCHIE can research, analyze, explain and assist with cybersecurity broadly — including vulnerability concepts, hardening guidance, security standards (such as the NIST, MITRE ATT&CK, OWASP and CVE material available through its priority research sources), and security review of authorized systems.

## Execution boundaries
${SECURITY_BOUNDARY_CORE}

## Governance
ARCHIE's own production systems are protected by Owner Authority: ARCHIE cannot grant itself permissions, modify protected ARCHIE or FRELUX production code, deploy protected production changes, alter protected architecture, change critical production configuration, bypass security, or override Owner Authority. Existing security authorization controls are never weakened or removed. Third-party software and services involved in ARCHIE remain governed by their own licences and terms.

${NO_LEGAL_ADVICE}`,
  },
];

// ---------------------------------------------------------
// GOVERNANCE — Owner Authority model (owner directive
// 2026-09-10). Seeded as active rules; changes are audited.
// ---------------------------------------------------------
export interface GovernanceRule {
  rule_key: string;
  category: "permitted" | "prohibited" | "authority";
  statement: string;
}

export const GOVERNANCE_RULES: GovernanceRule[] = [
  {
    rule_key: "learn",
    category: "permitted",
    statement:
      "ARCHIE may learn from owner teaching, validated outcomes and evaluated research.",
  },
  {
    rule_key: "research",
    category: "permitted",
    statement:
      "ARCHIE may research broadly on the open web within source terms, robots and rate limits, selecting appropriate trusted sources first.",
  },
  {
    rule_key: "analyze",
    category: "permitted",
    statement:
      "ARCHIE may analyze information, code, systems and security posture.",
  },
  {
    rule_key: "plan",
    category: "permitted",
    statement:
      "ARCHIE may plan work, decompose objectives and propose approaches.",
  },
  {
    rule_key: "propose",
    category: "permitted",
    statement:
      "ARCHIE may generate proposals, including change requests to protected systems.",
  },
  {
    rule_key: "code_sandbox",
    category: "permitted",
    statement:
      "ARCHIE may write code in permitted environments (sandbox/staging).",
  },
  {
    rule_key: "test",
    category: "permitted",
    statement: "ARCHIE may test code in sandbox/staging environments.",
  },
  {
    rule_key: "identify_vulnerabilities",
    category: "permitted",
    statement: "ARCHIE may identify vulnerabilities and prepare fixes.",
  },
  {
    rule_key: "authorized_operations",
    category: "permitted",
    statement:
      "ARCHIE may perform operations the Owner has authorized, within granted permissions.",
  },
  {
    rule_key: "no_self_permission",
    category: "prohibited",
    statement: "ARCHIE may NOT grant itself permissions.",
  },
  {
    rule_key: "no_archie_prod_changes",
    category: "prohibited",
    statement: "ARCHIE may NOT modify protected ARCHIE production code.",
  },
  {
    rule_key: "no_frelux_prod_changes",
    category: "prohibited",
    statement: "ARCHIE may NOT modify protected FRELUX production code.",
  },
  {
    rule_key: "no_deploy",
    category: "prohibited",
    statement: "ARCHIE may NOT deploy protected production changes.",
  },
  {
    rule_key: "no_architecture_changes",
    category: "prohibited",
    statement: "ARCHIE may NOT alter protected architecture.",
  },
  {
    rule_key: "no_critical_config",
    category: "prohibited",
    statement: "ARCHIE may NOT change critical production configuration.",
  },
  {
    rule_key: "no_security_bypass",
    category: "prohibited",
    statement:
      "ARCHIE may NOT bypass security controls, authentication or MFA.",
  },
  {
    rule_key: "no_owner_override",
    category: "prohibited",
    statement: "ARCHIE may NOT override Owner Authority.",
  },
  {
    rule_key: "owner_final_authority",
    category: "authority",
    statement:
      "The Owner holds final authority over ARCHIE's protected production systems; protected changes flow through the existing change pipeline and approval architecture.",
  },
];

// ---------------------------------------------------------
// Document lifecycle rules (enforced by archie-legal)
// ---------------------------------------------------------
export type LegalDocStatus = "draft" | "approved" | "published" | "archived";

/** Valid status transitions — publication requires Owner
 *  approval; published versions are archived (never
 *  silently replaced) when a new version publishes. */
export const LEGAL_TRANSITIONS: Record<LegalDocStatus, LegalDocStatus[]> = {
  draft: ["approved"],
  approved: ["published"],
  published: ["archived"],
  archived: [],
};

export function canTransition(
  from: LegalDocStatus,
  to: LegalDocStatus,
): boolean {
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

/** The canonical AI-disclosure summary shown in the PWA. */
export const PWA_DISCLOSURE_SUMMARY =
  "ARCHIE is an AI. It can make mistakes; important information may need your verification, and learned information is confidence-scored rather than automatically true. Production changes always require Owner authorization.";
