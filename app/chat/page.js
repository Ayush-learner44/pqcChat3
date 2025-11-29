"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import io from "socket.io-client";
import {
    encryptGCM,
    decryptGCM,
    performKeyExchange,
    recoverSessionKey
} from "../../utils/crypto";
import "./chat.css";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// --- TIMING CONFIGURATION ---
const PRE_GEN_TIME = 4.5 * 60 * 1000; // 4 Minutes 30 Seconds (Generate Key)
const SWAP_TIME = 5.0 * 60 * 1000; // 5 Minutes 00 Seconds (Swap Key)

function ChatPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // REFS
    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const myPrivateKeyRef = useRef(null);

    // --- SESSION REFS ---
    const activeRecipientRef = useRef("");

    // 1. ACTIVE KEYS (Used for encryption NOW)
    const sessionKeyRef = useRef(null);
    const mySessionKeyRef = useRef(null);
    const currentCapsuleRef = useRef(null);
    const myCapsuleRef = useRef(null);

    // 2. PENDING KEYS (Generated at 4:30, Waiting for 5:00)
    const pendingKeysRef = useRef(null);

    // UI STATE
    const [username, setUsername] = useState("");
    const [recipient, setRecipient] = useState("");
    const [connected, setConnected] = useState(false);
    const [message, setMessage] = useState("");
    const [chat, setChat] = useState([]);
    const [users, setUsers] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState([]);

    // 1. INITIALIZE
    useEffect(() => {
        const u = searchParams.get("user");
        if (u) setUsername(u);

        const storedKeyB64 = sessionStorage.getItem("chat_session_key");
        if (storedKeyB64) {
            const binaryString = atob(storedKeyB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            myPrivateKeyRef.current = bytes;
        } else {
            router.push("/");
        }
    }, [searchParams, router]);

    useEffect(() => {
        activeRecipientRef.current = recipient;
    }, [recipient]);

    useEffect(() => {
        if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [chat]);

    useEffect(() => {
        fetch("/api/users").then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); });
    }, []);

    // 4. SOCKET LOGIC
    useEffect(() => {
        socketRef.current = io();

        socketRef.current.on("connect", () => {
            // Wait for username
        });

        socketRef.current.on("online-users", (active) => setOnlineUsers(active));

        // HANDSHAKE RECEIVED
        socketRef.current.on("handshake_received", async (data) => {
            if (!myPrivateKeyRef.current) return;
            // Only accept if we are talking to them
            if (activeRecipientRef.current !== data.from) return;

            try {
                const secret = await recoverSessionKey(data.capsule, myPrivateKeyRef.current);

                // If they sent a handshake, they rotated keys. We update our RECEIVE key.
                // Note: We don't necessarily update our SEND key (sessionKeyRef) until our timer hits.
                // But for simplicity in this assignment, we can sync up or just let encryption handle it.
                // We will assume this establishes the session for reading.

                setConnected(true);
                setChat((prev) => [...prev, { from: "system", text: `🔐 Key Rotation Received from ${data.from}`, time: new Date().toISOString() }]);
            } catch (err) { console.error("Handshake err", err); }
        });

        // MESSAGE RECEIVED
        socketRef.current.on("receive-message", async (data) => {
            if (data.from !== activeRecipientRef.current && data.from !== username) return;

            let text = "🔒 [Fail]";

            // Decrypt Logic
            if (data.capsule && myPrivateKeyRef.current) {
                try {
                    const tempKey = await recoverSessionKey(data.capsule, myPrivateKeyRef.current);
                    text = decryptGCM(data.packet, tempKey);
                    setConnected(true);
                } catch (e) { }
            }

            setChat((prev) => [...prev, { from: data.from, text: text, time: data.time }]);
        });

        return () => { if (socketRef.current) socketRef.current.disconnect(); };
    }, []);

    useEffect(() => {
        if (username && socketRef.current) socketRef.current.emit("register-user", username);
    }, [username]);


    // ==========================================
    // 5. THE "SEAMLESS" ROTATION TIMER
    // ==========================================
    useEffect(() => {
        let preGenTimer = null;
        let swapTimer = null;

        // Function to Run at 4:30 (PRE-COMPUTE)
        const preGenerateKeys = async () => {
            if (!activeRecipientRef.current || !username) return;
            console.log("⏳ 4:30 Mark: Pre-calculating Next Session Keys (Background)...");

            try {
                // Fetch Public Keys silently
                const [resBob, resMe] = await Promise.all([
                    fetch(`/api/getPublicKey?username=${encodeURIComponent(activeRecipientRef.current)}`),
                    fetch(`/api/getPublicKey?username=${encodeURIComponent(username)}`)
                ]);
                const bobData = await resBob.json();
                const meData = await resMe.json();

                if (bobData.publicKey && meData.publicKey) {
                    // Run Heavy Math NOW
                    const exBob = await performKeyExchange(bobData.publicKey);
                    const exMe = await performKeyExchange(meData.publicKey);

                    // Store in PENDING Ref (Do not use yet)
                    pendingKeysRef.current = {
                        sessionKey: exBob.sharedSecret,
                        mySessionKey: exMe.sharedSecret,
                        currentCapsule: exBob.capsule,
                        myCapsule: exMe.capsule
                    };
                    console.log("✅ Next Keys Ready in RAM. Waiting for Swap...");
                }
            } catch (e) { console.error("Pre-gen failed", e); }
        };

        // Function to Run at 5:00 (SWAP)
        const swapKeys = () => {
            if (!pendingKeysRef.current || !activeRecipientRef.current) return;
            console.log("⏰ 5:00 Mark: Swapping Keys Instantly!");

            // 1. Instant Swap (RAM Operation = Nanoseconds)
            sessionKeyRef.current = pendingKeysRef.current.sessionKey;
            mySessionKeyRef.current = pendingKeysRef.current.mySessionKey;
            currentCapsuleRef.current = pendingKeysRef.current.currentCapsule;
            myCapsuleRef.current = pendingKeysRef.current.myCapsule;

            // 2. Clear Pending
            pendingKeysRef.current = null;

            // 3. Notify Bob (Send Handshake)
            if (socketRef.current) {
                socketRef.current.emit("handshake_packet", {
                    to: activeRecipientRef.current,
                    capsule: currentCapsuleRef.current
                });
            }

            // 4. Restart the Cycle
            startTimers();
        };

        const startTimers = () => {
            clearTimeout(preGenTimer);
            clearTimeout(swapTimer);

            // Schedule next cycle
            preGenTimer = setTimeout(preGenerateKeys, PRE_GEN_TIME);
            swapTimer = setTimeout(swapKeys, SWAP_TIME);
        };

        // Start logic only if connected
        if (connected) {
            startTimers();
        }

        return () => {
            clearTimeout(preGenTimer);
            clearTimeout(swapTimer);
        };
    }, [connected]); // Re-runs when connection status changes


    // 6. ACTIONS
    const handleUserSelect = (e) => {
        const newUser = e.target.value;
        if (newUser !== recipient) {
            setChat([]);
            setConnected(false);
            sessionKeyRef.current = null;
            pendingKeysRef.current = null; // Clear pending
        }
        setRecipient(newUser);
    };

    const connect = async () => {
        if (!recipient) return;
        await loadHistory();

        // Initial Key Gen (Immediate)
        console.log("🚀 Initial Connection: Generating Keys...");
        try {
            const [resBob, resMe] = await Promise.all([
                fetch(`/api/getPublicKey?username=${encodeURIComponent(recipient)}`),
                fetch(`/api/getPublicKey?username=${encodeURIComponent(username)}`)
            ]);
            const bobData = await resBob.json();
            const meData = await resMe.json();

            if (bobData.publicKey && meData.publicKey) {
                const exBob = await performKeyExchange(bobData.publicKey);
                const exMe = await performKeyExchange(meData.publicKey);

                sessionKeyRef.current = exBob.sharedSecret;
                mySessionKeyRef.current = exMe.sharedSecret;
                currentCapsuleRef.current = exBob.capsule;
                myCapsuleRef.current = exMe.capsule;

                setConnected(true); // This triggers the Timer useEffect above

                socketRef.current.emit("handshake_packet", { to: recipient, capsule: exBob.capsule });
            } else {
                alert("User keys not found");
            }
        } catch (e) { console.error(e); }
    };

    const loadHistory = async () => {
        const res = await fetch(`/api/message?user1=${encodeURIComponent(username)}&user2=${encodeURIComponent(recipient)}`);
        if (res.ok) {
            const history = await res.json();
            const decrypted = await Promise.all(history.map(async (msg) => {
                try {
                    const isMe = msg.from === username;
                    const targetCapsule = isMe ? msg.senderCapsule : msg.capsule;
                    const targetPacket = isMe ? msg.senderPacket : msg.packet;

                    if (targetCapsule && myPrivateKeyRef.current) {
                        const k = await recoverSessionKey(targetCapsule, myPrivateKeyRef.current);
                        return { from: msg.from, text: decryptGCM(targetPacket, k), time: msg.time };
                    }
                    return { from: msg.from, text: "🔒 [Key Lost]", time: msg.time };
                } catch (e) { return { from: msg.from, text: "⚠️ Error", time: msg.time }; }
            }));
            setChat(decrypted);
        }
    };

    const sendMessage = async () => {
        if (!message || !recipient) return;
        if (!sessionKeyRef.current) return alert("Connect first!");

        // Use CACHED Keys (Fast AES)
        const packetBob = encryptGCM(message, sessionKeyRef.current);
        const packetMe = encryptGCM(message, mySessionKeyRef.current);

        await fetch("/api/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: username, to: recipient,
                packet: packetBob, capsule: currentCapsuleRef.current,
                senderPacket: packetMe, senderCapsule: myCapsuleRef.current
            }),
        });

        socketRef.current.emit("send-message", {
            to: recipient,
            packet: packetBob,
            capsule: currentCapsuleRef.current
        });

        setChat((prev) => [...prev, { from: username, text: message, time: new Date().toISOString() }]);
        setMessage("");
    };

    const disconnect = () => {
        if (sessionKeyRef.current) try { sessionKeyRef.current.fill(0); } catch (e) { }
        sessionKeyRef.current = null;
        pendingKeysRef.current = null;
        setConnected(false);
        setRecipient("");
        setChat([]);
    };

    return (
        <div className="chat-page">
            <div className="chat-container">
                <div className="top-bar">
                    <button onClick={() => router.push("/")} className="home-button">Home</button>
                    <span className="profile-badge">User: <strong>{username}</strong></span>
                </div>

                <div className="chat-center">
                    <div className="chat-card">
                        <div className="recipient-row">

                            <select
                                value={recipient}
                                onChange={(e) => {

                                    setRecipient(e.target.value);
                                    // Clear chat immediately on switch for that "Realtime" feel
                                    if (e.target.value !== recipient) {
                                        setChat([]);
                                        setConnected(false);
                                        sessionKeyRef.current = null;
                                    }
                                }}
                                className="recipient-select"
                            >
                                <option value="" disabled>Select User...</option>
                                {users.filter(u => u !== username).map((u, i) => (
                                    <option key={i} value={u}>
                                        {u} {onlineUsers.includes(u) ? "🟢" : "⚪"}
                                    </option>
                                ))}
                            </select>


                            <button onClick={connect} className="connect-button">Connect</button>
                            <button onClick={() => setChat([])} className="refresh-button">Clear</button>
                            <button onClick={async () => {
                                await fetch("/api/deleteMessages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user1: username, user2: recipient }) });
                                setChat([]);
                            }} className="delete-button">Delete</button>
                            <button onClick={disconnect} className="disconnect-button">Disconnect</button>
                        </div>

                        <div className="chat-window">
                            <div className="messages">
                                {chat.map((c, i) => (
                                    <div key={i} className={`message ${c.from === username ? "me" : c.from === "system" ? "system" : "them"}`}>
                                        <span className="from">{c.from === username ? "me" : c.from}:</span> {c.text}
                                        {c.time && <span className="timestamp"> {new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                            <div className="input-row">
                                <input value={message} onChange={e => setMessage(e.target.value)} className="message-input" placeholder="Type..." />
                                <button onClick={sendMessage} className="send-button">Send</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ChatPage() {
    return <Suspense fallback={<div>Loading...</div>}><ChatPageInner /></Suspense>;
}