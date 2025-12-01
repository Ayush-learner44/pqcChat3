// cli.js
import {
    generateIdentity,
    performKeyExchange,
    recoverSessionKey,
    encryptGCM,
    decryptGCM
} from "./utils/crypto.js";

// ... imports ...

async function main() {
    console.log("=== Alice & Bob Secure KEM Demo ===");

    // Bob generates identity
    const bob = await generateIdentity();
    // privateKey is now a Hex String, so .length will be double the bytes (4800)
    console.log("Bob PK len (hex):", bob.publicKey.length, "SK len (hex):", bob.privateKey.length);

    // Alice generates identity
    const alice = await generateIdentity();

    // Alice encapsulates to Bob’s PK
    const { capsule, sharedSecret: aliceSS } = await performKeyExchange(bob.publicKey);

    // Bob decapsulates
    // Pass the Hex string directly
    const bobSS = await recoverSessionKey(capsule, bob.privateKey);

    console.log("Alice SS:", aliceSS);
    console.log("Bob SS:  ", bobSS);

    // CHANGE: Compare strings directly
    if (aliceSS === bobSS) {
        console.log("✅ Secrets match!");
    } else {
        console.error("❌ Secrets do NOT match");
    }

    // AES-GCM round trip
    const message = "Hello from Alice to Bob!";
    const packet = encryptGCM(message, aliceSS);
    console.log("Encrypted packet:", packet);

    const recovered = decryptGCM(packet, bobSS);
    console.log("Decrypted back:", recovered);
}

main().catch(err => console.error("Demo failed:", err));