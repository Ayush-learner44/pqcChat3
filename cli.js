// cli.js
import {
    generateIdentity,
    performKeyExchange,
    recoverSessionKey,
    encryptGCM,
    decryptGCM
} from "./utils/crypto.js";

async function main() {
    console.log("=== Alice & Bob Secure KEM Demo ===");

    // Bob generates identity
    const bob = await generateIdentity();
    console.log("Bob PK length:", bob.publicKey.length, "SK length:", bob.privateKey.length);

    // Alice generates identity
    const alice = await generateIdentity();
    console.log("Alice PK length:", alice.publicKey.length, "SK length:", alice.privateKey.length);

    // Alice encapsulates to Bob’s PK
    const { capsule, sharedSecret: aliceSS } = await performKeyExchange(bob.publicKey);
    console.log("Capsule length:", capsule.length, "Alice SS length:", aliceSS.length);

    // Bob decapsulates
    const bobSS = await recoverSessionKey(capsule, bob.privateKey);
    console.log("Bob SS length:", bobSS.length);

    // Compare secrets
    console.log("Secrets match:", Buffer.compare(aliceSS, bobSS) === 0);

    // AES-GCM round trip
    const message = "Hello from Alice to Bob!";
    const packet = encryptGCM(message, aliceSS);
    console.log("Encrypted packet:", packet);
    const recovered = decryptGCM(packet, bobSS);
    console.log("Decrypted back:", recovered);
}

main().catch(err => console.error("Demo failed:", err));
