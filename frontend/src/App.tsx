import type { ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/Layout";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { CreateTicketPage } from "./pages/CreateTicketPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";

function ProtectedRoute({ children }: { children: ReactElement }): ReactElement {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <AppShell>{children}</AppShell>;
}

function PublicOnlyRoute({ children }: { children: ReactElement }): ReactElement {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <RoleHome /> : children;
}

function RoleHome(): ReactElement {
  const { user } = useAuth();
  return <Navigate to={user?.role === "AGENT" ? "/dashboard" : "/tickets"} replace />;
}

function AgentOnlyRoute({ children }: { children: ReactElement }): ReactElement {
  const { user } = useAuth();
  return user?.role === "AGENT" ? children : <Navigate to="/tickets" replace />;
}

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<RoleHome />} />
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><AgentOnlyRoute><DashboardPage /></AgentOnlyRoute></ProtectedRoute>} />
      <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
      <Route path="/tickets/new" element={<ProtectedRoute><CreateTicketPage /></ProtectedRoute>} />
      <Route path="/tickets/:id" element={<ProtectedRoute><TicketDetailPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
