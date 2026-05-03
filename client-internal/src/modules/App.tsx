import { Navigate, Route, Routes } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import CmsLayout from "./layouts/CmsLayout";
import LoginPage from "../pages/auth/LoginPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import UsersPage from "../pages/settings/users/UsersPage";
import RolesPage from "../pages/settings/roles/RolesPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<PrivateRoute />}>
        <Route element={<CmsLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings/users" element={<UsersPage />} />
          <Route path="/settings/roles" element={<RolesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
