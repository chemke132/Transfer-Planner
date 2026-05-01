export default function AutoPlanButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Auto-plan major courses"
      className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800 whitespace-nowrap"
    >
      <span className="sm:hidden">✨ Auto-plan</span>
      <span className="hidden sm:inline">Auto-plan major courses</span>
    </button>
  )
}
