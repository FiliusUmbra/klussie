// Plain data/logic for AddressSubForm.jsx, split out (Home foundation slice) so that file
// exports only its component — a .jsx file exporting a non-component constant alongside a
// component breaks Vite Fast Refresh (react-refresh/only-export-components), the same gap
// found and fixed the same way for HomeTodayCard.jsx/homeTodayCopy.js.
export const PROPERTY_TYPES = ["apartment", "house", "commercial", "other"];

export const EMPTY_ADDRESS = { street: "", houseNumber: "", postcode: "", municipality: "", propertyType: null, quotePrepNotes: "" };

export function isAddressComplete(address) {
  return Boolean(address.street.trim() && address.postcode.trim() && address.municipality.trim());
}
