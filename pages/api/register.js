// import { MongoClient } from "mongodb";
// import bcrypt from "bcryptjs"; // Import bcrypt

// const uri = process.env.MONGODB_URI;
// let client;
// let clientPromise;

// if (!global._mongoClientPromise) {
//     client = new MongoClient(uri);
//     global._mongoClientPromise = client.connect();
// }
// clientPromise = global._mongoClientPromise;

// export default async function handler(req, res) {
//     try {
//         const client = await clientPromise;
//         const db = client.db("chatapp");
//         const users = db.collection("users");

//         if (req.method === "POST") {
//             const { username, password, publicKey } = req.body;

//             // 1. Validate inputs
//             if (!username || !password || !publicKey) {
//                 return res.status(400).json({ message: "Missing fields" });
//             }

//             const existing = await users.findOne({ username });
//             if (existing) {
//                 return res.status(400).json({ message: "Username already exists" });
//             }

//             // 2. Hash the Password
//             const salt = await bcrypt.genSalt(10);
//             const hashedPassword = await bcrypt.hash(password, salt);

//             // 3. Save User (Username + Hash + Public Key)
//             await users.insertOne({
//                 username,
//                 password: hashedPassword, // Save Hash, NOT plain text
//                 publicKey,
//                 createdAt: new Date()
//             });

//             return res.status(200).json({ message: "User registered successfully" });
//         }

//         res.status(405).json({ message: "Method not allowed" });
//     } catch (e) {
//         console.error("Register API error:", e);
//         res.status(500).json({ message: "Internal server error" });
//     }
// }



import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { generateIdentity } from "../../utils/crypto.js"; // <-- generate keys server-side

const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
    try {
        const client = await clientPromise;
        const db = client.db("chatapp");
        const users = db.collection("users");

        if (req.method === "POST") {
            const { username, password } = req.body;

            // 1. Validate inputs
            if (!username || !password) {
                return res.status(400).json({ message: "Missing fields" });
            }

            const existing = await users.findOne({ username });
            if (existing) {
                return res.status(400).json({ message: "Username already exists" });
            }

            // 2. Generate keypair server-side
            const { publicKey, privateKey } = await generateIdentity();

            // 3. Hash the password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // 4. Save user (username + hash + public key)
            await users.insertOne({
                username,
                password: hashedPassword,
                publicKey,
                createdAt: new Date()
            });

            // 5. Return keys to client (for private key download)
            return res.status(200).json({ publicKey, privateKey });
        }

        res.status(405).json({ message: "Method not allowed" });
    } catch (e) {
        console.error("Register API error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
}
