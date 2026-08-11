// "Mijn woning" — the Property Memory surface, in its honest first state.
//
// Two of the six groups are real today and four are not, which is exactly what
// HOME_OPERATING_SYSTEM.md §2 says: history and people already exist as completed
// requests and reviews, while rooms, installations and documents are "genuinely new
// schema and UI work with no shortcuts." So Previous work renders real rows, the rest
// render an empty state, and nothing here fabricates a saved home.
//
// Data comes in as props from src/home/useHomeContext.js — no fetching in the view.
import { DoorOpen, Wrench, FileUp, CalendarPlus, AlertTriangle } from "lucide-react";
import { QuickActions, HomeSection, NotBuiltYetNote } from "./panelParts.jsx";

export function MyHomePanel({ t, homeProfile, previousWork, serviceInfo, fmtDate, onReportProblem, onOpenRequest }) {
  const actions = [
    { id: "room", labelKey: "myHomeAddRoom", icon: DoorOpen, available: false },
    { id: "installation", labelKey: "myHomeAddInstallation", icon: Wrench, available: false },
    { id: "document", labelKey: "myHomeUploadDoc", icon: FileUp, available: false },
    { id: "maintenance", labelKey: "myHomeLogMaintenance", icon: CalendarPlus, available: false },
    // The one action that is genuinely wired: it hands straight back to the
    // conversation, which is the part of this product that actually works today.
    { id: "problem", labelKey: "homeReportProblem", icon: AlertTriangle, available: true, onClick: onReportProblem },
  ];

  return (
    <div className="home-panel">
      <h2 className="home-panel-question">{t.myHomeQuestion}</h2>
      <QuickActions t={t} actions={actions} label={t.myHomeQuestion} />
      <NotBuiltYetNote t={t} />

      <HomeSection title={t.myHomeSummaryTitle} emptyText={t.homeNothingSavedYet} isEmpty={!homeProfile?.summary} />
      <HomeSection title={t.myHomeRoomsTitle} emptyText={t.homeNothingSavedYet} isEmpty={!homeProfile?.rooms?.length} />
      <HomeSection title={t.myHomeInstallationsTitle} emptyText={t.homeNothingSavedYet} isEmpty={!homeProfile?.installations?.length} />
      <HomeSection title={t.myHomeMaintenanceTitle} emptyText={t.homeNothingSavedYet} isEmpty={!homeProfile?.upcomingMaintenance?.length} />
      <HomeSection title={t.myHomeDocumentsTitle} emptyText={t.homeNothingSavedYet} isEmpty={!homeProfile?.documents?.length} />

      <HomeSection
        title={t.myHomeHistoryTitle}
        emptyText={t.myHomeHistoryEmpty}
        isEmpty={!previousWork?.length}
      >
        <ul className="home-history">
          {previousWork?.map((request) => (
            <li key={request.id}>
              <button type="button" className="home-history-row" onClick={() => onOpenRequest(request.id)}>
                <span className="home-history-name">{serviceInfo(request.serviceId).name}</span>
                <span className="home-history-date">{fmtDate(request.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </HomeSection>
    </div>
  );
}
