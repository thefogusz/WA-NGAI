# WANGAI

Browser-first MVP for real-time English/Thai communication while playing online games.

## Product promise

Open one secure link, grant microphone/system-audio permission, then use a clean floating widget:

- Other people: English speech -> English transcript + Thai translation.
- You: press the microphone button -> Thai speech -> English text -> Copy.
- End users never provide or see an API key.
- No injection, game hooks, memory reading, automatic typing, or anti-cheat bypass behavior.

## Honest product boundary

The no-install version is feasible on Windows Chrome/Edge using Document Picture-in-Picture as an always-on-top HTML window. It is not equivalent to a native overlay:

- Screen/system-audio permission must be granted again for every capture session.
- A browser-only app cannot provide a reliable global push-to-talk hotkey while the game owns keyboard focus.
- It cannot type directly into another application. MVP uses a visible Copy action and manual paste.
- Exclusive fullscreen and every game's anti-cheat policy are not guaranteed. Target borderless-windowed mode first.

These limits are validation gates, not hidden future problems.

## Documents

1. [Product specification](docs/01_PRODUCT_SPEC.md)
2. [Minimal widget UX specification](docs/02_UX_WIDGET_SPEC.md)
3. [Technical architecture](docs/03_ARCHITECTURE.md)
4. [MVP goals and implementation plan](docs/04_MVP_GOALS_AND_PLAN.md)
5. [Security, cost, and API preparation](docs/05_SECURITY_COST_AND_API_SETUP.md)
6. [Verified browser/provider research](docs/06_RESEARCH_NOTES.md)
7. [Implementation task tickets](docs/07_IMPLEMENTATION_TASKS.md)

## Current status

Planning only. No application code has been scaffolded. Implementation begins only after the owner approves the specification and Goal 0 feasibility gates.

## Owner decision requested

Approve the MVP baseline: Windows 11 + current Chrome/Edge, borderless-windowed games, click-to-toggle microphone, manual Copy/Paste, and xAI-hosted STT plus Grok 4.3 translation.
