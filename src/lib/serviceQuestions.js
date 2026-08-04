// Structured job-detail questions per service, keyed by the fixed seed UUIDs from
// supabase/migrations/0001_init.sql — lets customers describe a job (rooms, m², etc.)
// with quick taps instead of writing it all out in a freeform textarea.
//
// Shared between the frontend (src/App.jsx, manual QuoteFormSheet) and the AI intake
// serverless function (api/ai-intake.js) so both produce the exact same `details_json`
// shape — JobDetailsSummary renders identically no matter which path filled it in.
//
// Services not listed here (the 4 specialist/consultative ones) keep freeform-only,
// since there's no universal quantifiable field for them.
export const SERVICE_QUESTIONS = {
  "00000000-0000-0000-0000-000000000001": [ // Schilderwerken
    { key: "rooms", type: "number", label: "fieldRooms", placeholder: "3" },
    { key: "sqm", type: "number", label: "fieldSqm", placeholder: "20" },
    { key: "ceilingIncluded", type: "boolean", label: "fieldCeilingIncluded" },
    { key: "trimIncluded", type: "boolean", label: "fieldTrimIncluded" },
  ],
  "00000000-0000-0000-0000-000000000002": [ // Verhuisservice
    { key: "rooms", type: "number", label: "fieldRooms", placeholder: "3" },
    { key: "floorNumber", type: "number", label: "fieldFloorNumber", placeholder: "2" },
    { key: "elevatorAccess", type: "boolean", label: "fieldElevatorAccess" },
    { key: "distanceKm", type: "number", label: "fieldDistanceKm", placeholder: "15" },
  ],
  "00000000-0000-0000-0000-000000000003": [ // Woningreiniging
    { key: "sqm", type: "number", label: "fieldSqm", placeholder: "80" },
    { key: "bedrooms", type: "number", label: "fieldBedrooms", placeholder: "2" },
    { key: "recurring", type: "boolean", label: "fieldRecurring" },
  ],
  "00000000-0000-0000-0000-000000000004": [ // Ontruimingsschoonmaak
    { key: "sqm", type: "number", label: "fieldSqm", placeholder: "80" },
    { key: "bedrooms", type: "number", label: "fieldBedrooms", placeholder: "2" },
  ],
  "00000000-0000-0000-0000-000000000005": [ // Keukenkasten op maat
    { key: "kitchenLength", type: "number", label: "fieldKitchenLength", placeholder: "4" },
    { key: "materialPref", type: "select", label: "fieldMaterialPref", options: [
      { value: "laminate", label: "optLaminate" }, { value: "wood", label: "optWood" }, { value: "lacquer", label: "optLacquer" },
    ] },
  ],
  "00000000-0000-0000-0000-000000000006": [ // Tegelwerken
    { key: "sqm", type: "number", label: "fieldSqm", placeholder: "15" },
    { key: "roomType", type: "select", label: "fieldRoomType", options: [
      { value: "bathroom", label: "optBathroom" }, { value: "kitchen", label: "optKitchen" }, { value: "terrace", label: "optTerrace" }, { value: "other", label: "optOther" },
    ] },
    { key: "removalNeeded", type: "boolean", label: "fieldRemovalNeeded" },
  ],
  "00000000-0000-0000-0000-000000000007": [ // Meubeltransport
    { key: "itemsCount", type: "number", label: "fieldItemsCount", placeholder: "1" },
    { key: "elevatorAccess", type: "boolean", label: "fieldElevatorAccess" },
  ],
  "00000000-0000-0000-0000-000000000008": [ // Engelse bijles
    { key: "sessionsPerWeek", type: "number", label: "fieldSessionsPerWeek", placeholder: "1" },
    { key: "level", type: "select", label: "fieldLevel", options: [
      { value: "beginner", label: "optBeginner" }, { value: "intermediate", label: "optIntermediate" }, { value: "advanced", label: "optAdvanced" },
    ] },
  ],
  "00000000-0000-0000-0000-000000000009": [ // Elektriciteitswerken
    { key: "outletsCount", type: "number", label: "fieldOutletsCount", placeholder: "4" },
    { key: "fullRewiring", type: "boolean", label: "fieldFullRewiring" },
  ],
  "00000000-0000-0000-0000-000000000010": [ // Zetel- en tapijtreiniging
    { key: "itemsCount", type: "number", label: "fieldItemsCount", placeholder: "1" },
  ],
  "00000000-0000-0000-0000-000000000011": [ // Loodgieterswerken
    { key: "jobType", type: "select", label: "fieldJobType", options: [
      { value: "leak", label: "optLeak" }, { value: "clog", label: "optClog" }, { value: "installation", label: "optInstallation" }, { value: "other", label: "optOther" },
    ] },
  ],
};
