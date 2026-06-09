import { AdminPilots } from './AdminPilots';

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-display font-bold">Manage pilots</h1>
      <p className="text-text-muted text-sm">
        Admins can invite and deactivate pilots. No access to individual pilots' flight data or invoices.
      </p>
      <AdminPilots />
    </div>
  );
}
