// The application root.
//
// Everything this file used to hold now lives behind a feature boundary: the chrome and
// routing in src/shell, the two experiences in src/customer and src/pro, the surfaces
// they share in src/auth, src/profile, src/messaging, src/requests and src/ui, the copy
// in src/lib/appStrings.js, and every rule they follow in src/lib.
//
// What remains is the one thing genuinely global — authentication has to wrap the shell,
// because the shell's first decision is which surface an unauthenticated visitor sees.
import { AuthProvider } from "./lib/auth.jsx";
import { AppShell } from "./shell/AppShell.jsx";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ProtectedRoute, PublicOnlyRoute, SessionRedirect } from "./auth/AuthRoutes.jsx";
import { customerDestination, customerPath } from "./lib/customerNavigation.js";
import { proTabFromPath, proPath, isFamilyPath, familySectionFromPath, familyPath } from "./lib/proNavigation.js";

// 2026-09-30 — "Customer navigation continuity," brought in from the parallel "Klussie
// via ChatGPT" pass: dedicated addresses for Today/Help/My Home (+Items)/Requests/
// Messages/Account and a persistent /app/family route, so a reload or the browser's own
// Back button lands where a customer actually was, not always back on Today.
// customerNavigation.js owns the one true mapping between a tab (+ My Home's own
// section) and its path; this component's only job is turning that into the real
// location object react-router already gives every route.
function SignedInShell() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <AppShell
      familyRoute={isFamilyPath(location.pathname)}
      familySection={familySectionFromPath(location.pathname)}
      onFamilySectionChange={(section) => { const path = familyPath(section); if (path !== location.pathname) navigate(path); }}
      proTab={proTabFromPath(location.pathname)}
      onProNavigate={(tab) => { const path = proPath(tab); if (path !== location.pathname) navigate(path); }}
      customerDestination={customerDestination(location.pathname)}
      onCustomerNavigate={(tab, section) => {
        const path = customerPath(tab, section);
        if (path !== location.pathname) navigate(path);
      }}
      onOpenFamily={() => navigate("/app/family")}
      onLeaveFamily={() => navigate("/app")}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicOnlyRoute loadingFallback={<AppShell />} />}>
            <Route path="/" element={<AppShell />} />
          </Route>
          <Route element={<ProtectedRoute loadingFallback={<AppShell />} />}>
            <Route path="/app/*" element={<SignedInShell />} />
          </Route>
          <Route path="*" element={<SessionRedirect loadingFallback={<AppShell />} />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
