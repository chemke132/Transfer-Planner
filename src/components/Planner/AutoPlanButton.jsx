export default function AutoPlanButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800"
    >
      Auto-plan major courses
    </button>
  )
}
