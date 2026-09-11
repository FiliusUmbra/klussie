import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const authState = { session: null, loading: false };

vi.mock("../../lib/auth.jsx", () => ({
  useAuth: () => authState,
}));

import { ProtectedRoute, PublicOnlyRoute, SessionRedirect } from "../AuthRoutes.jsx";

function LocationProbe() {
  const location = useLocation();
  return <div>{location.pathname}</div>;
}

beforeEach(() => {
  authState.session = null;
  authState.loading = false;
});

describe("authentication route boundaries", () => {
  it("redirects a signed-out visitor away from a protected route", () => {
    render(
      <MemoryRouter initialEntries={["/app/private"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/app/*" element={<div>private</div>} />
          </Route>
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("/")).toBeTruthy();
    expect(screen.queryByText("private")).toBeNull();
  });

  it("renders protected content for a signed-in user", () => {
    authState.session = { user: { id: "user-1" } };

    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<div>private</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("private")).toBeTruthy();
  });

  it("keeps a signed-in user out of the public sign-in route", () => {
    authState.session = { user: { id: "user-1" } };

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/" element={<div>sign in</div>} />
          </Route>
          <Route path="/app" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("/app")).toBeTruthy();
    expect(screen.queryByText("sign in")).toBeNull();
  });

  it("resolves unknown routes according to the current session", () => {
    render(
      <MemoryRouter initialEntries={["/does-not-exist"]}>
        <Routes>
          <Route path="/does-not-exist" element={<SessionRedirect />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("/")).toBeTruthy();
  });

  it("does not redirect while Supabase is restoring the session", () => {
    authState.loading = true;

    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route element={<ProtectedRoute loadingFallback={<div>restoring</div>} />}>
            <Route path="/app" element={<div>private</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("restoring")).toBeTruthy();
  });
});
