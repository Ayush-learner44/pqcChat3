// pages/api/crypto.js
import {
    generateIdentity,
    performKeyExchange,
    recoverSessionKey,
    encryptGCM,
    decryptGCM
} from "../../utils/crypto.js";

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const { action, payload } = req.body;

        switch (action) {
            case "generateIdentity": {
                const id = await generateIdentity();
                return res.status(200).json(id);
            }

            case "performKeyExchange": {
                const { recipientPublicKeyHex } = payload;
                const result = await performKeyExchange(recipientPublicKeyHex);
                return res.status(200).json(result);
            }

            case "recoverSessionKey": {
                const { capsuleHex, privateKeyBytes } = payload;
                const result = await recoverSessionKey(capsuleHex, Buffer.from(privateKeyBytes));
                return res.status(200).json({ sharedSecret: result.toString("hex") });
            }

            case "encryptGCM": {
                const { text, sessionKey } = payload;
                const packet = encryptGCM(text, Buffer.from(sessionKey, "hex"));
                return res.status(200).json(packet);
            }

            case "decryptGCM": {
                const { packet, sessionKey } = payload;
                const result = decryptGCM(packet, Buffer.from(sessionKey, "hex"));
                return res.status(200).json({ message: result });
            }

            default:
                return res.status(400).json({ error: "Unknown action" });
        }
    } catch (err) {
        console.error("Crypto API error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
