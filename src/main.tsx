// =========================================================
// ARCHIE PWA — application entry
//
// The owner's standalone ARCHIE app: conversational front
// door (Assistant) plus the complete suite of premium surfaces:
// Control, Execution, Trading, Exchange Access, Wallet Recovery,
// Offensive Security, Voice, Evolution, Knowledge, Learning,
// Training, TerminoBook, People, System, Anatomy, Engines,
// Security, Ops, and Migration.
// All of ARCHIE's intelligence lives server-side in the archie-*
// edge functions on the Freluxtools project; this shell renders
// and talks to them.
// =========================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import ArchieLayout from "@/components/archie/ArchieLayout";
import Assistant from "@/pages/Assistant";
import StudioWorkbench from "@/components/studio/StudioWorkbench";
import AdminDashboard from "@/pages/admin/AdminDashboard";

// Dedicated Premium Archie Pages
import ArchieControl from "@/pages/archie/ArchieControl";
import ArchieExecution from "@/pages/archie/ArchieExecution";
import ArchieTrading from "@/pages/archie/ArchieTrading";
import ArchieExchangeAccess from "@/pages/archie/ArchieExchangeAccess";
import ArchieWalletRecovery from "@/pages/archie/ArchieWalletRecovery";
import ArchieOffensive from "@/pages/archie/ArchieOffensive";
import ArchieVoice from "@/pages/archie/ArchieVoice";
import ArchieEvolution from "@/pages/archie/ArchieEvolution";
import ArchieKnowledge from "@/pages/archie/ArchieKnowledge";
import ArchieLearning from "@/pages/archie/ArchieLearning";
import ArchieTraining from "@/pages/archie/ArchieTraining";
import ArchieTerminology from "@/pages/archie/ArchieTerminology";
import ArchieShared from "@/pages/archie/ArchieShared";
import ArchiePeople from "@/pages/archie/ArchiePeople";
import ArchieDevices from "@/pages/archie/ArchieDevices";
import ArchieSystem from "@/pages/archie/ArchieSystem";
import ArchieAnatomy from "@/pages/archie/ArchieAnatomy";
import ArchieEngines from "@/pages/archie/ArchieEngines";
import ArchieSecurity from "@/pages/archie/ArchieSecurity";
import ArchieOps from "@/pages/archie/ArchieOps";
import ArchieMigration from "@/pages/archie/ArchieMigration";
import ArchieResearch from "@/pages/archie/ArchieResearch";

import "@/index.css";
import "@/styles/animations.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Dedicated Isolated Admin & Governance Route */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/archie/admin" element={<AdminDashboard />} />

          {/* Unified ARCHIE App Layout with Persistent Premium Shell */}
          <Route element={<ArchieLayout />}>
            <Route path="/" element={<Assistant />} />
            <Route path="/archie" element={<Assistant />} />
            <Route path="/archie/chat" element={<Assistant />} />
            <Route path="/archie/coding" element={<StudioWorkbench />} />

            {/* Dedicated surfaces matching sidebar navigation */}
            <Route path="/archie/control" element={<ArchieControl />} />
            <Route path="/archie/execution" element={<ArchieExecution />} />
            <Route path="/archie/trading" element={<ArchieTrading />} />
            <Route path="/archie/exchange-access" element={<ArchieExchangeAccess />} />
            <Route path="/archie/wallet-recovery" element={<ArchieWalletRecovery />} />
            <Route path="/archie/offensive" element={<ArchieOffensive />} />
            <Route path="/archie/voice" element={<ArchieVoice />} />
            <Route path="/archie/evolution" element={<ArchieEvolution />} />
            <Route path="/archie/knowledge" element={<ArchieKnowledge />} />
            <Route path="/archie/learning" element={<ArchieLearning />} />
            <Route path="/archie/training" element={<ArchieTraining />} />
            <Route path="/archie/terminology" element={<ArchieTerminology />} />
            <Route path="/archie/shared" element={<ArchieShared />} />
            <Route path="/archie/people" element={<ArchiePeople />} />
            <Route path="/archie/devices" element={<ArchieDevices />} />
            <Route path="/archie/system" element={<ArchieSystem />} />
            <Route path="/archie/anatomy" element={<ArchieAnatomy />} />
            <Route path="/archie/engines" element={<ArchieEngines />} />
            <Route path="/archie/security" element={<ArchieSecurity />} />
            <Route path="/archie/ops" element={<ArchieOps />} />
            <Route path="/archie/migration" element={<ArchieMigration />} />
            <Route path="/archie/research" element={<ArchieResearch />} />

            {/* Fallback */}
            <Route path="*" element={<Assistant />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
