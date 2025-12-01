
export default function ControlPanel({
    users, recipient, onlineUsers, currentUser,
    onSelectUser, onConnect, onClear, onDelete, onDisconnect
}) {
    return (
        <div className="recipient-row">
            <select
                value={recipient} // <--- MUST MATCH PARENT STATE
                onChange={(e) => onSelectUser(e.target.value)}
                className="recipient-select"
            >
                <option value="" disabled>Select User...</option>
                {users
                    .filter((u) => u !== currentUser)
                    .map((u, i) => (
                        <option key={i} value={u}>
                            {u} {onlineUsers.includes(u) ? "🟢" : "⚪"}
                        </option>
                    ))}
            </select>

            <button onClick={onConnect} className="connect-button">Connect</button>
            <button onClick={onClear} className="refresh-button">Clear</button>
            <button onClick={onDelete} className="delete-button">Delete</button>
            <button onClick={onDisconnect} className="disconnect-button">Disconnect</button>
        </div>
    );
}