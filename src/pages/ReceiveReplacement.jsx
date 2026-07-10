import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

function today() {
  return new Date().toISOString().split('T')[0]
}

function SectionHeader({ number, title, sub }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="w-8 h-8 rounded-full bg-[#0057B8] text-white flex items-center justify-center text-sm font-medium flex-shrink-0">
        {number}
      </div>
      <div>
        <h2 className="text-base font-medium text-gray-900">{title}</h2>
        {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SuccessBanner({ message, onDismiss }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
      <span className="text-sm text-green-700">{message}</span>
      <button onClick={onDismiss} className="text-green-500 hover:text-green-700 text-lg leading-none ml-4">×</button>
    </div>
  )
}

function ErrorBanner({ message }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}

// ── SECTION 1: Receive Shipment ─────────────────────────────
function ReceiveShipment({ sports, onSuccess }) {
  const [serialInput, setSerialInput]   = useState('')
  const [serials, setSerials]           = useState([])
  const [reviewing, setReviewing]       = useState(false)
  const [rows, setRows]                 = useState([])
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [dupError, setDupError]         = useState('')
  const inputRef                        = useRef(null)

  function handleSerialKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const val = serialInput.trim().toUpperCase()
    if (!val) return
    if (serials.includes(val)) {
      setDupError(`${val} already in this list`)
      return
    }
    setDupError('')
    setSerials(prev => [...prev, val])
    setSerialInput('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function removeSerial(serial) {
    setSerials(prev => prev.filter(s => s !== serial))
  }

  function handleReview() {
    if (serials.length === 0) return
    setRows(serials.map(s => ({ serial: s, sportId: '', unitType: 'GPS' })))
    setReviewing(true)
  }

  function updateRow(index, field, value) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  const allReady = rows.length > 0 && rows.every(r => r.sportId !== '')

  async function handleConfirm() {
    setError('')
    setSaving(true)

    // Check for duplicates in DB
    const { data: existing } = await supabase
      .from('units')
      .select('serial_number')
      .in('serial_number', rows.map(r => r.serial))

    if (existing && existing.length > 0) {
      setError(`These serials already exist: ${existing.map(e => e.serial_number).join(', ')}`)
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase
      .from('units')
      .insert(rows.map(r => ({
        serial_number:   r.serial,
        status:          'spare',
        sport_id:        r.sportId,
        unit_type:       r.unitType,
        acquired_date:   today(),
        acquired_source: 'playerdata_shipment',
      })))

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    // Log events
    const { data: newUnits } = await supabase
      .from('units')
      .select('id, serial_number')
      .in('serial_number', rows.map(r => r.serial))

    if (newUnits) {
      await supabase.from('events').insert(
        newUnits.map(u => ({
          unit_id:    u.id,
          event_type: 'unit_entered_inventory',
          event_date: today(),
          to_status:  'spare',
          notes:      'Received from PlayerData shipment',
        }))
      )
    }

    setSaving(false)
    setSerials([])
    setRows([])
    setReviewing(false)
    onSuccess(`${rows.length} unit${rows.length > 1 ? 's' : ''} added to inventory as spare`)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <SectionHeader
        number="1"
        title="Receive a PlayerData shipment"
        sub="Enter each serial number from the shipment, then assign sport and unit type"
      />

      {!reviewing ? (
        <>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
              Serial numbers — type each and press Enter
            </label>
            <input
              ref={inputRef}
              type="text"
              value={serialInput}
              onChange={e => { setSerialInput(e.target.value); setDupError('') }}
              onKeyDown={handleSerialKeyDown}
              placeholder="e.g. PD-005001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoComplete="off"
            />
            {dupError && <p className="text-xs text-red-500 mt-1">{dupError}</p>}
          </div>

          {serials.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">
                {serials.length} serial{serials.length > 1 ? 's' : ''} entered
              </p>
              <div className="flex flex-wrap gap-2">
                {serials.map(s => (
                  <span key={s} className="inline-flex items-center gap-1.5 bg-blue-50 text-[#0057B8] text-xs font-medium px-2.5 py-1 rounded-full">
                    {s}
                    <button onClick={() => removeSerial(s)} className="text-blue-300 hover:text-blue-600 leading-none">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleReview}
            disabled={serials.length === 0}
            className="w-full py-2.5 bg-[#0057B8] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Review batch ({serials.length})
          </button>
        </>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-400">Serial</th>
                  <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-400">Sport *</th>
                  <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-400">Type</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.serial} className="border-b border-gray-50">
                    <td className="py-2 px-3 font-mono text-gray-900">{row.serial}</td>
                    <td className="py-2 px-3">
                      <select
                        value={row.sportId}
                        onChange={e => updateRow(i, 'sportId', e.target.value)}
                        className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                          !row.sportId ? 'border-red-200 bg-red-50' : 'border-gray-300'
                        }`}
                      >
                        <option value="">— Select —</option>
                        {sports.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex gap-2">
                        {['GPS', 'IMU'].map(t => (
                          <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`type-${i}`}
                              value={t}
                              checked={row.unitType === t}
                              onChange={() => updateRow(i, 'unitType', t)}
                              className="accent-[#0057B8]"
                            />
                            <span className="text-sm text-gray-700">{t}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => setRows(prev => prev.filter((_, ri) => ri !== i))}
                        className="text-gray-300 hover:text-red-500 text-lg leading-none"
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!allReady && (
            <p className="text-xs text-amber-600">
              {rows.filter(r => !r.sportId).length} row{rows.filter(r => !r.sportId).length > 1 ? 's' : ''} still need a sport assigned
            </p>
          )}

          {error && <ErrorBanner message={error} />}

          <div className="flex gap-3">
            <button
              onClick={() => setReviewing(false)}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={!allReady || saving}
              className="flex-1 py-2.5 bg-[#0057B8] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : `Confirm — add ${rows.length} units to inventory`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── SECTION 2: Replace a Unit ───────────────────────────────
function ReplaceUnit({ sports, spareUnits, allUnits, onSuccess }) {
  const [step, setStep]                   = useState(0)
  const [unitSearch, setUnitSearch]       = useState('')
  const [selectedUnit, setSelectedUnit]   = useState(null)
  const [newStatus, setNewStatus]         = useState('')
  const [eventDate, setEventDate]         = useState(today())
  const [statusNotes, setStatusNotes]     = useState('')
  const [doReplace, setDoReplace]         = useState(null)
  const [replSource, setReplSource]       = useState('')
  const [sourceSportId, setSourceSportId] = useState('')
  const [replSearch, setReplSearch]       = useState('')
  const [replUnit, setReplUnit]           = useState(null)
  const [replEventDate, setReplEventDate] = useState(today())
  const [replNotes, setReplNotes]         = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')

  const unitResults = unitSearch.length >= 2
    ? allUnits
        .filter(u => u.serial_number.toLowerCase().includes(unitSearch.toLowerCase()))
        .slice(0, 8)
    : []

  // Mirrors check_status_transition() from migration 06. Note that
  // 'spare' can NOT transition directly to 'lost' — only 'assigned' can.
  function validTransitions(status) {
    if (status === 'assigned')
      return [
        { value: 'broken_with_sport', label: 'Broken — with sport' },
        { value: 'broken_with_dept',  label: 'Broken — with dept' },
        { value: 'lost',              label: 'Lost (confirmed)' },
        { value: 'spare',             label: 'Return to spare pool' },
      ]
    if (status === 'spare')
      return [
        { value: 'broken_with_sport', label: 'Broken — with sport' },
        { value: 'broken_with_dept',  label: 'Broken — with dept' },
      ]
    if (status === 'broken_with_sport')
      return [
        { value: 'broken_with_dept', label: 'Broken — moved to dept' },
        { value: 'at_playerdata',    label: 'Shipped back to PlayerData' },
      ]
    if (status === 'broken_with_dept')
      return [
        { value: 'at_playerdata', label: 'Shipped back to PlayerData' },
      ]
    return []
  }

  // Maps a target status to the actual valid event_type for logging it
  function eventTypeForStatus(toStatus) {
    switch (toStatus) {
      case 'broken_with_sport': return 'marked_broken'
      case 'broken_with_dept':  return 'transferred_to_dept'
      case 'at_playerdata':     return 'returned_to_vendor'
      case 'lost':              return 'marked_lost'
      case 'spare':             return 'marked_spare'
      default:                  return 'status_corrected'
    }
  }

  const filteredSpares = spareUnits.filter(u => {
    if (replSource === 'spare_own' && selectedUnit)
      return u.sport_id === selectedUnit.sport_id
    if (replSource === 'spare_apd')
      return u.sport_name?.toLowerCase().includes('apd')
    if (replSource === 'spare_other_sport' && sourceSportId)
      return u.sport_id === sourceSportId
    return false
  })

  const replResults = replSearch.length >= 2
    ? filteredSpares.filter(u =>
        u.serial_number.toLowerCase().includes(replSearch.toLowerCase())
      ).slice(0, 8)
    : filteredSpares.slice(0, 10)

  async function submitStatusChange() {
    if (!selectedUnit || !newStatus || !eventDate) {
      setError('Please complete all required fields.')
      return
    }
    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('units')
      .update({ status: newStatus })
      .eq('id', selectedUnit.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    await supabase.from('events').insert({
      unit_id:     selectedUnit.id,
      event_type:  eventTypeForStatus(newStatus),
      event_date:  eventDate,
      from_status: selectedUnit.status,
      to_status:   newStatus,
      notes:       statusNotes || null,
    })

    setSaving(false)
    setStep(1)
  }

  async function submitReplacement() {
    if (doReplace === null) {
      setError('Please choose whether to assign a replacement now.')
      return
    }
    if (!doReplace) {
      onSuccess('Status updated. Replacement can be assigned later.')
      resetForm()
      return
    }
    if (!replUnit || !replSource || !replEventDate) {
      setError('Please complete all replacement fields.')
      return
    }

    setSaving(true)
    setError('')

    const { error: replError } = await supabase
      .from('units')
      .update({
        status:          'assigned',
        sport_id:        selectedUnit.sport_id,
        replacement_for: selectedUnit.id,
      })
      .eq('id', replUnit.id)

    if (replError) {
      setError(replError.message)
      setSaving(false)
      return
    }

    await supabase
      .from('units')
      .update({ replaced_by: replUnit.id })
      .eq('id', selectedUnit.id)

    await supabase.from('events').insert([
      {
        unit_id:              selectedUnit.id,
        event_type:           'replacement_received',
        event_date:           replEventDate,
        replaced_by_unit_id:  replUnit.id,
        replacement_source:   replSource,
        source_sport_id:      sourceSportId || null,
        notes:                replNotes || null,
      },
      {
        unit_id:     replUnit.id,
        event_type:  'spare_assigned',
        event_date:  replEventDate,
        from_status: 'spare',
        to_status:   'assigned',
        notes:       `Replaced ${selectedUnit.serial_number}`,
      },
    ])

    setSaving(false)
    onSuccess(`${selectedUnit.serial_number} replaced by ${replUnit.serial_number}`)
    resetForm()
  }

  function resetForm() {
    setStep(0)
    setUnitSearch('')
    setSelectedUnit(null)
    setNewStatus('')
    setEventDate(today())
    setStatusNotes('')
    setDoReplace(null)
    setReplSource('')
    setSourceSportId('')
    setReplSearch('')
    setReplUnit(null)
    setReplEventDate(today())
    setReplNotes('')
    setError('')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
      <SectionHeader
        number="2"
        title="Replace a unit"
        sub="Log a status change, then optionally assign a replacement from the spare pool"
      />

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {['Log status change', 'Assign replacement'].map((label, i) => (
          <React.Fragment key={i}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                ${i < step ? 'bg-[#0057B8] text-white'
                : i === step ? 'bg-[#0057B8] text-white'
                : 'bg-gray-100 text-gray-400'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${i === step ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < 1 && (
              <div className={`flex-1 h-px mx-3 min-w-8 ${i < step ? 'bg-[#0057B8]' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      {/* ── Step 0: Log status change ── */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
              Find unit by serial number
            </label>
            <input
              type="text"
              value={unitSearch}
              onChange={e => { setUnitSearch(e.target.value); setSelectedUnit(null); setNewStatus('') }}
              placeholder="Type serial number..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {unitResults.length > 0 && !selectedUnit && (
              <div className="border border-gray-200 rounded-lg mt-1 overflow-hidden">
                {unitResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedUnit(u); setUnitSearch(u.serial_number); setNewStatus('') }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between"
                  >
                    <span className="font-mono text-gray-900">{u.serial_number}</span>
                    <span className="text-xs text-gray-400">{u.sports?.name} · {u.status?.replace(/_/g, ' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedUnit && (
            <>
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Serial</span>
                  <span className="font-mono text-gray-900">{selectedUnit.serial_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Sport</span>
                  <span className="text-gray-700">{selectedUnit.sports?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Current status</span>
                  <span className="text-gray-700 capitalize">{selectedUnit.status?.replace(/_/g, ' ')}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                  New status *
                </label>
                <div className="space-y-2">
                  {validTransitions(selectedUnit.status).map(t => (
                    <label key={t.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                      ${newStatus === t.value ? 'border-[#0057B8] bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input
                        type="radio"
                        name="new_status"
                        value={t.value}
                        checked={newStatus === t.value}
                        onChange={() => setNewStatus(t.value)}
                        className="accent-[#0057B8]"
                      />
                      <span className="text-sm text-gray-900">{t.label}</span>
                    </label>
                  ))}
                </div>
                {validTransitions(selectedUnit.status).length === 0 && (
                  <p className="text-sm text-gray-400 italic">No further transitions available for this unit.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                  When did this happen? *
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  max={today()}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                {eventDate !== today() && (
                  <p className="text-xs text-amber-600 mt-1">Logging an event that occurred in the past</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                  Notes <span className="normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={statusNotes}
                  onChange={e => setStatusNotes(e.target.value)}
                  placeholder="e.g. Device stopped charging"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <button
                onClick={submitStatusChange}
                disabled={saving || !newStatus}
                className="w-full py-2.5 bg-[#0057B8] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving...' : 'Log status change →'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Step 1: Assign replacement ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
            <span className="text-gray-400">Status updated — </span>
            <span className="font-mono text-gray-900">{selectedUnit?.serial_number}</span>
            <span className="text-gray-400"> is now </span>
            <span className="text-gray-700 capitalize">{newStatus?.replace(/_/g, ' ')}</span>
          </div>

          <p className="text-sm font-medium text-gray-700">Assign a replacement unit now?</p>
          <div className="flex gap-3">
            {[{ val: true, label: 'Yes, assign now' }, { val: false, label: 'No, do it later' }].map(opt => (
              <label key={String(opt.val)} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors
                ${doReplace === opt.val ? 'border-[#0057B8] bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="do_replace"
                  checked={doReplace === opt.val}
                  onChange={() => setDoReplace(opt.val)}
                  className="accent-[#0057B8]"
                />
                <span className="text-sm text-gray-900">{opt.label}</span>
              </label>
            ))}
          </div>

          {doReplace === true && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                  Where is the replacement coming from? *
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'spare_own',         label: `${selectedUnit?.sports?.name} spare pool` },
                    { value: 'spare_apd',          label: 'APD / Dept holding pool' },
                    { value: 'spare_other_sport',  label: 'Another sport\'s spare pool' },
                  ].map(src => (
                    <label key={src.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                      ${replSource === src.value ? 'border-[#0057B8] bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input
                        type="radio"
                        name="repl_source"
                        value={src.value}
                        checked={replSource === src.value}
                        onChange={() => { setReplSource(src.value); setReplUnit(null); setReplSearch('') }}
                        className="accent-[#0057B8]"
                      />
                      <span className="text-sm text-gray-900">{src.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {replSource === 'spare_other_sport' && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                    Which sport? *
                  </label>
                  <select
                    value={sourceSportId}
                    onChange={e => { setSourceSportId(e.target.value); setReplUnit(null); setReplSearch('') }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">— Select sport —</option>
                    {sports
                      .filter(s => s.id !== selectedUnit?.sport_id)
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))
                    }
                  </select>
                </div>
              )}

              {replSource && (replSource !== 'spare_other_sport' || sourceSportId) && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                    Replacement unit serial number *
                    <span className="normal-case font-normal text-gray-400 ml-1">
                      — only spare units shown
                    </span>
                  </label>
                  <input
                    type="text"
                    value={replSearch}
                    onChange={e => { setReplSearch(e.target.value); setReplUnit(null) }}
                    placeholder="Type to search or select below..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  {replResults.length > 0 && !replUnit && (
                    <div className="border border-gray-200 rounded-lg mt-1 overflow-hidden max-h-48 overflow-y-auto">
                      {replResults.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { setReplUnit(u); setReplSearch(u.serial_number) }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between"
                        >
                          <span className="font-mono text-gray-900">{u.serial_number}</span>
                          <span className="text-xs text-gray-400">{u.sport_name} · spare</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {replResults.length === 0 && replSource && (
                    <p className="text-xs text-amber-600 mt-1">No spare units available from this source.</p>
                  )}
                </div>
              )}

              {replUnit && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
                  <div>
                    <span className="font-mono text-[#0057B8] font-medium">{replUnit.serial_number}</span>
                    <span className="text-gray-400 ml-2">from {replUnit.sport_name}</span>
                  </div>
                  <button onClick={() => { setReplUnit(null); setReplSearch('') }} className="text-gray-300 hover:text-gray-500">×</button>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                  Replacement date *
                </label>
                <input
                  type="date"
                  value={replEventDate}
                  onChange={e => setReplEventDate(e.target.value)}
                  max={today()}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
                  Notes <span className="normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={replNotes}
                  onChange={e => setReplNotes(e.target.value)}
                  placeholder="e.g. Pulled from soccer spare pool pending new shipment"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setStep(0); setDoReplace(null); setError('') }}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              onClick={submitReplacement}
              disabled={saving || doReplace === null || (doReplace && (!replUnit || !replSource))}
              className="flex-1 py-2.5 bg-[#0057B8] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : doReplace ? 'Confirm replacement' : 'Done — replace later'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────
export default function ReplaceUnitPage() {
  const [sports, setSports]       = useState([])
  const [spareUnits, setSpareUnits] = useState([])
  const [allUnits, setAllUnits]   = useState([])
  const [success, setSuccess]     = useState('')

  useEffect(() => { fetchSharedData() }, [])

  async function fetchSharedData() {
    const { data: s } = await supabase
      .from('sports').select('id, name').order('name')
    setSports(s || [])

    const { data: spare } = await supabase
      .from('available_spare_units').select('*')
    setSpareUnits(spare || [])

    const { data: units } = await supabase
      .from('units')
      .select('id, serial_number, status, sport_id, sports(name)')
      .not('status', 'in', '("at_playerdata","lost")')
      .order('serial_number')
    setAllUnits(units || [])
  }

  function handleSuccess(msg) {
    setSuccess(msg)
    fetchSharedData()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-[#0057B8] mb-1">Inventory management</p>
        <h1 className="text-2xl font-medium text-gray-900">Replace a Unit</h1>
        <p className="text-sm text-gray-400 mt-1">
          Receive new units from PlayerData, or log a status change and assign a replacement
        </p>
      </div>

      {success && (
        <SuccessBanner message={success} onDismiss={() => setSuccess('')} />
      )}

      <ReceiveShipment sports={sports} onSuccess={handleSuccess} />
      <ReplaceUnit
        sports={sports}
        spareUnits={spareUnits}
        allUnits={allUnits}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
