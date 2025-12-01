emcc public/kem_liboqs.c \
  -I/Users/home/liboqs/build-emscripten/include \
  /Users/home/liboqs/build-emscripten/lib/liboqs.a \
  -O3 \
  -s ENVIRONMENT=node \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=KEMModule \
  -s SINGLE_FILE=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='["_kem_init","_kem_pk_len","_kem_sk_len","_kem_ct_len","_kem_ss_len","_kem_keypair","_kem_encaps","_kem_decaps","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
  -o public/kem_liboqs.js
