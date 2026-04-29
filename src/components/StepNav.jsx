import { useEffect } from 'react'

// Floating left/right "previous / next step" buttons. The 4-step flow is:
//   1. Setup            (/)
//   2. Requirements → Major     (/requirements?tab=major)
//   3. Requirements → Cal-GETC  (/requirements?tab=calgetc)
//   4. Requirements → Course Path (/requirements?tab=path)
//   5. Planner          (/planner)
//
// Setup has its own "Continue" button, so we hide the prev arrow on step 1.
// At step 5 we hide the next arrow. ArrowLeft / ArrowRight keys also
// trigger the steps for keyboard users.
export default function StepNav({ canPrev, canNext, onPrev, onNext, prevLabel, nextLabel }) {
  useEffect(() => {
    function onKey(e) {
      // Don't fire when typing in an input / textarea / contenteditable.
      const target = e.target
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowLeft' && canPrev) onPrev()
      if (e.key === 'ArrowRight' && canNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canPrev, canNext, onPrev, onNext])

  return (
    <>
      {canPrev && (
        <button
          onClick={onPrev}
          aria-label={prevLabel ? `Previous: ${prevLabel}` : 'Previous step'}
          title={prevLabel ? `← ${prevLabel}` : 'Previous step'}
          className="hidden md:flex fixed left-3 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-11 h-11 rounded-full bg-white border shadow-lg text-slate-700 hover:bg-slate-50 hover:text-slate-900"
        >
          <span aria-hidden className="text-xl leading-none">‹</span>
        </button>
      )}
      {canNext && (
        <button
          onClick={onNext}
          aria-label={nextLabel ? `Next: ${nextLabel}` : 'Next step'}
          title={nextLabel ? `${nextLabel} →` : 'Next step'}
          className="hidden md:flex fixed right-3 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-11 h-11 rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800"
        >
          <span aria-hidden className="text-xl leading-none">›</span>
        </button>
      )}
    </>
  )
}
