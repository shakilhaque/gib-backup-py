import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import DeviceManagement from "./pages/DeviceManagement";
import BackupPage from "./pages/BackupPage";

export default function App() {
  return (
    <div className="layout">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/"        element={<Dashboard />} />
          <Route path="/devices" element={<DeviceManagement />} />
          <Route path="/backup"  element={<BackupPage />} />
        </Routes>
      </main>
    </div>
  );
}
