// PARALLEL ROUTES. The dashboard is made of independent slots (@stats and @recent) that render side by side.
// Each slot has its own loading.js and error.js, so a slow or failing part does not hold back or break the others.
export default function DashboardLayout({ children, stats, recent }) {
  return (
    <>
      {children}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {stats}
        {recent}
      </div>
    </>
  );
}
