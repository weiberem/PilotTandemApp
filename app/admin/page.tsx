import { AdminPilots } from './AdminPilots';

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-display font-bold">Piloten verwalten</h1>
      <p className="text-text-muted text-sm">
        Admins können Piloten einladen und deaktivieren. Es besteht kein Zugriff auf Flugdaten oder Rechnungen einzelner Piloten.
      </p>
      <AdminPilots />
    </div>
  );
}
