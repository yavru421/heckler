# Cognitive Logbook & Telemetry Anchor

## Session Summary
- Starting restructuring of the main page (`Feed.razor` -> `/`) to provide a mobile-first Comedy Club experience.
- The redesign consolidates pages/features based on `odo_response_9.md`.

## Tasks & Planned Actions
1. **Understand models**: View Comedian and Joke models.
2. **Design mobile-first layout**:
    - **Lobby/Onboarding Header**: Intro to active comedian + quick stats (e.g. followers, style, biography, or rating).
    - **Comedian Discovery**: Simple beautiful card deck or dropdown to choose/switch. (Mike, Sarah, Quentin).
    - **Showroom Stage spotlight**: Audio visualizer + active joke playback with cached TTS audio streaming.
    - **Live Chat & Reactions**: Audio reactions (laugh, clap, boo) + banter chat box integrated cleanly at the bottom.
    - **Past Jokes Library**: List of past jokes/clips below the stage, clickable to play.
3. **Compile and Verify**: Run `dotnet build`.
