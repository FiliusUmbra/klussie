// Home foundation slice — the property equivalent of WorkspaceSwitcher.jsx, and
// deliberately built the same way: renders nothing below two properties ("invisible for
// the single-property case... no switcher, no label, no explanation", WorkspaceSwitcher's
// own words for the identical single-workspace case), no preceding label, real names only.
//
// Where "another property" comes from: Profile's own "Add property" (Profile.jsx),
// reusing the exact createPropertyForCaller()/setPropertyAddress() write path My Business
// already established for a professional's own first property. My Home has no creation
// entry point of its own on purpose — Profile is where every other "add a thing to my
// account" action already lives (become a pro, join a business).
export function PropertySwitcher({ properties, activePropertyId, onSelect }) {
  if (!properties || properties.length < 2) return null;

  return (
    <div className="role-switch">
      <div className="segmented">
        {properties.map((p) => (
          <button
            key={p.id}
            type="button"
            className={activePropertyId === p.id ? "seg-on" : ""}
            onClick={() => onSelect(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
