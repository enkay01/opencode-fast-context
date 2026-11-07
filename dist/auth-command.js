const ACTIONS = {
    "": "set",
    login: "set",
    set: "set",
    key: "set",
    status: "status",
    revoke: "revoke",
    logout: "revoke",
    remove: "revoke",
    help: "help",
};
export function parseAuthCommand(input) {
    const tokens = input.trim().split(/\s+/).filter(Boolean);
    if (tokens[0]?.toLowerCase() === "auth")
        tokens.shift();
    const token = (tokens[0] ?? "").toLowerCase();
    const action = ACTIONS[token];
    return action ? { action } : { action: "unknown", token };
}
