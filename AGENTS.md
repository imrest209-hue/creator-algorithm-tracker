# For AI agents working on this project

This project is worked on by both **Claude Code** and **Codex (ChatGPT)**,
one at a time, never simultaneously. There is a shared handoff system that
tracks what's been done, what's tested, what's broken, and what's next —
**read it before writing any code:**

```
../PROTOCOL.md
../STATE.md
../projects/creator-algorithm-tracker.md
```

(i.e. `.ythack/`, the parent folder this project lives directly inside of —
on this machine, `Desktop/.ythack/`.)

`PROTOCOL.md` is short — read it in full. In summary: read `STATE.md` and
this project's file under `projects/` before starting, and update both
(plus append to `LOG.md`) before ending your session. Don't skip this even
for a small task — the whole point is that the next agent (possibly the
*other* tool) shouldn't have to re-derive context you already have.
