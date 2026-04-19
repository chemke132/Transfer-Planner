import { useState } from 'react'
import MajorList from '../components/Requirements/MajorList.jsx'
import CalGetcSelector from '../components/Requirements/CalGetcSelector.jsx'
import CoursePath from '../components/Requirements/CoursePath.jsx'

const TABS = [
  { id: 'major', label: 'Major' },
  { id: 'calgetc', label: 'Cal-GETC' },
  { id: 'path', label: 'Course Path' },
]

export default function RequirementsPage() {
  const [tab, setTab] = useState('major')

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Requirements</h1>
      <div className="flex gap-2 border-b mb-6">
        {TABS.map((t) => (
          <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </TabButton>
        ))}
      </div>
      {tab === 'major' && <MajorList />}
      {tab === 'calgetc' && <CalGetcSelector />}
      {tab === 'path' && <CoursePath />}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  )
}
