import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const STATUS_LABELS = {
  assigned:           'Assigned',
  spare:              'Spare',
  broken_with_sport:  'Broken (With Sport)',
  broken_with_dept:   'Broken (With Dept)',
  at_playerdata:      'At PlayerData',
  lost:               'Lost',
}

const STATUS_COLORS = {
  assigned:           'bg-green-100 text-green-700',
  spare:              'bg-blue-100 text-blue-700',
  broken_with_sport:  'bg-yellow-100 text-yellow-700',
  broken_with_dept:   'bg-orange-100 text-orange-700',
  at_playerdata:      'bg-gray-100 text-gray-600',
  lost:               'bg-red-100 text-red-700',
}

const EVENT_LABELS = {
  unit_entered_inventory:   '📦 Entered inventory',
  marked_in_use:            '✅ Marked in use',
  marked_spare:             '↩️ Marked spare',
  transferred_to_sport:     '🔀 Transferred to sport',
  transferred_to_dept:      '🏢 Transferred to dept',
  marked_broken:            '🔧 Marked broken',
  returned_to_vendor:       '📤 Returned to PlayerData',
  replacement_requested:    '🔄 Replacement requested',
  replacement_received:     '📥 Replacement received',
  marked_lost:              '❓ Marked lost',
  marked_retired:           '🗃️ Retired',
  spare_assigned:           '🔁 Spare assigned',
  unit_type_changed:        '⚙️ Unit type changed',
  csv_import:               '📋 CSV import',
  status_corrected:         '✏️ Status corrected',
  note_added:               '📝 Note added',
}

// Mirrors the check_status_transition() trigger from migration 06.
// Kept in sync manually — if the trigger changes, update this too.
const VALID_TRANSITIONS = {
  spare:              ['assigned', 'broken_with_sport', 'broken_with_dept'],
  assigned:           ['broken_with_sport', 'broken_with_dept', 'lost', 'spare'],
  broken_with_sport:  ['broken_with_dept', 'at_playerdata'],
  broken_with_dept:   ['at_playerdata'],
  at_playerdata:      [],
  lost:               [],
}

export default function UnitDetail() {
  const { unitId } = useParams()
  const navigate = useNavigate()
  const [unit, setUnit] = useState(null)
  const [sport, setSport] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  // Action modals
  const [showBroken,      setShowBroken]      = useState(false)
  const [showLost,        setShowLost]        = useState(false)
  const [showMarkSpare,   setShowMarkSpare]   = useState(false)
  const [showMarkInUse,   setShowMarkInUse]   = useState(false)
  const [showTransferDept,setShowTransferDept]= useState(false)
  const [showReturnPD,    setShowReturnPD]    = useState(false)
  const [showConvert,     setShowConvert]     = useState(false)
  const [actionNotes,     setActionNotes]     = useState('')
  const [firmware,        setFirmware]        = useState('')
  const [saving,          setSaving]          = useState(false)

  useEffect(() => {
    fetchData()
  }, [unitId])

  async function fetchData() {
    setLoading(true)

    const { data: unitData } = await supabase
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single()

    if (unitData) {
      setUnit(unitData)

      const { data: sportData } = await supabase
        .from('sports')
        .select('*')
        .eq('id', unitData.sport_id)
        .single()
      setSport(sportData)

      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .eq('unit_id', unitId)
        .order('created_at', { ascending: false })
      setEvents(eventsData || [])
    }

    setLoading(false)
  }

  function canTransitionTo(newStatus) {
    return unit ? (VALID_TRANSITIONS[unit.status] || []).includes(newStatus) : false
  }

  async function logEvent(type, extra = {}) {
    await supabase.from('events').insert({
      unit_id:     unitId,
      event_type:  type,
      actor_sport: sport?.name || 'Unknown',
      from_status: unit.status,
      notes:       actionNotes,
      ...extra,
    })
  }

  async function applyStatus(newStatus, eventType, modalCloser) {
    setSaving(true)
    const { error } = await supabase.from('units').update({ status: newStatus }).eq('id', unitId)
    if (!error) {
      await logEvent(eventType, { to_status: newStatus })
    }
    setSaving(false)
    modalCloser(false)
    setActionNotes('')
    fetchData()
  }

  const handleMarkBroken   = () => applyStatus('broken_with_sport', 'marked_broken', setShowBroken)
  const handleMarkLost     = () => applyStatus('lost', 'marked_lost', setShowLost)
  const handleMarkSpare    = () => applyStatus('spare', 'marked_spare', setShowMarkSpare)
  const handleMarkInUse    = () => applyStatus('assigned', 'marked_in_use', setShowMarkInUse)
  const handleTransferDept = () => applyStatus('broken_with_dept', 'transferred_to_dept', setShowTransferDept)
  const handleReturnToPD   = () => applyStatus('at_playerdata', 'returned_to_vendor', setShowReturnPD)

  async function handleConvertType() {
    setSaving(true)
    const newType = unit.unit_type === 'GPS' ? 'IMU' : 'GPS'
    await supabase.from('units')
      .update({ unit_type: newType, firmware_version: firmware || null })
      .eq('id', unitId)
    await logEvent('unit_type_changed', {
      notes: `Converted from ${unit.unit_type} to ${newType}. Firmware: ${firmware || 'not specified'}. ${actionNotes}`,
    })
    setSaving(false)
    setShowConvert(false)
    setActionNotes('')
    setFirmware('')
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading...
      </div>
    )
  }

  if (!unit) {
    return <div className="text-center py-16 text-gray-400">Unit not found.</div>
  }

  const isTerminal = unit.status === 'at_playerdata' || unit.status === 'lost'

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Back */}
      <button
        onClick={() => navigate(sport ? `/sport/${sport.id}` : '/')}
        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
      >
        ← Back to {sport?.name || 'Dashboard'}
      </button>

      {/* Unit header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{unit.serial_number}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[unit.status]}`}>
                {STATUS_LABELS[unit.status]}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                unit.unit_type === 'IMU' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {unit.unit_type}
              </span>
              {unit.firmware_version && (
                <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                  fw: {unit.firmware_version}
                </span>
              )}
              <span className="text-sm text-gray-400">{sport?.name}</span>
            </div>
          </div>

          {/* Action buttons — gated by the actual DB trigger's allowed transitions */}
          <div className="flex flex-wrap gap-2">
            {canTransitionTo('spare') && (
              <button onClick={() => setShowMarkSpare(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Mark Spare
              </button>
            )}
            {canTransitionTo('assigned') && (
              <button onClick={() => setShowMarkInUse(true)}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Mark In Use
              </button>
            )}
            {canTransitionTo('broken_with_sport') && (
              <button onClick={() => setShowBroken(true)}
                className="px-3 py-1.5 text-sm border border-yellow-300 text-yellow-700 rounded-lg hover:bg-yellow-50">
                Mark Broken
              </button>
            )}
            {canTransitionTo('broken_with_dept') && unit.status === 'broken_with_sport' && (
              <button onClick={() => setShowTransferDept(true)}
                className="px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50">
                Transfer to Dept
              </button>
            )}
            {canTransitionTo('at_playerdata') && (
              <button onClick={() => setShowReturnPD(true)}
                className="px-3 py-1.5 text-sm border border-gray-400 text-gray-700 rounded-lg hover:bg-gray-50">
                Send to PlayerData
              </button>
            )}
            {canTransitionTo('lost') && (
              <button onClick={() => setShowLost(true)}
                className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
                Mark Lost
              </button>
            )}
            <button onClick={() => setShowConvert(true)}
              className="px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50">
              Convert {unit.unit_type === 'GPS' ? 'to IMU' : 'to GPS'}
            </button>
          </div>
        </div>

        {isTerminal && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-500">
            This unit is in a terminal status ({STATUS_LABELS[unit.status]}) — no further status changes are possible except a manual correction.
          </div>
        )}

        {/* Unit meta */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-gray-400 text-xs">Acquired</div>
            <div className="text-gray-700">{unit.acquired_date ? new Date(unit.acquired_date).toLocaleDateString() : '—'}</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Source</div>
            <div className="text-gray-700 capitalize">{unit.acquired_source?.replace(/_/g, ' ') || '—'}</div>
          </div>
          {unit.notes && (
            <div>
              <div className="text-gray-400 text-xs">Notes</div>
              <div className="text-gray-700">{unit.notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* Event log */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Unit History</h2>
        {events.length === 0 ? (
          <p className="text-gray-400 text-sm">No events recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map(event => (
              <div key={event.id} className="flex gap-3 text-sm">
                <div className="text-gray-400 text-xs w-32 flex-shrink-0 pt-0.5">
                  {new Date(event.created_at).toLocaleDateString()}<br />
                  <span className="text-gray-300">{new Date(event.created_at).toLocaleTimeString()}</span>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800">
                    {EVENT_LABELS[event.event_type] || event.event_type}
                  </div>
                  {event.from_status && event.to_status && (
                    <div className="text-gray-400 text-xs">
                      {STATUS_LABELS[event.from_status] || event.from_status} → {STATUS_LABELS[event.to_status] || event.to_status}
                    </div>
                  )}
                  {event.notes && (
                    <div className="text-gray-400 text-xs mt-0.5 italic">{event.notes}</div>
                  )}
                  {event.actor_sport && (
                    <div className="text-gray-300 text-xs">{event.actor_sport}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {showBroken && (
        <Modal title="Mark Unit as Broken" onClose={() => { setShowBroken(false); setActionNotes('') }}>
          <p className="text-sm text-gray-600 mb-3">
            This will mark the unit as broken and with your sport. From there it can be
            transferred to the dept or sent directly to PlayerData.
          </p>
          <textarea
            placeholder="Describe the damage (optional)..."
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowBroken(false); setActionNotes('') }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleMarkBroken} disabled={saving}
              className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm — Mark Broken'}
            </button>
          </div>
        </Modal>
      )}

      {showLost && (
        <Modal title="Mark Unit as Lost" onClose={() => { setShowLost(false); setActionNotes('') }}>
          <p className="text-sm text-gray-600 mb-3">
            This will flag the unit as lost. Lost is a terminal status — it will remain
            in the system and appear in the exceptions report, but cannot be changed further
            without a manual status correction.
          </p>
          <textarea
            placeholder="Add context — when was it last seen? (optional)"
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowLost(false); setActionNotes('') }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleMarkLost} disabled={saving}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm — Mark Lost'}
            </button>
          </div>
        </Modal>
      )}

      {showMarkSpare && (
        <Modal title="Mark Spare" onClose={() => { setShowMarkSpare(false); setActionNotes('') }}>
          <p className="text-sm text-gray-600 mb-3">
            This will move the unit into the sport's spare pool.
          </p>
          <textarea
            placeholder="Reason (optional)..."
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowMarkSpare(false); setActionNotes('') }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleMarkSpare} disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm — Mark Spare'}
            </button>
          </div>
        </Modal>
      )}

      {showMarkInUse && (
        <Modal title="Mark In Use" onClose={() => { setShowMarkInUse(false); setActionNotes('') }}>
          <p className="text-sm text-gray-600 mb-3">
            This will move the unit from the spare pool into active use for {sport?.name}.
          </p>
          <textarea
            placeholder="Notes (optional)..."
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowMarkInUse(false); setActionNotes('') }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleMarkInUse} disabled={saving}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm — Mark In Use'}
            </button>
          </div>
        </Modal>
      )}

      {showTransferDept && (
        <Modal title="Transfer Broken Unit to Dept" onClose={() => { setShowTransferDept(false); setActionNotes('') }}>
          <p className="text-sm text-gray-600 mb-3">
            This confirms the dept lead has physically collected this broken unit from the sport.
          </p>
          <textarea
            placeholder="Notes (optional)..."
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowTransferDept(false); setActionNotes('') }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleTransferDept} disabled={saving}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm — Transfer to Dept'}
            </button>
          </div>
        </Modal>
      )}

      {showReturnPD && (
        <Modal title="Send to PlayerData" onClose={() => { setShowReturnPD(false); setActionNotes('') }}>
          <p className="text-sm text-gray-600 mb-3">
            This confirms the unit has shipped back to PlayerData. This is a terminal
            status — no further changes will be possible without a manual correction.
          </p>
          <textarea
            placeholder="Tracking reference or notes (optional)..."
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowReturnPD(false); setActionNotes('') }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleReturnToPD} disabled={saving}
              className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm — Send to PlayerData'}
            </button>
          </div>
        </Modal>
      )}

      {showConvert && (
        <Modal title={`Convert to ${unit.unit_type === 'GPS' ? 'IMU' : 'GPS'}`} onClose={() => { setShowConvert(false); setFirmware(''); setActionNotes('') }}>
          <p className="text-sm text-gray-600 mb-3">
            This will change the unit type from <strong>{unit.unit_type}</strong> to{' '}
            <strong>{unit.unit_type === 'GPS' ? 'IMU' : 'GPS'}</strong> and log the firmware update.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Firmware Version</label>
              <input
                type="text"
                placeholder="e.g. 2.4.1"
                value={firmware}
                onChange={e => setFirmware(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                placeholder="Any relevant notes..."
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowConvert(false); setFirmware(''); setActionNotes('') }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleConvertType} disabled={saving}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm — Convert Type'}
            </button>
          </div>
        </Modal>
      )}

    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}
