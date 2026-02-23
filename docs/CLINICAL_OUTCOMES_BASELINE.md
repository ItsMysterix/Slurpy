# Clinical Outcomes Baseline & Measurement Framework

## Objective

Define measurable, ethical baselines for Slurpy's effectiveness and user welfare. These metrics inform product decisions, enable honest marketing claims, and support clinical credibility.

**Principle**: Track outcomes transparently; publish limitations alongside claims.

---

## Outcome Categories & Baselines

### 1. Engagement Outcomes

**Why**: Engagement indicates whether users find the app valuable enough to return.

| Metric | Baseline Target | Measurement | Frequency |
|---|---|---|---|
| **D1 Retention** (% users returning within 1 day) | 40% | User cohort analysis (Firebase/Segment) | Daily |
| **D7 Retention** (% users returning within 7 days) | 25% | User cohort analysis | Daily |
| **D30 Retention** (% users returning within 30 days) | 12% | Monthly cohort report | Monthly |
| **Session Completion** (% chats that reach natural close) | ≥60% | Chat session analysis (flagged by assistant closing turn) | Weekly |
| **Avg Session Length** (messages per chat) | 5–15 messages | Session analytics | Weekly |

**Baseline source**: Competitor benchmarks (Woebot D7 ~20%, Wysa D30 ~15%), internal user studies (small pilot: n=100)

**Current hypothesis**: D1 = 40%, D7 = 25% is achievable with crisis UX + personalization

---

### 2. Safety Outcomes

**Why**: Safety is non-negotiable. Track escalation rates, response times, and user-reported incidents.

| Metric | Baseline Target | Measurement | Frequency |
|---|---|---|---|
| **Crisis Detection Rate** (% of users experiencing crisis who engage CTA) | ≥75% | Safety events table (CTA clicks / crisis signals) | Daily |
| **Escalation Latency** (time from crisis detection to CTA display) | <2 seconds | App performance logs + telemetry | Daily |
| **False Positive Rate** (non-crisis users shown crisis CTA) | <5% | Manual review of flagged conversations (weekly sample) | Weekly |
| **User-Reported Safety Issues** (support tickets mentioning safety) | <1% of MAU | Support ticket taxonomy | Weekly |
| **Harm Incidents** (reports of self-harm after using app in past 7d) | Track for reporting | Incident database (manual + support channel) | As-reported |

**Baseline source**: Safety audit against Wysa/Woebot; internal crisis classifier validation (n=200 high-risk prompts)

**Current hypothesis**: Crisis detection ≥75%, latency <2s, false positive <5% is achievable with current regex classifier

---

### 3. Wellbeing Outcomes (Optional Self-Assessment)

**Why**: Measure perceived improvement in mood/anxiety/life satisfaction—core value prop.

| Metric | Baseline Target | Measurement | Frequency |
|---|---|---|---|
| **Immediate Mood Improvement** (% reporting better after session) | 55–70% | In-app post-session survey: "Did this chat help?" (yes/no/neutral) | Per session (optional) |
| **PHQ-2 Score Change** (Δ from intake to 7d later) | Δ ≥ 2 points (clinically meaningful) | Optional 2-question depression screener at signup + 7-day follow-up | 7-day intervals |
| **GAD-2 Score Change** (Δ from intake to 7d later) | Δ ≥ 2 points (clinically meaningful) | Optional 2-question anxiety screener at signup + 7-day follow-up | 7-day intervals |
| **Life Satisfaction (1–10 scale)** | Δ ≥ 1 point | Simple scalar: "How satisfied are you with life right now?" (baseline + 30d) | Monthly |

**Baseline source**: Published literature on conversational AI + CBT/DBT outcomes; peer-reviewed studies on PHQ-2/GAD-2 sensitivity

**Current hypothesis**: 55–70% report mood improvement; PHQ-2/GAD-2 responders show Δ ≥ 2 points (n=50 users, 7-day cohort)

**Ethical note**: These are **optional, consented** self-reports. We do NOT claim efficacy without evidence. Baseline is "observe and report," not "promise improvement."

---

### 4. Clinical Credibility Outcomes

**Why**: Track methodological soundness (evidence base, safety governance, transparency).

| Metric | Baseline Target | Measurement | Frequency |
|---|---|---|---|
| **Evidence-Based Features** (% of therapeutic features grounded in CBT/DBT literature) | 100% | Feature audit (cross-reference against therapist handbook) | Quarterly |
| **Adverse Event Reporting** (% of safety incidents resolved within 24h) | 100% | Incident log review | Monthly |
| **Transparency Score** (terms, privacy, limitations clearly stated) | ≥9/10 | Legal review + UX audit | Quarterly |
| **Clinical Advisory Board Alignment** (% recommendations implemented) | ≥80% | Board meeting minutes + action log | Quarterly |

**Baseline source**: Digital mental health platform standards (SAMHSA, MIND, Center for Digital Ethics)

---

## PHQ-2 & GAD-2 Integration Design

### Phase 1: Optional Baseline Assessment (v1)

**When**: At signup (optional, with clear consent)

**UI/UX**:
- Presented as **optional wellness check** (not diagnostic)
- Clear disclaimer: *"This app is not a replacement for therapy. These questions help us understand how you're feeling."*
- Simple, mobile-friendly 2-question form
- Consent checkbox: *"I agree to share my responses to help Slurpy improve."*

**Questions**:

**PHQ-2 (Depression Screening)**:
1. Over the past two weeks, how often have you had little interest or pleasure in doing things?
   - [ ] Not at all
   - [ ] Several days
   - [ ] More than half the days
   - [ ] Nearly every day

2. Over the past two weeks, how often have you felt down, depressed, or hopeless?
   - [ ] Not at all
   - [ ] Several days
   - [ ] More than half the days
   - [ ] Nearly every day

**GAD-2 (Anxiety Screening)**:
1. Over the past two weeks, how often have you felt nervous, anxious, or on edge?
   - [ ] Not at all
   - [ ] Several days
   - [ ] More than half the days
   - [ ] Nearly every day

2. Over the past two weeks, how often have you been unable to stop or control worrying?
   - [ ] Not at all
   - [ ] Several days
   - [ ] More than half the days
   - [ ] Nearly every day

**Scoring**:
- 0 = Not at all, 1 = Several days, 2 = More than half, 3 = Nearly every day
- **PHQ-2 range**: 0–6 (≥3 suggests possible depression)
- **GAD-2 range**: 0–6 (≥3 suggests possible anxiety)
- **Action**: If score ≥4 on either, show in-app crisis resource (no diagnosis, just resource)

**Data Storage**:
```sql
-- Supabase table: user_wellbeing_surveys
CREATE TABLE IF NOT EXISTS user_wellbeing_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  survey_date timestamp DEFAULT now(),
  phq2_score int,
  gad2_score int,
  post_session_mood_improvement int, -- 1-5 scale, optional
  created_at timestamp DEFAULT now()
);
CREATE INDEX idx_user_wellbeing_surveys_user_id ON user_wellbeing_surveys(user_id, survey_date DESC);
```

### Phase 2: 7-Day Follow-Up (v1.1, future)

**When**: 7 days after baseline (optional reminder / email)

**Action**:
- Prompt optional re-assessment of PHQ-2 + GAD-2
- Display change delta (e.g., "Your PHQ-2 score improved by 2 points—great work!")
- No diagnostic claims; purely informational

### Phase 1.5: Guardrails & Safety

**If user shows crisis indicators (baseline PHQ-2 ≥4 or GAD-2 ≥4)**:
- Do NOT alarm them ("You may be depressed")
- Instead: "We noticed your responses. Here are some resources that might help:" [Crisis resources]
- Direct to crisis CTA if immediate risk detected (via existing regex classifier)

---

## Effectiveness Methodology & Transparency Document

### Publication Strategy

**Goal**: Publish transparent, non-sensationalized effectiveness findings that build trust.

**Format**: White paper (10–15 pages) covering:

1. **Study Design**
   - User cohort characteristics (age range, baseline severity, locale)
   - Measurement period (6 months pilot, n=500 active users)
   - Consent & opt-in rate
   - Attrition analysis (who dropped out, why)

2. **Primary Outcomes**
   - D7 retention vs. competitor benchmark
   - Session completion rate (how many chats reached natural close)
   - Reported mood improvement (% answering "yes" to post-session survey)

3. **Safety Outcomes**
   - Crisis escalation rates (how many users who signaled crisis were offered resources)
   - False positive analysis (how many non-crisis users showed false alarm)
   - Response time to crisis detection

4. **Wellbeing Outcomes** (if PHQ-2/GAD-2 deployed)
   - Change scores (mean Δ PHQ-2, Δ GAD-2 among responders)
   - Confidence intervals + statistical significance test
   - Subgroup analysis (e.g., outcome by age, baseline severity)

5. **Limitations**
   - No RCT control (we can't ethically deny support to users for research)
   - Self-selection bias (users who opt in may differ from broader population)
   - No long-term follow-up yet (data limited to 6-month engagement window)
   - Single-arm design (observational, not causal claims)

6. **Clinical Positioning**
   - NOT positioned as "cure" or "replacement for therapy"
   - Positioned as "supportive daily tool, augmenting professional care"
   - Clear evidence base links (RCTs on CBT/DBT, chatbot efficacy literature)

7. **Transparency on Revenue**
   - Disclose Stripe/payment processing (if any revenue model)
   - Disclose data usage (e.g., "de-identified chat metadata used to improve model")

### Distribution

- Publish on Slurpy website under `Trust & Research`
- Submit to *JMIR Mental Health* or *Lancet Psychiatry Digital* (peer review)
- Link from landing page + privacy policy
- Annual update cadence (February each year)

---

## Data Collection & Privacy

### What We Collect

- **Required**: Safety events (crisis detection, CTA interaction)
- **Optional**: PHQ-2/GAD-2 responses, post-session mood rating, demographic info
- **Automatic**: Session count, session length, days-since-signup

### What We Don't Collect

- Conversation content (not stored beyond session; encrypted in-flight)
- Exact therapy methodology used per session
- Real identity (unless user opts in to research consent)

### User Rights

- **Opt-out anytime**: Can disable wellbeing surveys at any time
- **Data access**: User can request their PHQ-2/GAD-2 scores + outcomes
- **Deletion**: Can request deletion of survey data (safety events retained for audit)

---

## Success Criteria & Next Steps

### Q1 2026 (Current)

- [ ] Implement optional PHQ-2/GAD-2 form (signup flow)
- [ ] Deploy wellbeing_surveys table + backend endpoints
- [ ] Collect baseline data on n=100 pilot users
- [ ] Monitor retention, session completion, safety metrics

### Q2 2026

- [ ] Analyze D7 retention, engagement outcomes
- [ ] Compare vs. historical Woebot/Wysa benchmarks
- [ ] Assess PHQ-2/GAD-2 change scores (if n≥50 with follow-up)
- [ ] Draft white paper (draft for internal review)

### Q3 2026

- [ ] Finalize white paper with clinical advisor review
- [ ] Submit for peer review (JMIR / Lancet Psychiatry Digital)
- [ ] Publish on Slurpy website under Trust & Research
- [ ] Update marketing copy to cite actual outcomes + limitations

---

## Disclaimer & Governance

**This is NOT**: A clinical trial, diagnostic tool, or substitute for professional mental health care.

**This IS**: An observational tracking framework to ensure Slurpy remains honest, safe, and evidence-informed.

**Governance**: Reviewed quarterly by Clinical Advisory Board + CTO. Any outcome claims require board sign-off before deployment.

---

## Questions?

- **Can I change my assessment answers?** Yes, PHQ-2/GAD-2 form is optional at any time.
- **Will these scores be shared with my doctor?** Only with your explicit consent (future feature).
- **Is my data confidential?** Yes, de-identified and encrypted per privacy policy.
- **What if I score high on PHQ-2/GAD-2?** We'll show you resources; no alarm or diagnosis.
