
// import { encryptGCM, decryptGCM, performKeyExchange, recoverSessionKey } from "../../utils/crypto";

// export default async function handler(req, res) {
//     try {
//         if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

//         const { action, payload } = req.body || {};
//         if (!action) return res.status(400).json({ message: "Missing action" });

//         switch (action) {
//             case "performKeyExchange": {
//                 const { recipientPublicKeyHex } = payload || {};
//                 if (!recipientPublicKeyHex) return res.status(400).json({ message: "Missing recipientPublicKeyHex" });
//                 const result = await performKeyExchange(recipientPublicKeyHex);
//                 return res.status(200).json(result); // { capsule, sharedSecret (hex) }
//             }

//             case "recoverSessionKey": {
//                 const { capsuleHex, privateKeyHex, privateKeyBytes } = payload || {};
//                 if (!capsuleHex) return res.status(400).json({ message: "Missing capsuleHex" });

//                 // Normalize secret key to raw bytes EXACTLY matching sizes.sk
//                 let skBytes;
//                 if (privateKeyHex) {
//                     skBytes = Buffer.from(privateKeyHex, "hex"); // raw bytes
//                 } else if (Array.isArray(privateKeyBytes)) {
//                     skBytes = Buffer.from(privateKeyBytes); // raw bytes
//                 } else {
//                     return res.status(400).json({ message: "Missing privateKeyHex/privateKeyBytes" });
//                 }

//                 const sharedSecretHex = await recoverSessionKey(capsuleHex, skBytes); // hex string
//                 return res.status(200).json({ sharedSecret: sharedSecretHex });
//             }

//             case "encryptGCM": {
//                 const { text, sessionKey } = payload || {};
//                 if (typeof text !== "string" || !sessionKey) {
//                     return res.status(400).json({ message: "Missing text/sessionKey" });
//                 }
//                 const packet = encryptGCM(text, sessionKey); // sessionKey is hex
//                 if (!packet) return res.status(500).json({ message: "Encryption failed" });
//                 return res.status(200).json(packet); // { iv, content, tag }
//             }

//             case "decryptGCM": {
//                 const { packet, sessionKey } = payload || {};
//                 if (!packet || !sessionKey) {
//                     return res.status(400).json({ message: "Missing packet/sessionKey" });
//                 }
//                 const message = decryptGCM(packet, sessionKey); // sessionKey is hex
//                 return res.status(200).json({ message });
//             }

//             default:
//                 return res.status(400).json({ message: `Unknown action: ${action}` });
//         }
//     } catch (err) {
//         console.error("Crypto API error:", err);
//         return res.status(500).json({ message: "Internal server error" });
//     }
// }


import { encryptGCM, decryptGCM, performKeyExchange, recoverSessionKey } from "../../utils/crypto";

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

        const { action, payload } = req.body || {};
        if (!action) return res.status(400).json({ message: "Missing action" });

        switch (action) {
            case "performKeyExchange": {
                const { recipientPublicKeyHex } = payload || {};
                if (!recipientPublicKeyHex) return res.status(400).json({ message: "Missing recipientPublicKeyHex" });

                const result = await performKeyExchange(recipientPublicKeyHex);
                return res.status(200).json(result);
            }

            case "recoverSessionKey": {
                // CHANGE: We only care about privateKeyHex now
                const { capsuleHex, privateKeyHex } = payload || {};

                if (!capsuleHex || !privateKeyHex) {
                    return res.status(400).json({ message: "Missing capsuleHex or privateKeyHex" });
                }

                // CHANGE: Pass the Hex String directly. 
                // crypto.js will handle the conversion to bytes.
                const sharedSecretHex = await recoverSessionKey(capsuleHex, privateKeyHex);

                return res.status(200).json({ sharedSecret: sharedSecretHex });
            }

            case "encryptGCM": {
                const { text, sessionKey } = payload || {};
                if (typeof text !== "string" || !sessionKey) {
                    return res.status(400).json({ message: "Missing text/sessionKey" });
                }
                const packet = encryptGCM(text, sessionKey);
                if (!packet) return res.status(500).json({ message: "Encryption failed" });
                return res.status(200).json(packet);
            }

            case "decryptGCM": {
                const { packet, sessionKey } = payload || {};
                if (!packet || !sessionKey) {
                    return res.status(400).json({ message: "Missing packet/sessionKey" });
                }
                const message = decryptGCM(packet, sessionKey);
                return res.status(200).json({ message });
            }

            default:
                return res.status(400).json({ message: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error("Crypto API error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}
