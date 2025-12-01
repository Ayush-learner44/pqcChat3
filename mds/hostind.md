Got it — this error isn’t about your crypto logic, it’s about **how Emscripten generated the glue** and how Next.js/Turbopack is trying to bundle it.

---

### 🔎 What’s happening
- Your `kem_liboqs.js` was compiled with `-s ENVIRONMENT=node`.  
- That glue assumes it will run in **pure Node.js**, so it does things like:
  ```js
  const { createRequire } = await import("module");
  var require = createRequire(import.meta.url);
  var fs = require("fs");
  ```
- Next.js (especially with Turbopack) is a **browser + SSR bundler**. When it sees `require("fs")` or `import("module")`, it tries to resolve those as client‑side dependencies. But in the browser there is no `"module"` or `"fs"`, so the build fails.

That’s why you see:
```
Module not found: Can't resolve 'module'
```

---

### ✅ How to fix

You have two options depending on where you want to run the WASM:

#### 1. **Server‑only (Node.js)**
If you only need liboqs on the server (API routes, backend logic):
- Keep `-s ENVIRONMENT=node`.
- Import `crypto.js` **only in server components or API routes**, not in client components.
- In Next.js, mark it as server‑only:
  ```js
  // utils/crypto.js
  "use server";
  ```
- Don’t import `kem_liboqs.js` in code that runs in the browser.

This way, the WASM runs in Node, and the client just calls your API.

---

#### 2. **Browser‑compatible**
If you want to run liboqs in the browser:
- Recompile with `-s ENVIRONMENT=web` (or `-s ENVIRONMENT=worker`).
- That glue won’t try to import `"module"` or `"fs"`, it will use `fetch` to load the `.wasm`.
- You’ll then need to serve the `.wasm` separately (don’t use `SINGLE_FILE=1`).
- Example:
  ```bash
  emcc kem_liboqs.c \
    -I... \
    ...liboqs.a \
    -O3 \
    -s ENVIRONMENT=web \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORT_NAME=KEMModule \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s EXPORTED_FUNCTIONS='["_kem_init","_kem_pk_len","_kem_sk_len","_kem_ct_len","_kem_ss_len","_kem_keypair","_kem_encaps","_kem_decaps","_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
    -o public/kem_liboqs.js
  ```
- Place `kem_liboqs.wasm` in `public/` so Next.js can serve it at `/kem_liboqs.wasm`.

---

### ⚖️ Which to choose
- If this is a **full‑stack app** where the client just calls APIs, you only need the Node build. Keep `ENVIRONMENT=node`, but make sure you don’t import it in client components.
- If you want the crypto to run **in the browser**, you need the web build (`ENVIRONMENT=web`) and serve the `.wasm` separately.

---

### 🛠️ Practical next step
Since you said *“the client makes API calls to this to call the function time to time”*, that means the crypto runs on the server. So the simplest fix is:

1. Keep your current Node build.  
2. In Next.js, only import `crypto.js` in API routes or server components.  
3. Don’t import it in `app/chat/page.js` if that’s a client component. Instead, call your API route that uses `crypto.js`.

---

👉 That will stop Turbopack from trying to bundle Node‑only modules into the browser build.  

Do you want me to sketch how to restructure your Next.js app so the client calls an API route that wraps `crypto.js`, instead of importing it directly?

---
I hear your frustration, Ayush — let’s cut through the noise and focus on the real issue.

---

### Why the build is failing
- Your `kem_liboqs.js` was compiled with `-s ENVIRONMENT=node`.
- That glue tries to `import("module")` and `require("fs")`. Those are **Node‑only APIs**.
- Next.js/Turbopack sees you importing `kem_liboqs.js` inside a **client component** (`app/chat/page.js`), so it tries to bundle it for the browser. In the browser there is no `"module"` or `"fs"`, so the build explodes.

---

### Key point
You’re right: the crypto should run **on the server**. The mistake is that you’re pulling `crypto.js` (and therefore `kem_liboqs.js`) into a client component. That forces Turbopack to treat it as browser code.

---

### How to fix cleanly
1. **Keep your WASM build as Node‑only** (`-s ENVIRONMENT=node`). That’s correct for server‑side crypto.
2. **Do not import `crypto.js` in client components.**  
   - Instead, expose your crypto functions through an **API route** or a **server action**.
   - Example: create `app/api/crypto/route.js`:
     ```js
     import { generateIdentity, performKeyExchange, recoverSessionKey } from "@/utils/crypto.js";

     export async function GET() {
       const id = await generateIdentity();
       return Response.json(id);
     }
     ```
   - Then in your client component, call `/api/crypto` with `fetch`.
3. If you want to use server components directly, keep the import in a file marked `"use server"` and **don’t mix it into client code**.

---

### Why “use server” didn’t help
You’re correct that Next.js 13+ defaults to server components. But the error trace shows Turbopack still treated your page as a **Client Component Browser** because you imported `kem_liboqs.js` transitively. That’s why it tried to resolve `"module"` in the browser.

---

### Bottom line
- The WASM is running on the server, not the browser.  
- The build fails because you accidentally pulled server‑only glue into client code.  
- Solution: keep crypto imports in server‑only files (API routes, server actions), and let the client call those APIs.  

---

👉 If you want, I can sketch a minimal Next.js structure: one API route that wraps `generateIdentity`, and a client page that fetches from it. That way you’ll have a working deployment on Render without Turbopack errors.