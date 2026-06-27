# Nexus HTML Brief Design

## Brand Memory
- Product brand: Nexus.
- Product context: project-centered AI workspace for chats, briefs, tasks, boards, and team coordination.
- Artifact context: professional delivery module that turns agent work into inspectable HTML briefs.
- Tone: calm operating dashboard for project, sales, support, and leadership teams. Direct, evidence-led, source-aware, and review-gated.

## Visual System
- Use Mona Sans or Inter-style sans typography.
- Use a dark base with sharp white content, active green accents, restrained gold highlights, and cool slate data surfaces.
- Primary colors:
  - Deep base: #050506
  - Panel: #0c1014
  - Elevated panel: #111114
  - Nexus green: #03dc5d
  - Electric green: #00ff51
  - Gold accent: #d5a132
  - Cool slate: #132a3a
  - Mist text: #e9f0f5
  - Muted text: #9a9aa3
- Keep border radius tight, 8px or less.
- Use subtle borders, small glows, and chart accents. Avoid decorative blobs, oversized cards, or generic SaaS gradients.

## Artifact Layout
- First viewport should clearly signal Nexus with a compact wordmark or text fallback.
- Header should feel like a professional report, not a marketing landing page.
- Prioritize charts, KPI cards, segment tables, evidence trails, status notes, and risk notes.
- Include project, customer, workflow, support, revenue, risk, account quality, owner, and audit language only when evidence supports it.
- Every large numeric claim must be linked to provided evidence or marked as an assumption by the model.

## Brief Intent Modes
- Executive decision: recommendation-first board brief for leadership decisions.
- Operational review: dense operating readout for throughput, ownership, blockers, and next moves.
- Risk and compliance: audit-forward memo for unsupported claims, assumptions, control gaps, and source quality.
- Market intelligence: external or comparative dossier; if external sourcing is unavailable, state the limitation.
- Performance snapshot: chart-first pulse for metric movement and segment performance.
- Action plan: decision-to-execution memo with owners, sequence, and review gates.

## HTML Design Templates
- Executive Board Brief: premium board-report layout. Use a strong masthead, decision strip, executive summary, KPI row, and recommendation-first narrative.
- Ops Command Review: functional operating layout. Use compact sections, dense metric rows, operational tables, status bands, and clear next-action blocks.
- Risk & Compliance Memo: restrained audit layout. Use assumption markers, evidence ledgers, risk language, checklist scoring, and conservative visual emphasis.

## Template Selection Rules
- Use Executive Board Brief for leadership, CEO, board, investor, decision, strategy, recommendation, or executive-summary requests.
- Use Ops Command Review for ops, internal, workflow, queue, staffing, launch, execution, status, and blocker requests.
- Use Risk & Compliance Memo for risk, audit, compliance, controls, unsupported claims, quality, legal, or governance requests.
- Keep the template choice visible in the HTML metadata and evidence appendix.

## Agent Instructions
- The configured model writes the narrative from Nexus evidence only.
- Do not invent live operating metrics, customer counts, payout figures, revenue, competitor facts, or project facts.
- If the user asks for competitive analysis and web research is not available in the app, state that external sourcing is required and keep the brief to available internal data.
- HTML production should apply this design file after the markdown plan is approved.
- The evidence appendix must mention that design.md supplied the Nexus artifact presentation rules.
