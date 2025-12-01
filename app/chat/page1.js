"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import io from "socket.io-client";
// import { encryptGCM, decryptGCM, performKeyExchange, recoverSessionKey } from "../../utils/crypto";
import ControlPanel from "./components/ControlPanel";
import ChatWindow from "./components/ChatWindow";
import toast from "react-hot-toast";

import "./chat.css";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TIMING CONFIG
const PRE_GEN_TIME = 4.5 * 60 * 1000;
const SWAP_TIME = 5.0 * 60 * 1000;

function ChatPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // REFS
    const socketRef = useRef(null);
    const myPrivateKeyRef = useRef(null);
    const activeRecipientRef = useRef("");

    const sessionKeyRef = useRef(null);
    const mySessionKeyRef = useRef(null);
    const currentCapsuleRef = useRef(null);
    const myCapsuleRef = useRef(null);
    const pendingKeysRef = useRef(null);

    // STATE
    const [username, setUsername] = useState("");
    const [recipient, setRecipient] = useState(""); // <--- This drives the dropdown
    const [connected, setConnected] = useState(false);
    const [message, setMessage] = useState("");
    const [chat, setChat] = useState([]);
    const [users, setUsers] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState([]);

    // 1. INITIALIZE
    useEffect(() => {
        if (myPrivateKeyRef.current) return;
        const u = searchParams.get("user");
        if (u) setUsername(u);
        const storedKeyB64 = sessionStorage.getItem("chat_session_key");
        if (storedKeyB64) {
            sessionStorage.removeItem("chat_session_key");
            const binaryString = atob(storedKeyB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            myPrivateKeyRef.current = bytes;

        } else { router.push("/"); }
    }, [searchParams, router]);

    // Update Ref when State changes
    useEffect(() => { activeRecipientRef.current = recipient; }, [recipient]);

    useEffect(() => {
        fetch("/api/users").then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); });
    }, []);

    // 2. SOCKETS
    useEffect(() => {
        socketRef.current = io();
        socketRef.current.on("connect", () => { /* Wait for user */ });
        socketRef.current.on("online-users", setOnlineUsers);

        socketRef.current.on("handshake_received", async (data) => {
            if (!myPrivateKeyRef.current || activeRecipientRef.current !== data.from) return;
            try {
                // Mirror of old: recoverSessionKey via API
                const resRecover = await fetch("/api/crypto", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "recoverSessionKey",
                        payload: {
                            capsuleHex: data.capsule,
                            privateKeyBytes: Array.from(myPrivateKeyRef.current)
                        }
                    })
                });
                const { sharedSecret } = await resRecover.json();
                sessionKeyRef.current = sharedSecret; // mirror: just assign
                setConnected(true);
                setChat(prev => [...prev, { from: "system", text: `🔐 Key Rotation`, time: new Date().toISOString() }]);
            } catch (err) { console.error(err); }
        });

        socketRef.current.on("receive-message", async (data) => {
            if (data.from !== activeRecipientRef.current && data.from !== username) return;
            let text = "🔒 [Fail]";
            if (data.capsule && myPrivateKeyRef.current) {
                try {
                    // Mirror of old: recoverSessionKey via API
                    const resRecover = await fetch("/api/crypto", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "recoverSessionKey",
                            payload: {
                                capsuleHex: data.capsule,
                                privateKeyBytes: Array.from(myPrivateKeyRef.current)
                            }
                        })
                    });
                    const { sharedSecret } = await resRecover.json();

                    // Mirror of old: decryptGCM via API
                    const resDecrypt = await fetch("/api/crypto", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "decryptGCM",
                            payload: { packet: data.packet, sessionKey: sharedSecret }
                        })
                    });
                    const { message: decryptedMsg } = await resDecrypt.json();
                    text = decryptedMsg;
                    setConnected(true);
                } catch (e) { }
            } else if (sessionKeyRef.current) {
                // Mirror of old: decryptGCM via API
                const resDecrypt = await fetch("/api/crypto", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "decryptGCM",
                        payload: { packet: data.packet, sessionKey: sessionKeyRef.current }
                    })
                });
                const { message: decryptedMsg } = await resDecrypt.json();
                text = decryptedMsg;
            }
            setChat(prev => [...prev, { from: data.from, text, time: data.time }]);
        });

        return () => socketRef.current?.disconnect();
    }, []);

    useEffect(() => {
        if (username && socketRef.current) socketRef.current.emit("register-user", username);
    }, [username]);


    // 3. TIMER LOGIC (Same as before)
    useEffect(() => {
        let preGenTimer, swapTimer;

        const preGenerateKeys = async () => {
            if (!activeRecipientRef.current || !username) return;
            try {
                const [resBob, resMe] = await Promise.all([
                    fetch(`/api/getPublicKey?username=${encodeURIComponent(activeRecipientRef.current)}`),
                    fetch(`/api/getPublicKey?username=${encodeURIComponent(username)}`)
                ]);
                const bobData = await resBob.json();
                const meData = await resMe.json();

                if (bobData.publicKey && meData.publicKey) {
                    // Call API for Bob
                    const resExBob = await fetch("/api/crypto", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "performKeyExchange",
                            payload: { recipientPublicKeyHex: bobData.publicKey }
                        })
                    });
                    const exBob = await resExBob.json();

                    // Call API for Me
                    const resExMe = await fetch("/api/crypto", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "performKeyExchange",
                            payload: { recipientPublicKeyHex: meData.publicKey }
                        })
                    });
                    const exMe = await resExMe.json();

                    pendingKeysRef.current = {
                        sessionKey: Buffer.from(exBob.sharedSecret),
                        mySessionKey: Buffer.from(exMe.sharedSecret),
                        currentCapsule: exBob.capsule,
                        myCapsule: exMe.capsule
                    };
                }
            } catch (e) {
                console.error("Pre-generate keys failed:", e);
            }
        };

        const swapKeys = () => {
            if (!pendingKeysRef.current) return;
            sessionKeyRef.current = pendingKeysRef.current.sessionKey;
            mySessionKeyRef.current = pendingKeysRef.current.mySessionKey;
            currentCapsuleRef.current = pendingKeysRef.current.currentCapsule;
            myCapsuleRef.current = pendingKeysRef.current.myCapsule;
            pendingKeysRef.current = null;

            if (socketRef.current) {
                socketRef.current.emit("handshake_packet", {
                    to: activeRecipientRef.current,
                    capsule: currentCapsuleRef.current
                });
            }
            startTimers();
        };

        const startTimers = () => {
            clearTimeout(preGenTimer);
            clearTimeout(swapTimer);
            preGenTimer = setTimeout(preGenerateKeys, PRE_GEN_TIME);
            swapTimer = setTimeout(swapKeys, SWAP_TIME);
        };

        if (connected) startTimers();

        return () => {
            clearTimeout(preGenTimer);
            clearTimeout(swapTimer);
        };
    }, [connected]);

    // --- ACTIONS ---

    const handleUserSelect = (newUser) => {
        if (newUser !== recipient) {
            setChat([]);
            setConnected(false);
            sessionKeyRef.current = null;
            pendingKeysRef.current = null;
        }
        setRecipient(newUser); // ✅ This updates the dropdown UI
    };

    const connect = async () => {
        if (!recipient) return;
        await loadHistory();
        try {
            const resKey = await fetch(`/api/getPublicKey?username=${encodeURIComponent(recipient)}`);
            const data = await resKey.json();
            if (data.publicKey) {
                // Mirror of old: performKeyExchange via API
                const resEx = await fetch("/api/crypto", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "performKeyExchange",
                        payload: { recipientPublicKeyHex: data.publicKey }
                    })
                });
                const { capsule, sharedSecret } = await resEx.json();

                // Mirror of old: just assign sharedSecret
                sessionKeyRef.current = sharedSecret;
                mySessionKeyRef.current = sharedSecret;

                setConnected(true);
                toast.success(`Connected to ${decodeURIComponent(recipient)}`, {
                    duration: 3000,
                    icon: "✔️",
                });
                socketRef.current.emit("handshake_packet", { to: recipient, capsule });
            } else {
                alert("User keys not found");
            }
        } catch (e) {
            console.error(e);
        }
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
                        // Mirror of old: recoverSessionKey via API
                        // const resRecover = await fetch("/api/crypto", {
                        //     method: "POST",
                        //     headers: { "Content-Type": "application/json" },
                        //     body: JSON.stringify({
                        //         action: "recoverSessionKey",
                        //         payload: {
                        //             capsuleHex: targetCapsule,
                        //             privateKeyBytes: Array.from(myPrivateKeyRef.current)
                        //         }
                        //     })
                        // });
                        // const { sharedSecret } = await resRecover.json();

                        const resRecover = await fetch("/api/crypto", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action: "recoverSessionKey",
                                payload: {
                                    capsuleHex: targetCapsule,
                                    privateKeyBytes: Array.from(
                                        Buffer.isBuffer(myPrivateKeyRef.current) || myPrivateKeyRef.current instanceof Uint8Array
                                            ? myPrivateKeyRef.current
                                            : Buffer.from(myPrivateKeyRef.current, "hex")
                                    )
                                }
                            })
                        });
                        const { sharedSecret } = await resRecover.json(); // hex string


                        // Mirror of old: decryptGCM via API
                        // const resDecrypt = await fetch("/api/crypto", {
                        //     method: "POST",
                        //     headers: { "Content-Type": "application/json" },
                        //     body: JSON.stringify({
                        //         action: "decryptGCM",
                        //         payload: { packet: targetPacket, sessionKey: sharedSecret }
                        //     })
                        // });
                        // const { message: decryptedMsg } = await resDecrypt.json();

                        const resDecrypt = await fetch("/api/crypto", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action: "decryptGCM",
                                payload: { packet: targetPacket, sessionKey: sharedSecret } // hex
                            })
                        });
                        const { message: decryptedMsg } = await resDecrypt.json();


                        return { from: msg.from, text: decryptedMsg, time: msg.time };
                    }
                    return { from: msg.from, text: "🔒", time: msg.time };
                } catch (e) {
                    return { from: msg.from, text: "⚠️", time: msg.time };
                }
            }));
            setChat(decrypted);
        }
    };


    const sendMessage = async () => {
        if (!message || !recipient) return;
        if (!sessionKeyRef.current) return alert("Connect first!");

        // Fetch self key for history if needed, or reuse sessionKey if simplified
        const [resBob, resMe] = await Promise.all([
            fetch(`/api/getPublicKey?username=${encodeURIComponent(recipient)}`),
            fetch(`/api/getPublicKey?username=${encodeURIComponent(username)}`)
        ]);
        const bobData = await resBob.json();
        const meData = await resMe.json();

        // Full Double Encryption Logic (API calls only; variables unchanged)
        const resExBob = await fetch("/api/crypto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "performKeyExchange",
                payload: { recipientPublicKeyHex: bobData.publicKey }
            })
        });
        const exBob = await resExBob.json();

        // const resEncryptBob = await fetch("/api/crypto", {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({
        //         action: "encryptGCM",
        //         payload: { text: message, sessionKey: exBob.sharedSecret.toString("hex") }
        //     })
        // });
        // const packetBob = await resEncryptBob.json();

        const resEncryptBob = await fetch("/api/crypto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "encryptGCM",
                payload: { text: message, sessionKey: exBob.sharedSecret } // hex
            })
        });
        const packetBob = await resEncryptBob.json(); // { iv, content, tag }


        const resExMe = await fetch("/api/crypto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "performKeyExchange",
                payload: { recipientPublicKeyHex: meData.publicKey }
            })
        });
        const exMe = await resExMe.json();

        const resEncryptMe = await fetch("/api/crypto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "encryptGCM",
                payload: { text: message, sessionKey: exMe.sharedSecret.toString("hex") }
            })
        });
        const packetMe = await resEncryptMe.json();

        // Update Session (mirror of old logic — no Buffers)
        sessionKeyRef.current = exBob.sharedSecret;
        currentCapsuleRef.current = exBob.capsule;
        mySessionKeyRef.current = exMe.sharedSecret;
        myCapsuleRef.current = exMe.capsule;

        await fetch("/api/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: username, to: recipient,
                packet: packetBob, capsule: exBob.capsule,
                senderPacket: packetMe, senderCapsule: exMe.capsule
            }),
        });

        socketRef.current.emit("send-message", {
            to: recipient,
            packet: packetBob,
            capsule: exBob.capsule
        });

        setChat((prev) => [...prev, { from: username, text: message, time: new Date().toISOString() }]);
        setMessage("");
    };


    const disconnect = () => {
        if (sessionKeyRef.current) try { sessionKeyRef.current.fill(0); } catch (e) { }
        sessionKeyRef.current = null;
        setConnected(false);
        toast.success(`${decodeURIComponent(recipient)} Disconnected!`, {
            duration: 3000,
            icon: "❎",   // clean cross mark for disconnect
        });
        setRecipient("");
        setChat([]);
    };

    // --- RENDER ---
    return (
        <div className="chat-page">
            <div className="chat-container">
                <div className="top-bar">
                    <button onClick={() => router.push("/")} className="home-button">Home</button>
                    <span className="profile-badge">User: <strong>{username}</strong></span>
                </div>

                <div className="chat-card">
                    {/* COMPONENTS */}
                    <ControlPanel
                        users={users}
                        recipient={recipient}
                        onlineUsers={onlineUsers}
                        currentUser={username}
                        onSelectUser={handleUserSelect}
                        onConnect={connect}
                        onClear={() => {
                            toast.success(`Screen Cleared!`, { duration: 3000, icon: "🧹" });
                            setChat([]);
                        }}
                        onDelete={async () => {
                            await fetch("/api/deleteMessages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user1: username, user2: recipient }) });
                            toast.success(`Chat History Cleared!`, { duration: 3000, icon: "🗑️" });
                            setChat([]);
                        }}
                        onDisconnect={disconnect}
                    />

                    <ChatWindow
                        chat={chat}
                        currentUser={username}
                        message={message}
                        setMessage={setMessage}
                        onSendMessage={sendMessage}
                        connected={connected}
                    />
                </div>
            </div>
        </div>
    );
}

export default function ChatPage() {
    return <Suspense fallback={<div>Loading...</div>}><ChatPageInner /></Suspense>;
}