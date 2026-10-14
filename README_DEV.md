# TypeCast — Developer Guide

A podcast dictation web app built on a pnpm Monorepo (Turborepo).  
Live: **[https://typecast.51.edu.kg](https://typecast.51.edu.kg)**

---

## Architecture

```
typecast/
├── apps/web/              React 19 + Vite 6 + Tailwind CSS 3
├── packages/
│   ├── core/              Headless engine: FSM, audio player, IndexedDB
│   └── shared-types/      Shared TypeScript types
└── scripts/               Python pipeline (Whisper alignment & manifest build)
```

**Stack:** React 19 · Vite 6 · Tailwind 3 · Dexie 4 (IndexedDB) · Vitest · pnpm · Turborepo  
**CI/CD:** GitHub Actions → Oracle VPS via rsync over SSH

---

## Getting Started

```bash
git clone https://github.com/WiKiBIRD/typecast.git
cd typecast
pnpm install
pnpm dev       # http://localhost:5173
pnpm test      # Vitest — 17 test cases
pnpm build     # production build → apps/web/dist/
```

---

## Acoustic Alignment

All 375 episodes (3,750 sentences) are aligned with `faster-whisper base.en`  
and calibrated with **−200 ms head padding** and **+180 ms tail padding** to  
prevent word clipping and audio cutoff.

Audio streams directly from the podcast's official CloudFront CDN.  
No audio files are stored in this repository.

---

## CI/CD

Push to `main` → GitHub Actions:

1. Setup Node 22 + pnpm 11
2. `pnpm install --frozen-lockfile`
3. `pnpm build`
4. `rsync` dist to `/var/www/typecast` on Oracle VPS

Secrets required: `VPS_IP`, `SSH_PRIVATE_KEY`

---

## License

[MIT](LICENSE) © 2026 WiKiBIRD  
Audio content © Slow English Podcast with Emilie — referenced via public RSS only.
