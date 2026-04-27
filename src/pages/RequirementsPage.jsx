import { useState } from 'react'
import MajorList from '../components/Requirements/MajorList.jsx'
import CalGetcSelector from '../components/Requirements/CalGetcSelector.jsx'
import CoursePath from '../components/Requirements/CoursePath.jsx'
import { useSetup } from '../hooks/useSetup.js'
import { useAppData } from '../hooks/useAppData.jsx'

const ALL_TABS = [
  { id: 'major', label: 'Major' },
  { id: 'calgetc', label: 'Cal-GETC' },
  { id: 'path', label: 'Course Path' },
]

export default function RequirementsPage() {
  const { setup } = useSetup()
  const { TARGET_MAJORS } = useAppData()
  const major = TARGET_MAJORS?.[setup.target_major_id]
  // requires_cal_getc defaults to true; only false when explicitly flagged
  // (engineering / chemistry / Haas-style colleges).
  const calGetcRequired = major?.requires_cal_getc !== false

  const tabs = calGetcRequired ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'calgetc')
  const [tab, setTab] = useState('major')
  // If user had calgetc selected and switches to a major that doesn't need it,
  // fall back to major tab.
  const safeTab = tabs.some((t) => t.id === tab) ? tab : 'major'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Requirements</h1>
      <div className="flex gap-2 border-b mb-6">
        {tabs.map((t) => (
          <TabButton key={t.id} active={safeTab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </TabButton>
        ))}
      </div>
      {!calGetcRequired && (
        <div className="mb-6 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
          <div className="font-semibold text-sky-900 mb-1">
            This major doesn't use Cal-GETC
          </div>
          <div className="text-xs text-sky-800/90">
            {major?.name} is offered by a college (CoE / Chemistry / Haas / similar) that
            uses its own Humanities &amp; Social Sciences breadth pattern instead of
            Cal-GETC. Confirm the exact list with{' '}
            <a
              href="https://assist.org"
              target="_blank"
              rel="noreferrer"
              className="underline hover:no-underline"
            >
              assist.org
            </a>{' '}
            and your transfer counselor.
          </div>
        </div>
      )}
      {safeTab === 'major' && <MajorList />}
      {safeTab === 'calgetc' && calGetcRequired && <CalGetcSelector />}
      {safeTab === 'path' && <CoursePath />}
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
