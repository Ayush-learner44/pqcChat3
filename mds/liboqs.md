### Goal

Replace your MlKem768 class with liboqs-backed WebAssembly on a Mac, using modern ES6. No cwrap/ccall — only direct Module._functionName, Module._malloc/_free, and Module.HEAPU8.

---

### What you’ll build

- A tiny C API around liboqs (ML-KEM-768) compiled to wasm + JS glue.
- An ES6 loader that initializes once and exposes three functions:
  - generateIdentity()
  - performKeyExchange(recipientPublicKeyHex)
  - recoverSessionKey(capsuleHex, privateKeyBytes)

---

### Mac setup for Emscripten and liboqs

- Install Homebrew (if you haven’t), then Git:
  - brew install git cmake python@3
- Install and activate Emscripten:
  - git clone https://github.com/emscripten-core/emsdk.git
  - cd emsdk
  - ./emsdk install latest
  - ./emsdk activate latest
  - source ./emsdk/emsdk_env.sh
- Get liboqs and build it for wasm (disable OpenSSL):
  - git clone https://github.com/open-quantum-safe/liboqs.git
  - cd liboqs
  - mkdir build-emscripten && cd build-emscripten
  - emcmake cmake .. -DOQS_BUILD_ONLY_LIB=ON -DOQS_USE_OPENSSL=OFF
  - emmake make
  - Result: build-emscripten/liboqs.a and include/ headers ready.

Tip: Keep liboqs as a git submodule or vendor build-emscripten/liboqs.a + include/ into a native/oqs folder in your repo so teammates don’t rebuild every time.

---

### Minimal C API (ML-KEM-768, ES-friendly)

```c
// kem_liboqs.c
#include <oqs/oqs.h>
#include <stdint.h>

static OQS_KEM *kem = NULL;

int kem_init() {
  if (kem) { OQS_KEM_free(kem); kem = NULL; }
  kem = OQS_KEM_new("ML-KEM-768");
  return kem ? 0 : 1;
}

int kem_pk_len() { return kem ? (int) kem->length_public_key : -1; }
int kem_sk_len() { return kem ? (int) kem->length_secret_key : -1; }
int kem_ct_len() { return kem ? (int) kem->length_ciphertext : -1; }
int kem_ss_len() { return kem ? (int) kem->length_shared_secret : -1; }

int kem_keypair(uint8_t *pk_out, uint8_t *sk_out) {
  if (!kem) return 1;
  return OQS_KEM_keypair(kem, pk_out, sk_out);
}

int kem_encaps(const uint8_t *pk, uint8_t *ct_out, uint8_t *ss_out) {
  if (!kem) return 1;
  return OQS_KEM_encaps(kem, ct_out, ss_out, pk);
}

int kem_decaps(const uint8_t *ct, const uint8_t *sk, uint8_t *ss_out) {
  if (!kem) return 1;
  return OQS_KEM_decaps(kem, ss_out, ct, sk);
}

void kem_free() {
  if (kem) { OQS_KEM_free(kem); kem = NULL; }
}
```

---

### Compile to wasm + JS glue (Node/Next server-side)

```bash
# From your project root; adjust paths to liboqs
emcc kem_liboqs.c \
  -I./liboqs/include \
  ./liboqs/build-emscripten/liboqs.a \
  -O3 \
  -s ENVIRONMENT=node \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=KEMModule \
  -s EXPORTED_FUNCTIONS='["_kem_init","_kem_pk_len","_kem_sk_len","_kem_ct_len","_kem_ss_len","_kem_keypair","_kem_encaps","_kem_decaps","_kem_free","_malloc","_free"]' \
  -o kem_liboqs.js
```

Outputs:
- kem_liboqs.js (glue, ES-loadable factory)
- kem_liboqs.wasm (binary)

Place both in a server-only path (e.g., server/crypto/ or src/server/crypto/) — don’t load in the browser unless you intend to.

---

### ES6 loader and three functions (no cwrap/ccall)

Create utils/crypto_liboqs.js:

```js
// utils/crypto_liboqs.js (server-side)
let ModulePromise = null;
let sizes = null;

function toHex(u8) {
  return Buffer.from(u8).toString('hex');
}

function fromHex(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

async function loadModule() {
  if (!ModulePromise) {
    const KEMModuleFactory = (await import('../server/crypto/kem_liboqs.js')).default || (await import('../server/crypto/kem_liboqs.js'));
    ModulePromise = KEMModuleFactory();
  }
  const Module = await ModulePromise;

  // Initialize KEM once
  if (!sizes) {
    const rc = Module._kem_init();
    if (rc !== 0) throw new Error('kem_init failed');

    const pkLen = Module._kem_pk_len();
    const skLen = Module._kem_sk_len();
    const ctLen = Module._kem_ct_len();
    const ssLen = Module._kem_ss_len();
    if ([pkLen, skLen, ctLen, ssLen].some(x => x <= 0)) throw new Error('invalid KEM sizes');

    sizes = { pkLen, skLen, ctLen, ssLen };
  }
  return { Module, sizes };
}

// 3. GENERATE IDENTITY
export async function generateIdentity() {
  const { Module, sizes } = await loadModule();

  const pkPtr = Module._malloc(sizes.pkLen);
  const skPtr = Module._malloc(sizes.skLen);
  try {
    const rc = Module._kem_keypair(pkPtr, skPtr);
    if (rc !== 0) throw new Error('kem_keypair failed');

    const pk = Module.HEAPU8.subarray(pkPtr, pkPtr + sizes.pkLen);
    const sk = Module.HEAPU8.subarray(skPtr, skPtr + sizes.skLen);

    return {
      publicKey: toHex(pk),
      privateKey: Buffer.from(sk) // keep bytes; you already handle Buffer in your app
    };
  } finally {
    Module._free(pkPtr);
    Module._free(skPtr);
  }
}

// 4. KEY EXCHANGE (ENCAPS)
export async function performKeyExchange(recipientPublicKeyHex) {
  const { Module, sizes } = await loadModule();

  const pkBytes = fromHex(recipientPublicKeyHex);
  if (pkBytes.length !== sizes.pkLen) throw new Error(`Bad public key length: got ${pkBytes.length}, expected ${sizes.pkLen}`);

  const pkPtr = Module._malloc(sizes.pkLen);
  const ctPtr = Module._malloc(sizes.ctLen);
  const ssPtr = Module._malloc(sizes.ssLen);

  try {
    Module.HEAPU8.set(pkBytes, pkPtr);
    const rc = Module._kem_encaps(pkPtr, ctPtr, ssPtr);
    if (rc !== 0) throw new Error('kem_encaps failed');

    const ct = Module.HEAPU8.subarray(ctPtr, ctPtr + sizes.ctLen);
    const ss = Module.HEAPU8.subarray(ssPtr, ssPtr + sizes.ssLen);

    return {
      capsule: toHex(ct),
      sharedSecret: Buffer.from(ss) // bytes, not hex, for direct KDF use
    };
  } finally {
    Module._free(pkPtr);
    Module._free(ctPtr);
    Module._free(ssPtr);
  }
}

// 5. RECOVER KEY (DECAPS)
export async function recoverSessionKey(capsuleHex, privateKeyBytes) {
  const { Module, sizes } = await loadModule();

  const ctBytes = fromHex(capsuleHex);
  if (ctBytes.length !== sizes.ctLen) throw new Error(`Bad capsule length: got ${ctBytes.length}, expected ${sizes.ctLen}`);
  if (privateKeyBytes.length !== sizes.skLen) throw new Error(`Bad secret key length: got ${privateKeyBytes.length}, expected ${sizes.skLen}`);

  const ctPtr = Module._malloc(sizes.ctLen);
  const skPtr = Module._malloc(sizes.skLen);
  const ssPtr = Module._malloc(sizes.ssLen);

  try {
    Module.HEAPU8.set(ctBytes, ctPtr);
    Module.HEAPU8.set(privateKeyBytes, skPtr);

    const rc = Module._kem_decaps(ctPtr, skPtr, ssPtr);
    if (rc !== 0) throw new Error('kem_decaps failed');

    const ss = Module.HEAPU8.subarray(ssPtr, ssPtr + sizes.ssLen);
    return Buffer.from(ss);
  } finally {
    Module._free(ctPtr);
    Module._free(skPtr);
    Module._free(ssPtr);
  }
}
```

Notes:
- ES6 dynamic import keeps it server-only in Next.js. If you need CommonJS, wrap require and module.exports similarly.
- No cwrap/ccall used — only Module._functions, _malloc/_free, and HEAPU8.
- You keep shared secrets and private keys as bytes (Buffer) so you can KDF/HKDF them reliably.

---

### Replace your current utils

- Rename your existing functions or export the new ones under the same names:
  - generateIdentity -> returns { publicKey: hex, privateKey: Buffer }
  - performKeyExchange -> returns { capsule: hex, sharedSecret: Buffer }
  - recoverSessionKey -> returns Buffer

If your app currently expects privateKey as hex, you can convert Buffer.from(sk).toString('hex'), but keeping raw bytes is safer and cheaper.

---

### Folder layout (server-only)

```
your-app/
  liboqs/                      # submodule or vendored
    include/
    build-emscripten/liboqs.a
  src/
    server/crypto/
      kem_liboqs.c
      kem_liboqs.js            # generated by emcc
      kem_liboqs.wasm          # generated by emcc
    utils/
      crypto_liboqs.js         # ES6 functions above
```

Add a npm script:
```json
{
  "scripts": {
    "build:kem": "emcc src/server/crypto/kem_liboqs.c -I./liboqs/include ./liboqs/build-emscripten/liboqs.a -O3 -s ENVIRONMENT=node -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=KEMModule -s EXPORTED_FUNCTIONS='[\"_kem_init\",\"_kem_pk_len\",\"_kem_sk_len\",\"_kem_ct_len\",\"_kem_ss_len\",\"_kem_keypair\",\"_kem_encaps\",\"_kem_decaps\",\"_kem_free\",\"_malloc\",\"_free\"]' -o src/server/crypto/kem_liboqs.js"
  }
}
```

---

### Pitfalls and confirmations

- Randomness: On Node, Emscripten uses secure randomness; ML-KEM keygen/encap are safe out of the box.
- Length checks: Kyber-768 sizes are pk=1184, sk=2400, ct=1088, ss=32; the code queries them at runtime, so no hardcoding.
- Singleton init: kem_init runs once and caches sizes; safe across repeated calls.
- Next.js: Keep these imports in server-only code (API routes or server components). Don’t bundle wasm into client pages unless intended.

If you want, I can add a tiny self-test script that calls the three functions and asserts shared secrets match, so you can run “node test_kem.mjs” and get a green check before wiring it into the chat flow.