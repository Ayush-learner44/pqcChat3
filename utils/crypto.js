
// "use server";

// import crypto from "crypto";
// import KEMFactory from "../public/kem_liboqs.js";

// let ModulePromise = null;
// let sizes = null;

// async function getKEM() {
//     if (!ModulePromise) {
//         ModulePromise = KEMFactory(); // returns a promise
//     }
//     const Module = await ModulePromise; // already initialized with SINGLE_FILE

//     if (!sizes) {
//         const rc = Module._kem_init();
//         if (rc !== 0) throw new Error("kem_init failed");

//         sizes = {
//             pk: Module._kem_pk_len(),
//             sk: Module._kem_sk_len(),
//             ct: Module._kem_ct_len(),
//             ss: Module._kem_ss_len(),
//         };
//     }
//     return { Module, sizes };
// }

// function toHex(u8) {
//     return Buffer.from(u8).toString("hex");
// }
// function fromHex(hex) {
//     return Uint8Array.from(Buffer.from(hex, "hex"));
// }

// // 1. AES-GCM ENCRYPTION
// export const encryptGCM = (text, sessionKey) => {
//     try {
//         const iv = crypto.randomBytes(12);

//         // Always decode hex string into 32-byte Buffer
//         const keyBuffer = Buffer.from(sessionKey, "hex");
//         if (keyBuffer.length !== 32) {
//             throw new Error(`Invalid AES key length: ${keyBuffer.length}, expected 32`);
//         }

//         const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
//         let encrypted = cipher.update(text, "utf8", "hex");
//         encrypted += cipher.final("hex");

//         const tag = cipher.getAuthTag().toString("hex");
//         return { iv: iv.toString("hex"), content: encrypted, tag };
//     } catch (err) {
//         console.error("Encryption Failed:", err);
//         return null;
//     }
// };

// // 2. AES-GCM DECRYPTION
// export const decryptGCM = (packet, sessionKey) => {
//     try {
//         if (!packet || !packet.iv || !packet.tag || !packet.content) return null;

//         const iv = Buffer.from(packet.iv, "hex");
//         const tag = Buffer.from(packet.tag, "hex");

//         // Always decode hex string into 32-byte Buffer
//         const keyBuffer = Buffer.from(sessionKey, "hex");
//         if (keyBuffer.length !== 32) {
//             throw new Error(`Invalid AES key length: ${keyBuffer.length}, expected 32`);
//         }

//         const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
//         decipher.setAuthTag(tag);

//         let decrypted = decipher.update(packet.content, "hex", "utf8");
//         decrypted += decipher.final("utf8");
//         return decrypted;
//     } catch (err) {
//         console.error("Decryption Failed:", err);
//         throw new Error("Integrity check failed");
//     }
// };

// // 3. GENERATE IDENTITY (liboqs)
// export const generateIdentity = async () => {
//     const { Module, sizes } = await getKEM();

//     const pkPtr = Module._malloc(sizes.pk);
//     const skPtr = Module._malloc(sizes.sk);
//     try {
//         const rc = Module._kem_keypair(pkPtr, skPtr);
//         if (rc !== 0) throw new Error("kem_keypair failed");

//         const pk = Module.HEAPU8.subarray(pkPtr, pkPtr + sizes.pk);
//         const sk = Module.HEAPU8.subarray(skPtr, skPtr + sizes.sk);

//         return {
//             publicKey: toHex(pk),       // Already Hex
//             privateKey: toHex(sk),      // CHANGE: Convert to Hex String
//         };
//     } finally {
//         Module._free(pkPtr);
//         Module._free(skPtr);
//     }
// };


// // 4. KEY EXCHANGE (ENCAPS)
// export const performKeyExchange = async (recipientPublicKeyHex) => {
//     const { Module, sizes } = await getKEM();

//     const pkBytes = fromHex(recipientPublicKeyHex);
//     if (pkBytes.length !== sizes.pk)
//         throw new Error(`Bad public key length ${pkBytes.length} != ${sizes.pk}`);

//     const pkPtr = Module._malloc(sizes.pk);
//     const ctPtr = Module._malloc(sizes.ct);
//     const ssPtr = Module._malloc(sizes.ss);

//     try {
//         Module.HEAPU8.set(pkBytes, pkPtr);
//         const rc = Module._kem_encaps(pkPtr, ctPtr, ssPtr);
//         if (rc !== 0) throw new Error("kem_encaps failed");

//         const ct = Module.HEAPU8.subarray(ctPtr, ctPtr + sizes.ct);
//         const ss = Module.HEAPU8.subarray(ssPtr, ssPtr + sizes.ss);

//         return {
//             capsule: toHex(ct),
//             sharedSecret: toHex(ss), // return hex string
//         };
//     } finally {
//         Module._free(pkPtr);
//         Module._free(ctPtr);
//         Module._free(ssPtr);
//     }
// };

// // 5. RECOVER KEY (DECAPS)
// // CHANGE: Rename argument to privateKeyHex for clarity
// export const recoverSessionKey = async (capsuleHex, privateKeyHex) => {
//     const { Module, sizes } = await getKEM();

//     const ctBytes = fromHex(capsuleHex);
//     // CHANGE: Convert Hex string back to Bytes
//     const skBytes = fromHex(privateKeyHex);

//     if (ctBytes.length !== sizes.ct)
//         throw new Error(`Bad capsule length ${ctBytes.length} != ${sizes.ct}`);

//     // Check against skBytes, not the hex string
//     if (skBytes.length !== sizes.sk)
//         throw new Error(`Bad secret key length ${skBytes.length} != ${sizes.sk}`);

//     const ctPtr = Module._malloc(sizes.ct);
//     const skPtr = Module._malloc(sizes.sk);
//     const ssPtr = Module._malloc(sizes.ss);

//     try {
//         Module.HEAPU8.set(ctBytes, ctPtr);
//         Module.HEAPU8.set(skBytes, skPtr); // Use the converted bytes

//         const rc = Module._kem_decaps(ctPtr, skPtr, ssPtr);
//         if (rc !== 0) throw new Error("kem_decaps failed");

//         const ss = Module.HEAPU8.subarray(ssPtr, ssPtr + sizes.ss);
//         return toHex(ss);
//     } finally {
//         Module._free(ctPtr);
//         Module._free(skPtr);
//         Module._free(ssPtr);
//     }
// };

"use server";

import crypto from "crypto";
import KEMFactory from "../public/kem_liboqs.js";

let ModulePromise = null;
let sizes = null;

async function getKEM() {
    if (!ModulePromise) {
        ModulePromise = KEMFactory();
    }
    const Module = await ModulePromise;

    if (!sizes) {
        const rc = Module._kem_init();
        if (rc !== 0) throw new Error("kem_init failed");

        sizes = {
            pk: Module._kem_pk_len(),
            sk: Module._kem_sk_len(),
            ct: Module._kem_ct_len(),
            ss: Module._kem_ss_len(),
        };
    }
    return { Module, sizes };
}

function toHex(u8) {
    return Buffer.from(u8).toString("hex");
}

// 🛡️ SMART DECODER: Handles Strings AND Buffers
function fromHex(input) {
    if (!input) return new Uint8Array(0);

    // 1. If it's already a Buffer or Uint8Array, use it directly!
    if (typeof input !== 'string') {
        return Uint8Array.from(input);
    }

    // 2. If it's a string, decode it from Hex
    return Uint8Array.from(Buffer.from(input, "hex"));
}

// 1. AES-GCM ENCRYPTION
export const encryptGCM = (text, sessionKey) => {
    try {
        const iv = crypto.randomBytes(12);
        // Ensure key is a Buffer of length 32
        const keyBuffer = Buffer.from(sessionKey, "hex");
        if (keyBuffer.length !== 32) {
            console.error(`EncryptGCM: Invalid key length ${keyBuffer.length}`);
            return null;
        }

        const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");

        const tag = cipher.getAuthTag().toString("hex");
        return { iv: iv.toString("hex"), content: encrypted, tag };
    } catch (err) {
        console.error("Encryption Failed:", err);
        return null;
    }
};

// 2. AES-GCM DECRYPTION
export const decryptGCM = (packet, sessionKey) => {
    try {
        if (!packet || !packet.iv || !packet.tag || !packet.content) return null;
        if (!sessionKey) return null;

        const iv = Buffer.from(packet.iv, "hex");
        const tag = Buffer.from(packet.tag, "hex");
        const keyBuffer = Buffer.from(sessionKey, "hex");

        const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(packet.content, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (err) {
        console.error("Decryption Failed:", err);
        throw new Error("Integrity check failed");
    }
};

// 3. GENERATE IDENTITY (liboqs)
export const generateIdentity = async () => {
    const { Module, sizes } = await getKEM();

    const pkPtr = Module._malloc(sizes.pk);
    const skPtr = Module._malloc(sizes.sk);
    try {
        const rc = Module._kem_keypair(pkPtr, skPtr);
        if (rc !== 0) throw new Error("kem_keypair failed");

        const pk = Module.HEAPU8.subarray(pkPtr, pkPtr + sizes.pk);
        const sk = Module.HEAPU8.subarray(skPtr, skPtr + sizes.sk);

        return {
            publicKey: toHex(pk),
            privateKey: toHex(sk),
        };
    } finally {
        Module._free(pkPtr);
        Module._free(skPtr);
    }
};

// 4. KEY EXCHANGE (ENCAPS)
export const performKeyExchange = async (recipientPublicKeyHex) => {
    const { Module, sizes } = await getKEM();

    const pkBytes = fromHex(recipientPublicKeyHex);
    if (pkBytes.length !== sizes.pk)
        throw new Error(`Bad public key length ${pkBytes.length} != ${sizes.pk}`);

    const pkPtr = Module._malloc(sizes.pk);
    const ctPtr = Module._malloc(sizes.ct);
    const ssPtr = Module._malloc(sizes.ss);

    try {
        Module.HEAPU8.set(pkBytes, pkPtr);
        const rc = Module._kem_encaps(pkPtr, ctPtr, ssPtr);
        if (rc !== 0) throw new Error("kem_encaps failed");

        const ct = Module.HEAPU8.subarray(ctPtr, ctPtr + sizes.ct);
        const ss = Module.HEAPU8.subarray(ssPtr, ssPtr + sizes.ss);

        return {
            capsule: toHex(ct),
            sharedSecret: toHex(ss),
        };
    } finally {
        Module._free(pkPtr);
        Module._free(ctPtr);
        Module._free(ssPtr);
    }
};

// 5. RECOVER KEY (DECAPS)
export const recoverSessionKey = async (capsuleHex, privateKeyInput) => {
    const { Module, sizes } = await getKEM();

    const ctBytes = fromHex(capsuleHex);

    // 🛡️ Use the smart decoder here
    let skBytes = fromHex(privateKeyInput);

    // --- SAFETY CHECK ---
    // If we still somehow got the double-length error (4800), fix it.
    if (skBytes.length === sizes.sk * 2) {
        console.log("⚠️ Fixing double-encoded key...");
        const fixedStr = Buffer.from(skBytes).toString('utf8');
        skBytes = Uint8Array.from(Buffer.from(fixedStr, "hex"));
    }
    // --------------------

    if (ctBytes.length !== sizes.ct)
        throw new Error(`Bad capsule length ${ctBytes.length} != ${sizes.ct}`);

    if (skBytes.length !== sizes.sk)
        throw new Error(`Bad secret key length ${skBytes.length} != ${sizes.sk}`);

    const ctPtr = Module._malloc(sizes.ct);
    const skPtr = Module._malloc(sizes.sk);
    const ssPtr = Module._malloc(sizes.ss);

    try {
        Module.HEAPU8.set(ctBytes, ctPtr);
        Module.HEAPU8.set(skBytes, skPtr);

        const rc = Module._kem_decaps(ctPtr, skPtr, ssPtr);
        if (rc !== 0) throw new Error("kem_decaps failed");

        const ss = Module.HEAPU8.subarray(ssPtr, ssPtr + sizes.ss);
        return toHex(ss);
    } finally {
        Module._free(ctPtr);
        Module._free(skPtr);
        Module._free(ssPtr);
    }
};