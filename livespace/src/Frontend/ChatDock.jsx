// src/Frontend/ChatDock.jsx
import React from "react";
import ChatBox from "./ChatBox";
import { useChatDock } from "./ChatDockContext";

export default function ChatDock({ currentUserId }) {
  const { chats, closeChat } = useChatDock();

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        display: "flex",
        gap: 10,
        zIndex: 1000,
      }}
    >
      {chats.map((peer) => (
        <ChatBox
          key={peer.id}
          me={currentUserId}
          peer={peer}
          onClose={() => closeChat(peer.id)}
        />
      ))}
    </div>
  );
}
