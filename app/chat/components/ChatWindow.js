
import { useEffect, useRef } from "react";

export default function ChatWindow({ chat, currentUser, message, setMessage, onSendMessage, connected }) {
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [chat]);

    return (
        <div className="chat-window">
            <div className="messages">
                {chat.map((c, i) => (
                    <div key={i} className={`message ${c.from === currentUser ? "me" : c.from === "system" ? "system" : "them"}`}>
                        <span className="from">{c.from === currentUser ? "me" : c.from}:</span> {c.text}
                        {c.time && <span className="timestamp"> {new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="input-row">
                <input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="message-input"
                    placeholder={connected ? "Type message..." : "Connect first"}
                    onKeyDown={(e) => e.key === 'Enter' && onSendMessage()} // Allow Enter key
                />
                <button onClick={onSendMessage} className="send-button" disabled={!connected}>Send</button>
            </div>
        </div>
    );
}