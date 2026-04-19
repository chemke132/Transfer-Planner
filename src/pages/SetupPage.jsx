import { useNavigate } from 'react-router-dom'
import { useSetup } from '../hooks/useSetup.js'
import { useAppData } from '../hooks/useAppData.jsx'

export default function SetupPage() {
  const navigate = useNavigate()
  const { setup, setSetup } = useSetup()
  const { schoolsByType, targetMajorsForSchool } = useAppData()

  const ccs = schoolsByType('CC')
  const targets = [...schoolsByType('UC'), ...schoolsByType('CSU')]
  const majors = targetMajorsForSchool(setup.target_school_id)

  function handleTargetChange(targetId) {
    const firstMajor = targetMajorsForSchool(targetId)[0]
    setSetup({ target_school_id: targetId, target_major_id: firstMajor?.id })
  }

  function handleSubmit(e) {
    e.preventDefault()
    navigate('/requirements')
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">Setup</h1>
      <form onSubmit={handleSubmit} className="space-y-5 bg-white p-6 rounded-lg border">
        <Field label="Current community college">
          <select
            value={setup.cc_id}
            onChange={(e) => setSetup({ cc_id: e.target.value })}
            className="input"
          >
            {ccs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Target transfer school">
          <select
            value={setup.target_school_id}
            onChange={(e) => handleTargetChange(e.target.value)}
            className="input"
          >
            {targets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Major">
          <select
            value={setup.target_major_id}
            onChange={(e) => setSetup({ target_major_id: e.target.value })}
            className="input"
          >
            {majors.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          className="w-full bg-slate-900 text-white rounded-md py-2 font-medium hover:bg-slate-800"
        >
          Continue
        </button>
      </form>
      <style>{`.input{width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;background:white}`}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  )
}
