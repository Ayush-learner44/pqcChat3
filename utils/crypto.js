// utils/crypto.js
import crypto from "crypto";
import KEMFactory from "../public/kem_liboqs.js";

let ModulePromise = null;
let sizes = null;

// async function getKEM() {
//     if (!ModulePromise) {
//         ModulePromise = KEMFactory();
//     }
//     const Module = await ModulePromise;

//     // Explicitly wait for runtime init
//     if (typeof Module.HEAPU8 === "undefined") {
//         await new Promise(resolve => {
//             Module.onRuntimeInitialized = resolve;
//         });
//     }

//     if (!sizes) {
//         Module._kem_init();
//         sizes = {
//             pk: Module._kem_pk_len(),
//             sk: Module._kem_sk_len(),
//             ct: Module._kem_ct_len(),
//             ss: Module._kem_ss_len(),
//         };
//     }
//     return { Module, sizes };
// }

async function getKEM() {
    if (!ModulePromise) {
        ModulePromise = KEMFactory(); // returns a promise
    }
    const Module = await ModulePromise; // already initialized with SINGLE_FILE

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
function fromHex(hex) {
    return Uint8Array.from(Buffer.from(hex, "hex"));
}

// 1. AES-GCM ENCRYPTION
export const encryptGCM = (text, sessionKey) => {
    try {
        const iv = crypto.randomBytes(12);
        const keyBuffer = Buffer.from(sessionKey);
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
        const iv = Buffer.from(packet.iv, "hex");
        const tag = Buffer.from(packet.tag, "hex");
        const keyBuffer = Buffer.from(sessionKey);

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

        console.log("HEAPU8 type:", typeof Module.HEAPU8);


        const pk = Module.HEAPU8.subarray(pkPtr, pkPtr + sizes.pk);
        const sk = Module.HEAPU8.subarray(skPtr, skPtr + sizes.sk);

        return {
            publicKey: toHex(pk),
            privateKey: Buffer.from(sk),
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
            sharedSecret: Buffer.from(ss),
        };
    } finally {
        Module._free(pkPtr);
        Module._free(ctPtr);
        Module._free(ssPtr);
    }
};

// 5. RECOVER KEY (DECAPS)
export const recoverSessionKey = async (capsuleHex, privateKeyBytes) => {
    const { Module, sizes } = await getKEM();

    const ctBytes = fromHex(capsuleHex);
    if (ctBytes.length !== sizes.ct)
        throw new Error(`Bad capsule length ${ctBytes.length} != ${sizes.ct}`);
    if (privateKeyBytes.length !== sizes.sk)
        throw new Error(`Bad secret key length ${privateKeyBytes.length} != ${sizes.sk}`);

    const ctPtr = Module._malloc(sizes.ct);
    const skPtr = Module._malloc(sizes.sk);
    const ssPtr = Module._malloc(sizes.ss);

    try {
        Module.HEAPU8.set(ctBytes, ctPtr);
        Module.HEAPU8.set(privateKeyBytes, skPtr);

        const rc = Module._kem_decaps(ctPtr, skPtr, ssPtr);
        if (rc !== 0) throw new Error("kem_decaps failed");

        const ss = Module.HEAPU8.subarray(ssPtr, ssPtr + sizes.ss);
        return Buffer.from(ss);
    } finally {
        Module._free(ctPtr);
        Module._free(skPtr);
        Module._free(ssPtr);
    }
};
