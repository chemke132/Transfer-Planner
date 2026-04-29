import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MajorList from '../components/Requirements/MajorList.jsx'
import CalGetcSelector from '../components/Requirements/CalGetcSelector.jsx'
import CoursePath from '../components/Requirements/CoursePath.jsx'
import StepNav from '../components/StepNav.jsx'
import { useSetup } from '../hooks/useSetup.js'
import { useAppData } from '../hooks/useAppData.jsx'

const ALL_TABS = [
  { id: 'major', label: 'Major' },
  { id: 'calgetc', label: 'Cal-GETC' },
  { id: 'path', label: 'Course Path' },
]

export default function RequirementsPage() {
  const navigate = useNavigate()
  const { setup } = useSetup()
  const { TARGET_MAJORS } = useAppData()
  // Cal-GETC is hidden only when EVERY selected target opts out (e.g. all
  // CoE engineering majors). If even one target uses Cal-GETC, show the tab —
  // courses that fulfill it for that target are still useful info.
  const calGetcRequired = (setup.targets || []).some((t) => {
    const m = TARGET_MAJORS?.[t.major_id]
    return m?.requires_cal_getc !== false
  })
  const allMajorsOptOut = (setup.targets || []).every((t) => {
    const m = TARGET_MAJORS?.[t.major_id]
    return m?.requires_cal_getc === false
  })

  const tabs = calGetcRequired ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'calgetc')
  const [tab, setTab] = useState('major')
  const safeTab = tabs.some((t) => t.id === tab) ? tab : 'major'

  // Step navigation: 4 logical steps once on this page (Setup is its own
  // page). Going "back" from Major leaves the page entirely → /. Going
  // "forward" from the last visible tab proceeds to /planner.
  const tabIdx = tabs.findIndex((t) => t.id === safeTab)
  const isFirstTab = tabIdx === 0
  const isLastTab = tabIdx === tabs.length - 1

  function goPrev() {
    if (isFirstTab) navigate('/')
    else setTab(tabs[tabIdx - 1].id)
  }
  function goNext() {
    if (isLastTab) navigate('/planner')
    else setTab(tabs[tabIdx + 1].id)
  }

  const prevLabel = isFirstTab ? 'Setup' : tabs[tabIdx - 1].label
  const nextLabel = isLastTab ? 'Planner' : tabs[tabIdx + 1].label

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
      {allMajorsOptOut && (
        <div className="mb-6 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
          <div className="font-semibold text-sky-900 mb-1">
            None of your targets use Cal-GETC
          </div>
          <div className="text-xs text-sky-800/90">
            All selected majors are offered by colleges (CoE / Chemistry / Haas /
            similar) that use their own Humanities &amp; Social Sciences breadth
            pattern instead of Cal-GETC. Confirm the exact list with{' '}
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

      <StepNav
        canPrev
        canNext
        onPrev={goPrev}
        onNext={goNext}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
      />
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
