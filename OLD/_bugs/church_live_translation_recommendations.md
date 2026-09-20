# Church Live Translation App — Technical & Product Recommendations

## 1. Current Product Overview

The current application is a live simultaneous translation system designed for churches.

### Current flow

- Audio is captured from the church sound system / microphone.
- The operator manually controls when translation should happen:
  - **Mute** during worship/music.
  - **Unmute** when the pastor is speaking.
- The system uses Google translation / speech translation services.
- The translated content is displayed as **live captions**.
- Attendees access the captions through a **QR Code**.
- Current end-to-end delay is approximately **2 seconds**.

### Current architecture

```text
Church Audio
    ↓
Manual Mute / Unmute
    ↓
Speech / Translation Pipeline
    ↓
Translated Captions
    ↓
Web Interface
    ↓
QR Code Access
```

The current latency of ~2 seconds is already very competitive for church live-caption use.

---

## 2. Main Improvement: Automatic Worship / Speech Detection

The biggest operational improvement is to eliminate the need for someone to manually mute and unmute the translation system.

Instead, an audio classification layer should be placed before the current translation pipeline.

### Recommended architecture

```text
Church Audio
    ↓
Audio Classification Layer
    ↓
 ┌───────────────────────┐
 │ Speech / Preaching?   │
 └───────────────────────┘
      ↓ YES             ↓ NO
 Translation       Music / Singing /
 Pipeline          Noise / Applause
      ↓                   ↓
 Captions              Ignore
      ↓
 QR Code
```

The existing application remains the main system.

The classifier is only a preprocessing module placed before the current speech/translation pipeline.

---

## 3. Recommended Open-Source Technologies

### Option A — YAMNet

Repository / technology:

- TensorFlow YAMNet
- Based on AudioSet
- Classifies hundreds of audio events.

Useful classes include:

- Speech
- Music
- Singing
- Choir
- Piano
- Guitar
- Musical instruments
- Applause
- Silence
- Noise

### Recommended logic

Example concept:

```python
if speech_score > SPEECH_THRESHOLD and singing_score < SINGING_THRESHOLD:
    translation_enabled = True

elif music_score > MUSIC_THRESHOLD or singing_score > SINGING_THRESHOLD:
    translation_enabled = False
```

YAMNet is attractive because it allows more precise custom business rules.

---

### Option B — inaSpeechSegmenter

inaSpeechSegmenter is especially interesting because it already focuses on segmentation of:

- Speech
- Music
- Noise

A useful characteristic for church environments is that **singing tends to be treated as music**, which can help prevent worship songs from entering the translation pipeline.

This may be the fastest model to test first for an MVP.

---

### Option C — Silero VAD

Silero VAD is excellent for detecting human voice, but it should **not be used alone** for this project.

Reason:

```text
Pastor speaking → voice
Singer singing → voice
```

A normal Voice Activity Detector cannot reliably distinguish preaching from singing.

Silero could still be useful as one component, but a music/singing classifier should remain part of the decision.

---

## 4. Recommended First Implementation

The first technical experiment should compare:

1. **inaSpeechSegmenter**
2. **YAMNet**

Test both using real church audio.

Recommended test scenarios:

- Pastor speaking alone
- Pastor speaking with soft piano in background
- Worship band
- Solo singer
- Choir
- Instrumental music
- Applause
- Congregation talking
- Prayer
- Announcements
- Silence
- Pastor starting immediately after music ends

The main metric is not only classification accuracy.

The most important metric is:

> Does the system correctly decide when the translation pipeline should be ON or OFF?

---

## 5. Keep Audio Capture Running Continuously

Do not physically stop audio capture when music is detected.

Instead:

```text
Capture audio continuously
        ↓
Classify continuously
        ↓
Only forward relevant audio
        ↓
Translation pipeline
```

This makes the transition back to speech much faster.

---

## 6. Add a Short Audio Buffer

Keep a rolling buffer of approximately:

- 500 ms to 1 second

Example:

```text
Incoming Audio
      ↓
Rolling Buffer (~1 sec)
      ↓
Classifier
      ↓
Speech detected
      ↓
Send buffered audio + current audio
      ↓
Translation
```

Why:

The detector may need a few hundred milliseconds to determine that someone started speaking.

Without the buffer:

```text
Pastor:
"Today we're going to..."

System receives:
"we're going to..."
```

With the buffer, the beginning of the sentence can still be sent to the translation engine.

---

## 7. Add Hysteresis / Debounce

The classifier should not switch translation ON/OFF every few milliseconds.

Example logic:

```text
Speech continuously detected for 300–500 ms
        ↓
Translation ON

Music continuously detected for 1–2 seconds
        ↓
Translation OFF
```

Thresholds must be tuned using real church recordings.

---

## 8. Operator Override

Even with automatic detection, the operator should always have manual control.

Recommended interface:

```text
[AUTO]   [FORCE ON]   [FORCE OFF]
```

### AUTO

System automatically decides between speech and music.

### FORCE ON

Always translate.

Useful for:

- difficult audio conditions
- pastor speaking while music is loud
- classifier mistake

### FORCE OFF

Immediately stop translation.

Useful for:

- worship
- special performances
- unexpected classifier error

This creates a safe production workflow.

---

# Product Differentiation

## 9. Do Not Compete Only on "Live Translation"

There are already multiple products offering church/event translation, including:

- Wordly
- Sunflower AI
- OneAccord
- Sermon Live
- Boostlingo
- Maestra
- Glossa

Therefore, the product should not be positioned simply as:

> AI live translation for churches.

That is no longer enough.

---

# 10. Recommended Product Positioning

A stronger positioning would be:

> **Live AI translation built specifically for churches — automatically detects preaching, understands Biblical terminology, and delivers captions instantly through QR Code.**

Possible core pillars:

1. Automatic Worship Detection
2. Biblical Context Intelligence
3. QR-Code based zero-install experience
4. Very low latency
5. Affordable pricing for small and medium churches
6. Church-specific vocabulary and configuration
7. Operator simplicity

---

# 11. Major Differentiator #1 — Automatic Worship Detection

Potential feature name:

## Automatic Worship Detection

or

## Smart Sermon Detection

Behavior:

```text
Pastor speaking
→ Translate

Pastor praying
→ Translate

Announcements
→ Translate

Singer singing
→ Ignore

Band playing
→ Ignore

Choir
→ Ignore

Applause
→ Ignore

Pastor starts talking over soft piano
→ Translate
```

Commercial message:

> No operator required during the service.

This is stronger than simply saying the product translates speech.

---

# 12. Major Differentiator #2 — Church Context Engine

Each church should have its own context profile.

Example:

```yaml
church:
  name: Horizon West Church

pastors:
  - Chris
  - John

preferred_bible_translation:
  english: NIV
  portuguese: NVI

terminology:
  worship: Adoração
  fellowship: Comunhão
  communion: Ceia do Senhor
  Holy Spirit: Espírito Santo

ministries:
  - Horizon Kids
  - Student Ministry
  - Growth Groups
```

This context should be injected into the translation pipeline whenever supported.

Benefits:

- Correct pastor names
- Correct ministry names
- Better theological terminology
- More natural church-specific translation
- Fewer embarrassing translation mistakes

---

# 13. Major Differentiator #3 — Biblical Context Intelligence

The system should understand Bible references.

Example:

Pastor says:

```text
Let's turn to First Thessalonians chapter five.
```

Portuguese caption:

```text
Vamos abrir em 1 Tessalonicenses, capítulo 5.
```

More advanced example:

Pastor says:

```text
Let's look at Romans chapter eight, verse twenty-eight.
```

UI could display:

```text
Romanos 8:28
```

Potential future feature:

```text
📖 Open Verse
```

This transforms the application from a generic translator into a church-oriented platform.

---

# 14. Scripture Detection Engine

Recommended future module:

```text
Translated / Original Transcript
        ↓
Bible Reference Detector
        ↓
Reference Normalizer
        ↓
Romans chapter eight verse twenty-eight
        ↓
Romans 8:28
        ↓
Localized Bible Book
        ↓
Romanos 8:28
```

Possible future integration with Bible APIs can display the actual verse text.

This should not be part of the first MVP improvement, but it is a strong roadmap feature.

---

# 15. Major Differentiator #4 — Zero-Touch Attendee Experience

The attendee flow should remain extremely simple:

```text
Scan QR Code
      ↓
Open browser
      ↓
Choose language
      ↓
Live captions
```

No:

- Account
- Password
- App Store download
- Church login
- Installation

The QR Code experience should remain one of the central UX principles.

---

# 16. Latency

The current approximately **2-second delay is already very good**.

Do not sacrifice latency unnecessarily for additional AI processing.

The audio detection layer should therefore be:

- local or very fast
- lightweight
- streaming based
- asynchronous where appropriate

Goal:

```text
Audio classifier overhead:
ideally < 200–500 ms
```

The total user experience should ideally remain around:

```text
~2–3 seconds
```

rather than growing to 5–10 seconds.

---

# 17. Suggested Pipeline

Recommended target architecture:

```text
                    CHURCH AUDIO
                         │
                         ▼
                Audio Ingestion Layer
                         │
                         ▼
               Rolling Audio Buffer
                  (~500ms–1 sec)
                         │
                         ▼
             Audio Classification Engine
             YAMNet / inaSpeechSegmenter
                         │
           ┌─────────────┴─────────────┐
           │                           │
        SPEECH                      MUSIC
           │                        SINGING
           │                        NOISE
           │                        APPLAUSE
           │                           │
           ▼                           ▼
     Forward audio                   Ignore
           │
           ▼
        STT / Google
           │
           ▼
   Church Context / Glossary
           │
           ▼
       Translation
           │
           ▼
   Scripture Detection (future)
           │
           ▼
      Caption Gateway
           │
           ▼
       WebSocket/SSE
           │
           ▼
    User Browser via QR
```

---

# 18. Recommended Internal Architecture

Suggested modules:

```text
/audio
    audio_ingestion
    rolling_buffer
    audio_classifier
    classifier_state_machine

/translation
    speech_to_text
    translator
    church_context
    glossary

/scripture
    scripture_detector
    scripture_normalizer
    bible_mapping

/session
    church_session
    languages
    participants

/realtime
    websocket_gateway
    caption_stream

/admin
    audio_mode_control
    church_profile
    terminology
    session_control
```

---

# 19. Classifier State Machine

Do not directly use classifier output to control the translation stream.

Create a state machine.

Possible states:

```text
UNKNOWN
SPEECH
MUSIC
TRANSITION
FORCE_ON
FORCE_OFF
```

Example:

```text
UNKNOWN
   ↓
speech confidence > threshold
for N consecutive windows
   ↓
SPEECH
   ↓
music confidence > threshold
for N consecutive windows
   ↓
TRANSITION
   ↓
MUSIC
```

This prevents rapid oscillation.

---

# 20. Confidence Scores

Keep classifier scores available for debugging.

Example:

```json
{
  "speech": 0.91,
  "music": 0.08,
  "singing": 0.03,
  "applause": 0.01,
  "decision": "speech"
}
```

Store these temporarily during testing.

This will make threshold tuning much easier.

---

# 21. Admin Debug UI

During development, add a small debug panel.

Example:

```text
Audio Detection

Speech:   91%
Music:     8%
Singing:   3%

Current State:
SPEECH

Translation:
ON

Mode:
AUTO
```

Later this can be hidden in production or exposed only in an advanced admin mode.

---

# 22. Real Church Audio Dataset

Before deploying automatic detection broadly, collect recordings from actual services.

Important categories:

```text
speech_clean
speech_with_piano
speech_with_band_background
prayer
announcement
worship_solo
worship_band
choir
instrumental
applause
crowd
silence
transition_music_to_speech
transition_speech_to_music
```

Keep small labeled segments.

Example:

```text
church_audio_dataset/

speech/
music/
singing/
speech_with_music/
applause/
noise/
```

This dataset will later allow custom tuning or training.

---

# 23. Future Custom Classifier

After enough real church data is collected, a small custom model could classify:

```text
PREACHING
PRAYER
ANNOUNCEMENT
WORSHIP
MUSIC
CHOIR
APPLAUSE
SILENCE
```

This could become significantly more accurate than a generic AudioSet classifier.

The generic models should therefore be used first to accelerate development.

Do not train a custom model before validating the feature with YAMNet / inaSpeechSegmenter.

---

# 24. Post-Service Features

Future product expansion:

After the service ends, automatically produce:

- Full sermon transcript
- Translated transcript
- Sermon summary
- Main points
- Bible references
- Scripture list
- Sermon title suggestions
- YouTube description
- Social media excerpts
- Study notes
- Small-group discussion questions

These features are valuable, but they should not delay the core real-time translation experience.

---

# 25. Pricing Strategy

Potential opportunity:

Keep pricing simple and attractive to small/medium churches.

Possible future structure:

```text
Starter
$29–49/month

Growing Church
$79–99/month

Multi-campus
Custom
```

Pricing must ultimately be based on real infrastructure cost:

- STT usage
- translation usage
- concurrent languages
- session duration
- storage
- bandwidth
- TTS, if audio translation is added later

Do not commit to pricing until per-hour cost is measured.

---

# 26. Development Priorities

## Phase 1 — Automatic Audio Detection

Priority: HIGH

Implement:

- Audio classifier adapter
- YAMNet test
- inaSpeechSegmenter test
- Rolling buffer
- State machine
- AUTO / FORCE ON / FORCE OFF
- Debug confidence view

Success metric:

> Operator can run a complete church service with minimal manual intervention.

---

## Phase 2 — Church Context Engine

Priority: HIGH

Implement:

- Church profile
- Pastor names
- Ministry names
- Preferred terms
- Glossary
- Preferred Bible translation
- Context injection into translation

Success metric:

> Church-specific names and terminology are translated correctly and consistently.

---

## Phase 3 — Scripture Detection

Priority: MEDIUM

Implement:

- Detect spoken Bible references
- Normalize references
- Localize Bible book names
- Add reference metadata to caption stream

Example:

```json
{
  "caption": "Vamos ler Romanos capítulo 8.",
  "scripture": {
    "book": "Romans",
    "chapter": 8,
    "localized": "Romanos 8"
  }
}
```

---

## Phase 4 — Bible Integration

Priority: MEDIUM / FUTURE

Possible features:

- Open verse
- Display verse text
- Bible version selection
- Verse synchronization with captions

---

## Phase 5 — Post-Service AI

Priority: FUTURE

Generate:

- transcript
- summary
- Bible references
- clips
- social content
- sermon study material

---

# 27. First Technical Task for the Coder

Recommended first ticket:

## Automatic Speech vs Worship Detection Prototype

### Objective

Create a standalone prototype that receives the same audio stream currently used by the application and classifies it in real time.

### Requirements

1. Implement an adapter interface:

```python
class AudioClassifier:
    def classify(self, audio_chunk):
        pass
```

2. Create initial implementation using:

```text
inaSpeechSegmenter
```

3. Create second implementation using:

```text
YAMNet
```

4. Return normalized scores:

```json
{
  "speech": 0.0,
  "music": 0.0,
  "singing": 0.0,
  "noise": 0.0
}
```

5. Create state machine:

```text
AUTO_SPEECH
AUTO_MUSIC
FORCE_ON
FORCE_OFF
```

6. Implement rolling audio buffer.

7. Log:

- timestamp
- classifier scores
- current state
- translation decision

8. Test with real church recordings.

9. Measure:

- classification accuracy
- music → speech transition time
- speech → music transition time
- false translation starts
- false translation stops
- added latency

---

# 28. Important Design Principle

Do not tightly couple the application to YAMNet or inaSpeechSegmenter.

Use an abstraction such as:

```python
classifier = AudioClassifierProvider.get(config.classifier)
```

This allows future replacement with:

- custom model
- TensorFlow model
- ONNX model
- cloud classifier
- another open-source model

without changing the rest of the application.

---

# 29. Long-Term Product Vision

The goal should not be:

> Build another live translator.

The goal should be:

> Build the translation platform designed specifically for multilingual churches.

Key product identity:

```text
Church-specific
Low latency
Automatic
No installation
Biblically aware
Affordable
Easy for volunteers
```

Potential positioning:

> **Live AI translation built specifically for churches. Automatically detects preaching, understands Biblical terminology, and delivers live captions instantly through QR Code.**

---

# 30. Recommended Immediate Next Steps

1. Integrate a classifier prototype.
2. Test inaSpeechSegmenter first.
3. Compare with YAMNet.
4. Use real recordings from multiple church scenarios.
5. Add state machine + buffer.
6. Preserve AUTO / FORCE ON / FORCE OFF.
7. Measure extra latency carefully.
8. Keep current Google translation pipeline unchanged initially.
9. Build Church Context configuration.
10. Add Scripture Detection only after the automatic audio gate is stable.

---

## Final Recommendation

The existing application already has two strong foundations:

- QR-code-based live caption access.
- Approximately 2-second translation latency.

The highest-value next improvement is **Automatic Worship Detection**, because it directly removes operational friction during a church service.

After that, the strongest strategic differentiator is the **Church Context / Biblical Intelligence layer**.

Together, these move the product from:

```text
Generic live translator
```

to:

```text
AI translation infrastructure purpose-built for churches
```

That is the direction recommended for both engineering and commercial positioning.
