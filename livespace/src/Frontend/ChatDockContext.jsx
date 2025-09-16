// src/Frontend/ChatDockContext.js
import React, { createContext, useContext, useMemo, useState, useCallback } from "react";

const ChatDockContext = createContext({
  chats: [],                 // [{ id, name, photo }]
  openChat: (_peer) => {},   // openChat({ id, name, photo })
  closeChat: (_peerId) => {},
  closeAll: () => {},
});

export function useChatDock() {
  return useContext(ChatDockContext);
}

export function ChatDockProvider({ children, maxBoxes = 3 }) {
  const [chats, setChats] = useState([]); // [{ id, name, photo }]

  const openChat = useCallback((peer) => {
    if (!peer?.id) return;
    setChats((curr) => {
      if (curr.find((c) => c.id === peer.id)) return curr;
      const next = [...curr, { id: peer.id, name: peer.name || "Unknown", photo: peer.photo || "" }];
      return next.slice(-maxBoxes);
    });
  }, [maxBoxes]);

  const closeChat = useCallback((peerId) => {
    setChats((curr) => curr.filter((c) => c.id !== peerId));
  }, []);

  const closeAll = useCallback(() => setChats([]), []);

  const value = useMemo(() => ({ chats, openChat, closeChat, closeAll }), [chats, openChat, closeChat, closeAll]);

  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}
