# Save as test_backend.py in your backend directory
import sys
import os

# Add parent directory to path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("=== TESTING BACKEND COMPONENTS ===")

# Test 1: Basic imports
print("\n1. Testing imports...")
try:
    from rag_core import slurpy_answer, emotion_intensity
    print("✅ rag_core imports OK")
except Exception as e:
    print(f"❌ rag_core import failed: {e}")
    sys.exit(1)

# Test 2: Emotion model
print("\n2. Testing emotion model...")
try:
    result = emotion_intensity("hello")
    print(f"✅ emotion_intensity works: {result}")
except Exception as e:
    print(f"❌ emotion_intensity failed: {e}")
    print("This is likely your main issue!")

# Test 3: Database connection
print("\n3. Testing database...")
try:
    from analytics import init
    init()
    print("✅ Database init OK")
except Exception as e:
    print(f"❌ Database failed: {e}")

# Test 4: OpenAI connection
print("\n4. Testing OpenAI...")
try:
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
    test_response = llm.invoke("Say 'test'")
    print(f"✅ OpenAI works: {test_response.content[:50]}")
except Exception as e:
    print(f"❌ OpenAI failed: {e}")

# Test 5: Full slurpy_answer
print("\n5. Testing slurpy_answer...")
try:
    from collections import deque
    hist = deque(maxlen=6)
    result = slurpy_answer("hello", hist, user_id="test_user", mode="therapist")
    print(f"✅ slurpy_answer works: {type(result)}")
    print(f"Result: {result}")
except Exception as e:
    print(f"❌ slurpy_answer failed: {e}")
    import traceback
    traceback.print_exc()

print("\n=== TEST COMPLETE ===")