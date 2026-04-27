import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { useSetup } from '../hooks/useSetup.js'

// Floating "Send feedback" button in the bottom-right corner. Opens a modal
// with a message + optional contact field. Submits directly to the Supabase
// `feedback` table (RLS allows INSERT-only for anon, SELECT blocked).
export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')
  const location = useLocation()
  const { setup } = useSetup()

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function submit(e) {
    e.preventDefault()
    if (!message.trim() || status === 'sending') return
    if (!isSupabaseConfigured) {
      setStatus('error')
      setErrorMsg('Supabase not configured — try again later.')
      return
    }
    setStatus('sending')
    setErrorMsg('')
    const { error } = await supabase.from('feedback').insert({
      message: message.trim(),
      contact: contact.trim() || null,
      page: location.pathname,
      setup,
      user_agent: navigator.userAgent.slice(0, 500),
    })
    if (error) {
      setStatus('error')
      setErrorMsg(error.message || 'Failed to submit')
      return
    }
    setStatus('sent')
    setMessage('')
    setContact('')
    setTimeout(() => {
      setOpen(false)
      setStatus('idle')
    }, 1400)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg hover:bg-slate-700 transition"
        aria-label="Send feedback"
      >
        💬 Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-semibold text-lg">Send feedback</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Found a bug, wrong prereq, or just want to suggest something? Let me know.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {status === 'sent' ? (
              <div className="py-8 text-center">
                <div className="text-3xl mb-2">✅</div>
                <div className="font-medium">Thanks — got it!</div>
                <div className="text-xs text-slate-500 mt-1">
                  I'll take a look soon.
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    maxLength={5000}
                    required
                    autoFocus
                    placeholder="e.g. COMSC 165 prereq is wrong — should also need MATH 192."
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Contact <span className="text-slate-400 font-normal">(optional — email or Discord, only if you want a reply)</span>
                  </label>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    maxLength={200}
                    placeholder="you@example.com"
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                {status === 'error' && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                    {errorMsg}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-3 py-1.5 text-sm rounded-md text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!message.trim() || status === 'sending'}
                    className="px-4 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {status === 'sending' ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
