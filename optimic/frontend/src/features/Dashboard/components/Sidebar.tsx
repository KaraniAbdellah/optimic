import { useState, useContext } from "react";
import SidebarBrand from "./sidebar/SidebarBrand";
import SidebarNav from "./sidebar/SidebarNav";
import DatasetsPanel from "./sidebar/DatasetsPanel";
import { LogOut, AlertTriangle } from "lucide-react";
import logout from "../services/logout";
import { clearAllDatasetsFromIndexDb } from "../services/datasetDb";
import UserDataContext from "@/global/context/UserDataContext";

interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
}

export default function Sidebar({ activeId, onSelect }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userContext = useContext(UserDataContext);

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);

    try {
      const uid = userContext?.user_data?.uid;
      if (uid) {
        await clearAllDatasetsFromIndexDb(uid);
      }
    } catch (err) {
      console.error("Failed to clear IndexedDB:", err);
    }

    const success = await logout();

    if (success) {
      window.location.href = "/auth";
    } else {
      setIsLoggingOut(false);
      alert("Logout failed. Please try again.");
    }
  };
  return (
    <>
      <aside
        className={`h-screen bg-white border-r border-slate-200 flex flex-col p-2.5 select-none flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? "w-[72px]" : "w-[270px]"
        }`}
      >
        <SidebarBrand
          isCollapsed={isCollapsed}
          onToggle={() => setIsCollapsed((prev) => !prev)}
        />
        <SidebarNav
          activeId={activeId}
          onSelect={onSelect}
          isCollapsed={isCollapsed}
        />
        <div className="my-4 border-t border-slate-200/80" />
        <div className="flex-1 min-h-0 overflow-hidden">
          <DatasetsPanel isCollapsed={isCollapsed} />
        </div>

        {/* Trigger Button */}
        <button
          className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm font-medium text-red-600 shadow-sm transition-all duration-200 hover:border-red-300 hover:bg-red-100 hover:shadow-md active:scale-[0.98] ${
            isCollapsed ? "justify-center px-0" : ""
          }`}
          onClick={() => setShowLogoutModal(true)}
          title="Logout"
        >
          <LogOut
            size={18}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 transform transition-all">
            {/* Modal Icon & Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">
                  Confirm Sign Out
                </h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to end your session?
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-600 mb-6">
              You will be redirected to the sign-in page and will need to log
              back in to access your workspaces.
            </p>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutModal(false)}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleConfirmLogout}
                className="cursor-pointer rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isLoggingOut ? "Signing out..." : "Yes, Sign Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
