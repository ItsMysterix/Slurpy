# carekit.py
import random
from typing import List, Dict

SKILLS = {
    "anxiety": ["box breathing 4-4-4-4","5-4-3-2-1 grounding","worry postponement 15m"],
    "depression": ["behavioral activation one tiny task","gratitude 3 specifics","sunlight + walk 10m"],
    "anger": ["urge surfing 90s","paced breathing 4-6","time-out + values check"],
    "relationships": ["DEAR MAN rehearsal","boundary script","repair attempt starter"],
    "trauma": ["safe place visualization","orienting 3 objects","container exercise"],
}
PSYCHOEDU = {
    "anxiety": ["anxiety = overactive alarm; breathing lowers arousal"],
    "depression": ["activation precedes motivation; tiny wins build momentum"],
    "anger": ["anger often protects other emotions; naming reduces intensity"],
    "relationships": ["clear requests beat mind-reading; repair early"],
    "trauma": ["grounding widens the window of tolerance"],
}
QUESTIONS = {
    "anxiety": ["What would feel 5% safer right now?"],
    "depression": ["What’s one tiny thing you can do in 2 minutes?"],
    "anger": ["What value do you want to stand for in this moment?"],
    "relationships": ["What outcome would be ‘good enough’ for now?"],
    "trauma": ["Is your body giving a cue you can soothe gently?"],
}
DEFAULTS = ["notice-and-name your feeling","one kind thing for yourself today"]

def compose(themes: List[str], approach: str | None):
    t = [x.replace("ongoing_","") for x in themes]
    key = next((k for k in ["anxiety","depression","anger","relationships","trauma"] if k in t), None)
    if key is None:
        skill = random.choice(DEFAULTS)
        edu = random.choice(["emotions are signals; we can respond skillfully"])
        q = random.choice(["What would help by 1%?"])
    else:
        skill = random.choice(SKILLS.get(key, DEFAULTS))
        edu = random.choice(PSYCHOEDU.get(key, ["emotions are signals; we can respond skillfully"]))
        q = random.choice(QUESTIONS.get(key, ["What would help by 1%?"]))
    micro = "Write one sentence: ‘Tonight I will __ for 2 minutes.’"
    return {"skill": skill, "psychoedu": edu, "micro_goal": micro, "question": q, "approach": approach}
