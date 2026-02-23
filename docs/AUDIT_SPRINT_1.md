# 🔧 BACKEND AUDIT SPRINT PLAN

## Current State (From Audit)

### ✓ WORKING (100% - No changes needed)
- **Trained Emotion Classifier** (DistilBERT)
  - Average confidence: 89-91%
  - Classifications: anxious, angry, sad, hopeful, neutral, passionate
  - Status: Production-ready

- **Phase Detection Logic** (Rule-based)
  - Correctly detects: intake → stabilization → skill_building → integration → maintenance
  - Accuracy: 100% on test cases
  - Status: Production-ready

- **Response Template System**
  - Anti-repetition variation pools
  - Phase-specific templates
  - Status: Ready but not integrated

### ❌ BROKEN (Must fix)
1. **Model-Based Response Generator** - Method signatures wrong (calls `.extract_context` instead of `.build_from_history`)
2. **Safety Classification** - Returns (None, None) instead of actual classifications
3. **Crisis Handler** - Created but never called in pipeline
4. **RAG Service Integration** - Still partially using old LangChain code

---

## SPRINT 1: Fix Integration Layer (4 hours)

### Goal
Wire all components together so message → emotion → phase → response works end-to-end

### Tasks

#### 1.1 Fix Model-Based Generator Method Signatures (1 hour)
**File:** `/backend/slurpy/domain/responses/model_based_generator.py`

**Problem:**
```python
# Current (BROKEN):
context = self.context_builder.extract_context(...)  # Method doesn't exist

# Should be:
context = ConversationContextBuilder.build_from_history(...)  # This exists
```

**Fix:**
- Change all calls from `.extract_context()` → `.build_from_history()`
- Update parameters to match actual method signature
- Remove async/wrapper complexity that's not needed

**Verification:**
```bash
python3 -c "from slurpy.domain.responses.model_based_generator import ModelBasedResponseGenerator; m = ModelBasedResponseGenerator(); print('✓ Imports OK')"
```

---

#### 1.2 Debug Safety Classification (2 hours)
**File:** `/backend/slurpy/domain/safety/service.py`

**Problem:**
```python
# Current (BROKEN):
level = safety_classify(message)  # Returns (None, None)

# Should return:
# (level, reason) where level in [0, 1, 2] or similar
```

**Investigation Checklist:**
- [ ] Check if safety model files exist
- [ ] Check dependency imports
- [ ] Test with known crisis messages
- [ ] Log what's happening inside `classify()`

**Fallback Fix (if model missing):**
```python
def safety_classify(text: str):
    """Fallback: text-based safety check"""
    keywords = {
        "suicide": 2,
        "self-harm": 2,
        "kill myself": 2,
        "hurt myself": 1,
    }
    for keyword, level in keywords.items():
        if keyword.lower() in text.lower():
            return (level, keyword)
    return (0, None)  # Safe
```

**Verification:**
```bash
python3 -c "
from slurpy.domain.safety.service import classify
print(classify('I want to kill myself'))  # Should NOT be (None, None)
"
```

---

#### 1.3 Integrate Crisis Handler (1 hour)
**File:** `/backend/slurpy/domain/rag/service.py`

**Current Code (line ~270):**
```python
if level:  # If crisis detected
    # Currently broken response
```

**Fix:**
```python
if level:  # If crisis detected
    from slurpy.domain.safety.crisis_handler import CrisisHandler
    handler = CrisisHandler()
    result = await handler.handle_crisis(msg, user_id)  # Use the handler!
    return result.get("response"), guess, fruit_for(guess)
```

**Verification:**
- Send "I want to kill myself" through backend
- Should get crisis response with 988 number
- Should NOT get generic therapeutic response

---

### Test After Sprint 1

```python
# test_integration.py
from collections import deque
from emotion.predict import emotion_intensity
from slurpy.domain.treatment.phase_detection import TreatmentPhaseDetector
from slurpy.domain.safety.service import classify as safety_classify
from slurpy.domain.responses.model_based_generator import ModelBasedResponseGenerator

message = "I'm having anxiety attacks and can't sleep"

# Step 1: Emotion
emotion, conf = emotion_intensity(message)
print(f"1. Emotion: {emotion} ({conf:.0%})")
assert emotion in ["anxious", "sad", "angry", "passioante", "hopeful", "neutral"]

# Step 2: Phase  
phase_detector = TreatmentPhaseDetector()
phase = phase_detector.detect_phase_from_metrics(
    session_count=3, days_in_treatment=5,
    phq9_baseline=20, phq9_current=18,
    gad7_baseline=None, gad7_current=None,
    skills_learned=[], engagement_sessions_per_week=3.0,
    homework_adherence_pct=None
)
print(f"2. Phase: {phase}")
assert phase in ["intake", "stabilization", "skill_building", "integration", "maintenance"]

# Step 3: Safety
safety_level, reason = safety_classify(message)
print(f"3. Safety: {safety_level} - {reason}")
assert safety_level is not None  # Should NOT be None!

# Step 4: Response
gen = ModelBasedResponseGenerator()
response, meta = gen.generate_response_sync(
    user_message=message,
    user_id="test",
    emotion_bucket=emotion,
    emotion_confidence=conf,
    phase=phase,
    conversation_history=deque(),
    themes=[]
)
print(f"4. Response: {response[:100]}...")
assert len(response) > 10  # Should have actual response

print("\n✅ END-TO-END PIPELINE WORKS")
```

**Run:**
```bash
PYTHONPATH=/Users/mysterix/Downloads/ML/Slurpy python3 test_integration.py
```

---

## SPRINT 2: Phase 2 Improvements (Separate - not blocking)

### Task 2.1: Deterioration Escalation Protocol (2 days)
**When:** User worsening (PHQ-9 increases, session absences)
**Action:** 
- Trigger care team notification
- Add barrier assessment questions
- Suggest increased session frequency

---

### Task 2.2: Cultural Adaptation (3 days)
**When:** User from different cultural background
**Action:**
- Detect cultural indicators (family structure, values, communication style)
- Use culture-specific interventions
- Avoid imposing Western therapeutic assumptions

---

### Task 2.3: ML Intervention Selector (4 days)
**Currently:** Hard-coded 8 rules
**Goal:** Train XGBoost on past outcome data
- Which interventions help which problems?
- Feedback loop to improve over time

---

## IMMEDIATE ACTION ITEMS

### TODAY (Next 1-2 hours)
- [ ] **Run audit:** `python3 audit_trained_models.py`
- [ ] **Check safety classifier:** Why is it returning None?
- [ ] **Create test file** with end-to-end test (code above)

### TOMORROW (4 hours)
- [ ] Fix Model-Based Generator method calls
- [ ] Debug/fix safety classification
- [ ] Integrate crisis handler
- [ ] Run end-to-end test
- [ ] Verify no OpenAI calls

### AFTER THAT
- [ ] Run full backend test suite
- [ ] Deploy to staging
- [ ] Create Phase 2 sprint plan for improvements

---

## Files That NEED Changing

### MUST FIX (Blockers)
1. `/backend/slurpy/domain/responses/model_based_generator.py` - Line ~182
   - Change: `.extract_context()` → `.build_from_history()`
   - Change: `.build_response()` parameters
   
2. `/backend/slurpy/domain/safety/service.py` - Line ? 
   - Debug: Why is `classify()` returning (None, None)?
   
3. `/backend/slurpy/domain/rag/service.py` - Line ~270-330
   - Add crisis handler integration
   - Remove remaining LangChain code

### GOOD TO HAVE (Nice improvements)
- `/backend/slurpy/domain/treatment/phase_detection.py` - Add deterioration detection
- `/backend/slurpy/domain/responses/crisis_handler.py` - Already created ✓

---

## Verification Checklist

After fixes:
- [ ] `python3 audit_trained_models.py` shows 3+ working components
- [ ] Crisis messages trigger crisis handler
- [ ] No OpenAI calls in execution path
- [ ] Response variation > 50% (no repetition)
- [ ] Phase detection catches all phases
- [ ] Safety classification working (not None)
- [ ] End-to-end test passes

---

## NOT a Wrapper Confirmation

After these fixes:

```
Input: "I'm so anxious"
  ↓ (TRAINED MODEL)
EMOTION: anxious (91% confidence)
  ↓ (LOGIC-BASED)
PHASE: stabilization (day 5)
  ↓ (TRAINED SAFETY)
SAFETY: OK, not crisis
  ↓ (TEMPLATE + VARIATION)
RESPONSE: Anti-repetitive, phase-matched response
  ↓
Output: Response from YOUR system, not GPT ✓
```

**Proof of non-wrapper:**
- Emotion: Trained DistilBERT model ✓
- Phase: Rule-based logic ✓
- Response: Template + variation pools ✓
- **NOT:** OpenAI/GPT/LangChain wrapper ✓

---

## Definition of "Done" (This Sprint)

**Done = All 5 tests pass:**

1. `test_trained_emotion_model.py` ✓ (already works)
2. `test_phase_detection.py` ✓ (already works)
3. `test_safety_classification.py` ❌ → 🔧 FIX → ✓
4. `test_crisis_handler_integration.py` ❌ → 🔧 FIX → ✓
5. `test_end_to_end_pipeline.py` ❌ → 🔧 FIX → ✓

---

## Estimated Timeline

| Task | Time | Status |
|------|------|--------|
| Fix Model-Based Generator | 1h | 🔧 TODO |
| Debug Safety Classification | 2h | 🔧 TODO |
| Integrate Crisis Handler | 1h | 🔧 TODO |
| End-to-end testing | 1h | 🔧 TODO |
| **TOTAL SPRINT 1** | **5 hours** | 🔧 TODO |

---

> **Bottom Line:** The trained models work perfectly. We just need to wire them together (5 hours), then Phase 2 improvements can begin.
