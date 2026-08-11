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

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
