
# Post-Quantum Secure Chat Application (Assignment 5)

## Security Upgrade: PQC & AES-GCM
This project upgrades the standard chat application (from Assignment 3) to be **Post-Quantum Cryptography (PQC) Secure**. It implements a hybrid cryptographic scheme using **ML-KEM (Kyber)** for key exchange and **AES-256-GCM** for message encryption, protecting user communication against future quantum computer attacks ("Harvest Now, Decrypt Later").

###  Key Security Features
1.  **Post-Quantum Key Exchange (KEM):** Uses **ML-KEM-768 (Kyber)** to securely transport session keys.
2.  **Double Ratchet Encryption:** Every message is encrypted twice—once for the receiver and once for the sender (Self-Encryption)—enabling secure history access without storing plaintext.
3.  **Forward Secrecy:** Session keys are ephemeral and exist only in RAM. They are never stored on disk or databases.
4.  **Side-Channel Protection:** Private keys are loaded from a physical file into volatile memory (RAM) and wiped upon logout/refresh. No keys are stored in `localStorage` or `cookies` to prevent XSS extraction.
5.  **Authenticated Encryption:** Uses **AES-256-GCM** to ensure both confidentiality and integrity (tamper-proofing).

---

## Live Deployment (Optional)
The project is designed to run locally for maximum security demonstration. If deployed, ensure the `.env` variables are set correctly on the server.

---

## Screenshots

### 1. Secure Registration & Key Generation
*Users generate a PQC Identity Pair locally. The Public Key is sent to the server, and the Private Key is auto-downloaded to the user's device.*
![Register Page](public/screenshots/register_pqc.png)

### 2. Identity-Based Login (Key File)
*Login requires uploading the physical `.key` file. No passwords are used.*
![Login Page](public/screenshots/login_pqc.png)

### 3. Encrypted Chat Interface
*Real-time secure chat. Messages are encrypted end-to-end.*
![Chat Interface](public/screenshots/chat_pqc.png)

### 4. MongoDB Storage (Encrypted)
*Database stores only encrypted packets and KEM capsules. No plaintext.*
![MongoDB Encrypted](public/screenshots/mongodb_pqc.png)

---

## Architecture & Workflow

### The Hybrid PQC Scheme
1.  **Registration:** Client generates `Kyber-768` Keypair. Public Key -> MongoDB. Private Key -> User's Disk.
2.  **Handshake:** Sender fetches Recipient's Public Key -> Encapsulates a shared secret (AES Key) -> Sends Capsule.
3.  **Transport:** Messages are encrypted using **AES-256-GCM** with the shared secret.
4.  **History:** Sender performs a second encapsulation for themselves to securely store "Sent" messages in the database.

```mermaid
sequenceDiagram
    participant Alice (Client)
    participant Server (MongoDB)
    participant Bob (Client)

    Note over Alice: 1. Generate AES Session Key
    Note over Alice: 2. Encapsulate for Bob (Kyber)
    Alice->>Server: Send { Ciphertext + Capsule }
    Server->>Bob: Push via Socket.io
    Note over Bob: 3. Decapsulate (Kyber) -> Get AES Key
    Note over Bob: 4. Decrypt Message (AES-GCM)
````

-----

## Tech Stack

  - **Frontend:** Next.js (React)
  - **Cryptography:**
      - `mlkem` (NIST FIPS 203 Standard / Kyber)
      - `crypto` (Node.js native AES-256-GCM)
  - **Backend:** Node.js (Custom Server)
  - **Real-Time:** Socket.IO
  - **Database:** MongoDB Atlas

-----

## Installation & Setup

### 1\. Clone the repository

```bash
git clone <repo-url>
cd pqc-chatapp
```

### 2\. Install dependencies

```bash
npm install
```

### 3\. Configure Environment

Create a `.env.local` file in the root directory:

```bash
MONGODB_URI=your_mongodb_connection_string
```

### 4\. Run the Secure Server

**Important:** Do not use `next dev`. You must run the custom server to enable Socket.IO and Environment variables correctly.

```bash
npm run dev
# OR
node server.js
```

### 5\. Access the App

Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000).

-----

##  Learning Outcomes

  - **Applied Cryptography:** Implemented NIST-standard Post-Quantum algorithms (ML-KEM) in a real-world web app.
  - **Secure Architecture:** Designed a "Zero-Knowledge" storage system where the server never sees the private key.
  - **Memory Management:** Learned to handle sensitive keys in RAM (`useRef`) to prevent persistent storage leaks.
  - **Hybrid Protocol:** Combined Asymmetric (KEM) and Symmetric (AES) encryption for performance and security.
  - **React State Management:** Managed complex asynchronous crypto state for seamless real-time UI updates.

-----

## Security Notice

  * This application uses **RAM-only key management**. Refreshing the page wipes the keys from memory for security. You must re-upload your key file to reconnect.
  * The `.key` file downloaded during registration is the **ONLY** way to access your account. If lost, the account is unrecoverable.
