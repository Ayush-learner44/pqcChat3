This is the smart move. A fresh start clears out all the "Ghost Files" and cache issues.

Here is your **Complete Backend Kit**.

Since you started a new app, you likely need to create the folders first.

1.  Create a folder named **`pages`** in your root directory.
2.  Inside `pages`, create a folder named **`api`**.

Now, create these **6 files** inside `pages/api/`. I have verified they all point to the same database (`chatapp`) and support the "Double Encryption" (Sender History) logic we just built.

-----

### 1\. `pages/api/register.js`

  * **Role:** Registers a user.
  * **Logic:** Accepts Username + Public Key. Rejects duplicates.

<!-- end list -->

```javascript
import { MongoClient } from "mongodb";

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
        const db = client.db("chatapp"); // Database Name
        const users = db.collection("users");

        if (req.method === "POST") {
            const { username, publicKey } = req.body;

            if (!username || !username.trim()) {
                return res.status(400).json({ message: "Username required" });
            }
            if (!publicKey) {
                return res.status(400).json({ message: "Public Key required" });
            }

            const existing = await users.findOne({ username });
            if (existing) {
                return res.status(400).json({ message: "Username already exists" });
            }

            await users.insertOne({ 
                username, 
                publicKey, 
                createdAt: new Date() 
            });
            
            return res.status(200).json({ message: "User registered successfully" });
        }

        res.status(405).json({ message: "Method not allowed" });
    } catch (e) {
        console.error("Register API error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
}
```

-----

### 2\. `pages/api/login.js`

  * **Role:** Verifies user existence.
  * **Logic:** Since you use a Key File to login, the server just confirms "Yes, this user exists."

<!-- end list -->

```javascript
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
    const client = await clientPromise;
    const db = client.db("chatapp");
    const users = db.collection("users");

    if (req.method === "POST") {
        const { username } = req.body;
        
        if (!username) return res.status(400).json({ message: "Username required" });

        const user = await users.findOne({ username });
        
        if (!user) return res.status(404).json({ message: "User not found" });

        return res.status(200).json({ message: "User found", publicKey: user.publicKey });
    }

    res.status(405).json({ message: "Method not allowed" });
}
```

-----

### 3\. `pages/api/getPublicKey.js`

  * **Role:** Fetches a specific user's Public Key.
  * **Logic:** Alice calls this to get Bob's key before sending a message.

<!-- end list -->

```javascript
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

    const { username } = req.query;
    if (!username) return res.status(400).json({ message: "Target username required" });

    try {
        const client = await clientPromise;
        const db = client.db("chatapp");
        const users = db.collection("users");

        const user = await users.findOne({ username });

        if (!user) return res.status(404).json({ message: "User not found" });
        if (!user.publicKey) return res.status(404).json({ message: "User has no PQC Key" });

        return res.status(200).json({ publicKey: user.publicKey });

    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ message: "Server Error" });
    }
}
```

-----

### 4\. `pages/api/message.js`

  * **Role:** Stores encrypted messages.
  * **Logic:** Updated to accept **Double Encryption** (Sender's copy + Receiver's copy) so History works for both.

<!-- end list -->

```javascript
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
    const client = await clientPromise;
    const db = client.db("chatapp");
    const messages = db.collection("messages");

    if (req.method === "POST") {
        // Accepts Double Encryption payload
        const { from, to, packet, capsule, senderPacket, senderCapsule } = req.body;
        
        if (!from || !to || !packet) {
            return res.status(400).json({ message: "Missing fields" });
        }

        const doc = { 
            from, 
            to, 
            packet,         // Encrypted for Receiver
            capsule,        // Key for Receiver
            senderPacket,   // Encrypted for Sender (FIXES HISTORY)
            senderCapsule,  // Key for Sender
            time: new Date() 
        };
        
        await messages.insertOne(doc);
        return res.status(200).json({ message: "Message stored", doc });
    }

    if (req.method === "GET") {
        const { user1, user2 } = req.query;
        if (!user1 || !user2) return res.status(400).json({ message: "Missing query params" });
        
        const history = await messages
            .find({
                $or: [
                    { from: user1, to: user2 },
                    { from: user2, to: user1 },
                ],
            })
            .sort({ time: 1 })
            .toArray();
            
        return res.status(200).json(history);
    }

    res.status(405).json({ message: "Method not allowed" });
}
```

-----

### 5\. `pages/api/users.js`

  * **Role:** Lists all users for the dropdown.

<!-- end list -->

```javascript
import { MongoClient } from "mongodb";

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

        if (req.method === "GET") {
            const allUsers = await users.find({}, { projection: { username: 1, _id: 0 } }).toArray();
            return res.status(200).json(allUsers.map(u => u.username));
        }

        res.status(405).json({ message: "Method not allowed" });
    } catch (e) {
        console.error("Users API error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
}
```

-----

### 6\. `pages/api/deleteMessages.js`

  * **Role:** Utility to clear chat history.

<!-- end list -->

```javascript
import { MongoClient } from "mongodb";

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
        if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

        const { user1, user2 } = req.body;
        if (!user1 || !user2) return res.status(400).json({ message: "Missing users" });

        const client = await clientPromise;
        const db = client.db("chatapp");
        const messages = db.collection("messages");

        await messages.deleteMany({
            $or: [
                { from: user1, to: user2 },
                { from: user2, to: user1 }
            ]
        });

        return res.status(200).json({ message: "Messages deleted" });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}
```

### Critical Last Step

Since this is a fresh app, do not forget to create your **`.env.local`** file in the root folder (next to `package.json`) and paste your MongoDB URI:

```text
MONGODB_URI=your_mongodb_connection_string_here
```

That's the entire backend. It connects to `chatapp` database and supports the advanced encryption you need.