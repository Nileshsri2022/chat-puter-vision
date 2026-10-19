import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatMessage } from "@/components/ChatMessage";
import "@/index.css";

const content = "Intro before selecting the specific middle phrase in this plain paragraph, then trailing text.";

export function SelectionFixture() {
  const [queuedText, setQueuedText] = useState("");
  return (
    <main>
      <ChatMessage
        role="assistant"
        content={content}
        onUseAsContext={(payload) => setQueuedText("text" in payload ? payload.text : "")}
      />
      <output id="queued-text">{queuedText}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<SelectionFixture />);
