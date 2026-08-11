// "Mijn spullen" — household products, appliances and possessions, in their honest
// first state.
//
// Naming note, since the brief called it out: "spullen" / "items", never "apparel" —
// apparel means clothing, which is not what this holds.
//
// Every quick action here describes a capability Klussie does not have yet. Scanning a
// product, reading a receipt, and verifying a guarantee are all real AI work that
// nothing in this repository does today (the AI Gateway's capabilities are intake,
// vision, OCR, translation and reasoning — none of them wired to a product database),
// so all four are marked unavailable rather than shown as if they worked. Claiming
// automatic receipt recognition would be precisely the unearned capability
// EXPERIENCE_VISION.md §8 and Constitution Rule 9 forbid.
import { ScanLine, ReceiptText, ShieldCheck, BookOpen, AlertTriangle } from "lucide-react";
import { QuickActions, HomeSection, NotBuiltYetNote } from "./panelParts.jsx";

const GROUPS = [
  { id: "appliances", titleKey: "myItemsAppliances" },
  { id: "electronics", titleKey: "myItemsElectronics" },
  { id: "furniture", titleKey: "myItemsFurniture" },
  { id: "garden", titleKey: "myItemsGarden" },
  { id: "recent", titleKey: "myItemsRecent" },
];

export function MyItemsPanel({ t, inventory, onReportProblem }) {
  const actions = [
    { id: "scan", labelKey: "myItemsScan", icon: ScanLine, available: false },
    { id: "receipt", labelKey: "myItemsReceipt", icon: ReceiptText, available: false },
    { id: "warranty", labelKey: "myItemsWarranty", icon: ShieldCheck, available: false },
    { id: "manual", labelKey: "myItemsManual", icon: BookOpen, available: false },
    { id: "problem", labelKey: "homeReportProblem", icon: AlertTriangle, available: true, onClick: onReportProblem },
  ];

  return (
    <div className="home-panel">
      <h2 className="home-panel-question">{t.myItemsQuestion}</h2>
      <QuickActions t={t} actions={actions} label={t.myItemsQuestion} />
      <NotBuiltYetNote t={t} />

      {GROUPS.map((group) => (
        <HomeSection
          key={group.id}
          title={t[group.titleKey]}
          emptyText={t.homeNothingSavedYet}
          isEmpty={!inventory?.[group.id]?.length}
        />
      ))}
    </div>
  );
}
