import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard } from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          Welcome back, {user?.firstName ?? "Admin"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Tapee SaaS Admin Portal
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Role</div>
          <div className="text-xl font-semibold capitalize">{user?.role?.replace("_", " ")}</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Email</div>
          <div className="text-sm font-medium truncate">{user?.email ?? "—"}</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm font-medium">Active</span>
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-6">
        <h2 className="font-semibold text-foreground mb-3">Admin features</h2>
        <p className="text-sm text-muted-foreground">
          Event and user management screens will be available in the next release. 
          Use the navigation on the left to access available sections.
        </p>
      </div>
    </div>
  );
}
