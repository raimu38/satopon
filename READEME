````markdown
# Satopon

A real-time, multiplayer “PON” & “SATO” point-settling game built on Next.js, React, Tailwind CSS and Firebase.  Players join rooms, award “PON” points in quick rounds, settle debts in “SATO”, track leaderboards, and view their personal point history.

---

## 🚀 Features

- **Rooms**  
  – Create/join/leave rooms  
  – Pending-join approvals  
  – Presence indicator (online/offline)  

- **PON Rounds**  
  – Start a quick scoring round  
  – Everyone submits a point value  
  – Finalize and approve results  
  – Real-time progress & approval bars  

- **SATO Settlements**  
  – Request transfers (sato) to other players  
  – Accept/reject settlement requests  

- **Leaderboards & Members**  
  – Per-room sortable leaderboards with top-3 badges  
  – Member grid, online status, per-member balances  

- **Personal Point History**  
  – View your PON/SATO history, ranks, date, participants  

- **Authentication & Presence**  
  – Email/Firebase auth  
  – Heavy use of Firebase Realtime/WebSocket context  

---

## 🛠️ Tech Stack

- Front-end: [Next.js](https://nextjs.org/) (App Router, “use client”), React  
- Styling: [Tailwind CSS](https://tailwindcss.com/)  
- Auth & real-time: [Firebase Auth](https://firebase.google.com/) & custom PresenceContext  
- API: REST endpoints under `/lib/api`  
- Icons: Google Material Symbols  
- Data fetching: SWR / `useEffect` + custom hooks  

---

## ⚙️ Prerequisites

- Node.js ≥ 16.x  
- npm or yarn  
- A Firebase project with Authentication enabled (Email + Google sign-in)  
- Backend API server (or mock) available at `NEXT_PUBLIC_API_BASE_URL`  

---

## 🔧 Environment Setup

1. **Clone** this repo  
   ```bash
   git clone https://github.com/raimu38/satopon.git
   cd satopon
````

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn
   ```

3. **Create a `.env.local`** in the project root:

   ```
   NEXT_PUBLIC_API_BASE_URL=https://your.api.server
   NEXT_PUBLIC_WS_URL=wss://your.ws.server
   NEXT_PUBLIC_FIREBASE_API_KEY=…
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=…
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=…
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=…
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
   NEXT_PUBLIC_FIREBASE_APP_ID=…
   ```

4. **Configure Firebase**

   * In your Firebase console, enable **Email/Password** (and Google) under Authentication → Sign-in methods.
   * Copy the config values into `.env.local`.

---

## 🏃‍♂️ Running Locally

```bash
npm run dev
# or
yarn dev
```

* App runs at: [http://localhost:3000](http://localhost:3000)
* Hot reload on code changes.

### Build & Preview

```bash
npm run build
npm run start
```

---

## 🔗 Scripts

* `dev`
  Starts Next.js in development mode.
* `build`
  Compiles production build.
* `start`
  Serves the production build.
* `lint`
  Runs ESLint.
* `format`
  Runs Prettier.

---

## 📁 Project Structure

```
/
├─ app/                # Next.js App Router pages
│  ├─ rooms/[roomId]/  # Room page & modals
│  └─ c420/page.tsx    # Dashboard
├─ context/            # PresenceContext
├─ lib/
│  ├─ api.ts           # REST API client
│  └─ firebaseClient.ts
├─ components/         # Shared UI components
├─ styles/
│  └─ globals.css
├─ public/             # Static assets
├─ .env.local
└─ README.md
```

---

## 🤝 Contributing

1. Fork & branch: `git checkout -b feature/YourFeature`
2. Commit: `git commit -m "feat: add …"`
3. Push & PR

Please follow the existing code style, run `npm run lint` & `npm run format` before pushing.

---

##  License

MIT © [raimu38](https://github.com/raimu38)

---

Happy PONning & SATOing! 🎉

