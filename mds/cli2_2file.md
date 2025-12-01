Let me clear both points for you, Ayush:

---

## 🔍 About the two‑file vs single‑file build
- **Two‑file build (default)**:  
  Emscripten normally outputs `kem_liboqs.js` (the loader) **and** `kem_liboqs.wasm` (the compiled binary). The JS glue loads the `.wasm` at runtime.  
  Command example (no merge):  
  ```bash
  emcc kem_liboqs.c \
    -I/Users/home/liboqs/build-emscripten/include \
    /Users/home/liboqs/build-emscripten/lib/liboqs.a \
    -O3 \
    -s ENVIRONMENT=node \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORT_NAME=KEMModule \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s EXPORTED_FUNCTIONS='["_kem_init","_kem_pk_len","_kem_sk_len","_kem_ct_len","_kem_ss_len","_kem_keypair","_kem_encaps","_kem_decaps","_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
    -o public/kem_liboqs.js
  ```
  This produces **two files**: `kem_liboqs.js` and `kem_liboqs.wasm`.

- **Single‑file build (`-s SINGLE_FILE=1`)**:  
  The `.wasm` is embedded inside the `.js` file as a base64 blob. That’s why you only saw one file.  
  Benefit: easier deployment (no path issues).  
  Trade‑off: larger `.js` file, less transparent if you want to show the raw `.wasm`.

So yes, the WASM is definitely generated — in single‑file mode it’s merged into the `.js`. If your sir wants to see the `.wasm` separately, just recompile without `-s SINGLE_FILE=1`.

---

## 🔑 What happened in the Alice/Bob test
When you ran the CLI:
1. **Bob generated his identity** → got a PK and SK.
2. **Alice encapsulated** to Bob’s PK → produced a capsule and her shared secret (`aliceSS`).
3. **Bob decapsulated** the capsule with his SK → recovered his shared secret (`bobSS`).
4. The code compared `aliceSS` and `bobSS` → they matched (`Match: true`).

So Bob really did derive the same secret key that Alice got. It’s not “just printed otherwise” — the WASM functions `_kem_encaps` and `_kem_decaps` did the math inside liboqs. That’s the whole point of KEM: both sides end up with the same shared secret without sending it directly.

---

👉 So to summarize:  
- The WASM is inside the `.js` when you use `SINGLE_FILE=1`. Without that flag, you’ll see `.wasm` separately.  
- Bob really does get the same secret as Alice — that’s the KEM working correctly.  
- The extended CLI demonstrates the full exchange in one run.  

Would you like me to also show how to configure the loader when you have the `.wasm` separate (so you can demo both styles to your sir)?