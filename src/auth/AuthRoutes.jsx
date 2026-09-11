import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";

// URL-level auth boundaries. Database access is still enforced by Supabase RLS; these
// guards prevent signed-out visitors from rendering authenticated application surfaces
// and preserve the requested location for a future multi-route signed-in experience.
export function ProtectedRoute({ loadingFallback = null }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return loadingFallback;
  if (!session) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute({ loadingFallback = null }) {
  const { session, loading } = useAuth();

  if (loading) return loadingFallback;
  if (session) return <Navigate to="/app" replace />;

  return <Outlet />;
}

export function SessionRedirect({ loadingFallback = null }) {
  const { session, loading } = useAuth();

  if (loading) return loadingFallback;
  return <Navigate to={session ? "/app" : "/"} replace />;
}
