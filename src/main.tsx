// =========================================================
// ARCHIE PWA — application entry
//
// The owner's standalone ARCHIE app: conversational front
// door (Assistant) plus the premium surfaces (trading
// terminal, coding workbench, devices, research). All of
// ARCHIE's intelligence lives server-side in the archie-*
// edge functions on the Freluxtools project; this shell only
// renders and talks to them.
// =========================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Assistant from "@/pages/Assistant";
import ArchieTrading from "@/pages/archie/ArchieTrading";
import ArchieDevices from "@/pages/archie/ArchieDevices";
import ArchieResearch from "@/pages/archie/ArchieResearch";
import ArchieShared from "@/pages/archie/ArchieShared";
import StudioWorkbench from "@/components/studio/StudioWorkbench";
import "@/index.css";
import "@/styles/animations.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* The conversational front door — home is the owner
            assistant, also reachable at its historical
            /archie/chat route from installed PWAs. */}
        <Route path="/" element={<Assistant />} />
        <Route path="/archie/chat" element={<Assistant />} />
        <Route path="/archie" element={<Assistant />} />
        <Route path="/archie/coding" element={<StudioWorkbench />} />
        <Route path="/archie/trading" element={<ArchieTrading />} />
        <Route path="/archie/devices" element={<ArchieDevices />} />
        <Route path="/archie/research" element={<ArchieResearch />} />
        <Route path="/archie/shared" element={<ArchieShared />} />
        {/* Everything else lands on the assistant, SPA-style. */}
        <Route path="*" element={<Assistant />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
