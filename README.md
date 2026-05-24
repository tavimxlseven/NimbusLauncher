# Nimbus Launcher

A Minecraft modpack launcher with a web platform for managing modpacks, mods, and player accounts.

The project is split into three parts that work together:

| Part | Stack | Purpose |
|------|-------|---------|
| **Backend (Rails API)** | Ruby on Rails 8, PostgreSQL | REST API, auth, modpack data, mod resolution |
| **Website (Frontend)** | React + Vite + TypeScript | Public website and user dashboard |
| **Launcher (Electron)** | Electron 31, React, TypeScript | Desktop app that downloads and launches Minecraft |

---

## How it works

### Authentication flow

1. User opens the launcher and clicks **"Open site for login"**
2. The site opens in the system browser — user logs in with Discord
3. The site generates a short-lived token and shows it to the user
4. The launcher polls `GET /api/v1/launcher/poll?token=XXX` until the token is claimed
5. On success the backend issues a 90-day `LauncherSession` token stored locally at `~/.nimbus-launcher/session.json`
6. Every subsequent API call from the launcher uses `Authorization: Bearer <session_token>`

### Modpack installation flow

1. User browses modpacks on the **Library** page (CurseForge + Modrinth)
2. Clicking **Play** triggers `game:launch` IPC from the renderer to the main process
3. `GameLauncher` runs the pipeline:
   - Downloads vanilla Minecraft via `@xmcl/installer`
   - Installs the mod loader (Fabric / Forge / NeoForge / Quilt)
   - Resolves each mod through `POST /api/v1/mod_files/resolve` (keeps API keys server-side)
   - Downloads mod JARs with SHA-1 verification and a shared cache
   - Extracts modpack overrides (configs, KubeJS scripts, resource packs)
   - Launches the JVM with Microsoft or offline auth

### Mod resolution

The launcher never calls CurseForge or Modrinth directly for file downloads. It always goes through the backend endpoint `/api/v1/mod_files/resolve`, which:
- Holds the CurseForge API key server-side
- Returns `{ download_url, filename, sha1, file_size }`
- Validates the download URL before returning it

### Auto-update

On startup the launcher calls `GET /api/v1/launcher/version`. If `current_version > local_version` or `minimum_version > local_version`, an `UpdateModal` blocks the UI and prompts the user to download the new installer.

---

## Project structure

```
NimbusLauncher/
├── app/                    # Rails controllers, models, services
│   ├── controllers/api/v1/ # REST API endpoints
│   ├── models/             # ActiveRecord models
│   └── services/           # Business logic (AI, external APIs, manifest)
├── config/                 # Rails config (routes, database, initializers)
├── db/                     # Migrations and schema
├── spec/                   # RSpec tests
│
├── frontend/               # Website (React + Vite)
│   └── src/
│       └── App.tsx         # Single-page app
│
└── electron/               # Desktop launcher (Electron)
    ├── main/               # Main process (Node.js)
    │   ├── game/           # GameLauncher, ModResolver, JavaRuntimeManager
    │   ├── auth/           # Microsoft + offline auth
    │   ├── ipc/            # IPC handlers (bridge to renderer)
    │   └── security/       # URL validation, secure requests
    ├── renderer/           # Renderer process (React)
    │   └── src/
    │       ├── App.tsx     # Main UI
    │       └── components/ # Modals, update UI
    └── preload.ts          # Context bridge (exposes `window.nimbus`)
```

---

## Backend API — key endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/launcher/version` | — | Latest launcher version info |
| `GET` | `/api/v1/launcher/poll?token=` | — | Exchange login token for session |
| `GET` | `/api/v1/modpacks` | — | Search modpacks |
| `GET` | `/api/v1/modpacks/:id/versions` | — | List modpack versions |
| `POST` | `/api/v1/mod_files/resolve` | ✓ | Resolve mod to download URL |
| `GET` | `/api/v1/library` | ✓ | User's modpack library |
| `POST` | `/api/v1/library` | ✓ | Add modpack to library |
| `GET` | `/api/v1/library/:id/mods` | ✓ | Mods in a library modpack |

---

## Development setup

### Requirements

- Ruby 3.3+
- Node.js 20+
- PostgreSQL (production) or SQLite (development)

### Backend

```bash
bundle install
rails db:create db:migrate db:seed
rails server
```

### Website

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → frontend/dist/
```

### Launcher

```bash
cd electron

# Install dependencies
npm install

# Build renderer first
cd renderer && npm install && npm run build && cd ..

# Build main process
npm run build

# Run in development
npm run dev

# Build installers (Setup + Portable + ZIP)
npm run release
```

---

## Versioning

This project follows a simple versioning convention:

| Change type | Example |
|-------------|---------|
| Hotfix / small fix | `0.1.0` → `0.1.1` → `0.1.2` |
| Feature update | `0.1.x` → `0.2.0` |
| Major release | `0.x.0` → `1.0.0` |

When releasing a new launcher version:
1. Update `version` in `electron/package.json`
2. Run `npm run release` inside `electron/` — generates Setup, Portable and ZIP
3. Upload the three files to the server downloads directory
4. Update the `LauncherVersion` record in the database

---

## Launcher release artifacts

Each release produces three files:

| File | Description |
|------|-------------|
| `Nimbus-Launcher-Setup-X.Y.Z.exe` | NSIS installer (recommended) |
| `Nimbus-Launcher-Portable-X.Y.Z.exe` | Portable — no installation needed |
| `Nimbus-Launcher-vX.Y.Z-win-x64.zip` | ZIP archive |

---

## License

Private — all rights reserved.
