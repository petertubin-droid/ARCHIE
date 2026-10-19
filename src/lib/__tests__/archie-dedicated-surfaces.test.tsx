import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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
import ArchiePeople from "@/pages/archie/ArchiePeople";
import ArchieSystem from "@/pages/archie/ArchieSystem";
import ArchieAnatomy from "@/pages/archie/ArchieAnatomy";
import ArchieEngines from "@/pages/archie/ArchieEngines";
import ArchieSecurity from "@/pages/archie/ArchieSecurity";
import ArchieOps from "@/pages/archie/ArchieOps";
import ArchieMigration from "@/pages/archie/ArchieMigration";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "test-owner-id", email: "owner@frelux.test" },
    session: null,
    loading: false,
  }),
}));

vi.mock("@/components/archie/StatusCenter", () => ({
  default: () => <div data-testid="status-center">Status Center</div>,
}));

vi.mock("@/components/archie/CoreSystemsProof", () => ({
  CoreSystemsProof: () => <div data-testid="core-systems-proof">Core Systems Proof</div>,
}));

vi.mock("@/components/archie/MobileLearningPanel", () => ({
  default: () => <div data-testid="mobile-learning">Mobile Learning Panel</div>,
}));

vi.mock("@/components/archie/PrivacyControlsPanel", () => ({
  default: () => <div data-testid="privacy-controls">Privacy Controls</div>,
}));

vi.mock("@/components/archie/DevGovernance", () => ({
  default: () => <div data-testid="dev-governance">Dev Governance</div>,
}));

vi.mock("@/components/archie/InfrastructurePanel", () => ({
  default: () => <div data-testid="infra-panel">Infrastructure Panel</div>,
}));

describe("ARCHIE Dedicated Surface Pages", () => {
  it("renders ArchieControl with authority governance", () => {
    render(<MemoryRouter><ArchieControl /></MemoryRouter>);
    expect(screen.getByText(/Authority & Governance/i)).toBeDefined();
  });

  it("renders ArchieExecution with target execution engine", () => {
    render(<MemoryRouter><ArchieExecution /></MemoryRouter>);
    expect(screen.getByText(/Target Execution Engine/i)).toBeDefined();
  });

  it("renders ArchieTrading with trading terminal", () => {
    render(<MemoryRouter><ArchieTrading /></MemoryRouter>);
    expect(screen.getByText(/ARCHIE TRADING TERMINAL/i)).toBeDefined();
  });

  it("renders ArchieExchangeAccess with broker connectivity", () => {
    render(<MemoryRouter><ArchieExchangeAccess /></MemoryRouter>);
    expect(screen.getByText(/Exchange Access & Broker Gateway/i)).toBeDefined();
  });

  it("renders ArchieWalletRecovery with zero-knowledge guarantee", () => {
    render(<MemoryRouter><ArchieWalletRecovery /></MemoryRouter>);
    expect(screen.getByText(/Wallet & Passphrase Recovery/i)).toBeDefined();
  });

  it("renders ArchieOffensive with pentest console", () => {
    render(<MemoryRouter><ArchieOffensive /></MemoryRouter>);
    expect(screen.getByText(/Offensive Security & Pentest Console/i)).toBeDefined();
  });

  it("renders ArchieVoice with sensory acoustics", () => {
    render(<MemoryRouter><ArchieVoice /></MemoryRouter>);
    expect(screen.getByText(/Conversational Voice Console/i)).toBeDefined();
  });

  it("renders ArchieEvolution with settings and memory", () => {
    render(<MemoryRouter><ArchieEvolution /></MemoryRouter>);
    expect(screen.getByText(/Self-Evolution & Cognitive Mutation/i)).toBeDefined();
  });

  it("renders ArchieKnowledge with standards repository", () => {
    render(<MemoryRouter><ArchieKnowledge /></MemoryRouter>);
    expect(screen.getByText(/Knowledge Engine & Fact Matrix/i)).toBeDefined();
  });

  it("renders ArchieLearning with mobile learning pipeline", () => {
    render(<MemoryRouter><ArchieLearning /></MemoryRouter>);
    expect(screen.getByText(/Unified Learning Engine/i)).toBeDefined();
  });

  it("renders ArchieTraining with benchmark suites", () => {
    render(<MemoryRouter><ArchieTraining /></MemoryRouter>);
    expect(screen.getByText(/Training & Benchmark Suite/i)).toBeDefined();
  });

  it("renders ArchieTerminology with professional lexicon", () => {
    render(<MemoryRouter><ArchieTerminology /></MemoryRouter>);
    expect(screen.getByText(/TerminoBook & Professional Lexicon/i)).toBeDefined();
  });

  it("renders ArchiePeople with delegation manager", () => {
    render(<MemoryRouter><ArchiePeople /></MemoryRouter>);
    expect(screen.getByText(/Trusted People & Access Manager/i)).toBeDefined();
  });

  it("renders ArchieSystem with microservices status", () => {
    render(<MemoryRouter><ArchieSystem /></MemoryRouter>);
    expect(screen.getByText(/System Telemetry & Microservices/i)).toBeDefined();
  });

  it("renders ArchieAnatomy with 23 subsystems", () => {
    render(<MemoryRouter><ArchieAnatomy /></MemoryRouter>);
    expect(screen.getByText(/Cognitive Anatomy & DNA/i)).toBeDefined();
  });

  it("renders ArchieEngines with calculation engine registry", () => {
    render(<MemoryRouter><ArchieEngines /></MemoryRouter>);
    expect(screen.getByText(/Calculation Engines & Formulas/i)).toBeDefined();
  });

  it("renders ArchieSecurity with governance controls", () => {
    render(<MemoryRouter><ArchieSecurity /></MemoryRouter>);
    expect(screen.getByText(/Security & Privacy Governance/i)).toBeDefined();
  });

  it("renders ArchieOps with cloud operations", () => {
    render(<MemoryRouter><ArchieOps /></MemoryRouter>);
    expect(screen.getByText(/Cloud Operations & Infrastructure/i)).toBeDefined();
  });

  it("renders ArchieMigration with portability package", () => {
    render(<MemoryRouter><ArchieMigration /></MemoryRouter>);
    expect(screen.getByText(/Cognitive State Migration/i)).toBeDefined();
  });
});
