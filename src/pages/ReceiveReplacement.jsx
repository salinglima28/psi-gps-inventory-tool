import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ReceiveReplacement() {
  const navigate = useNavigate()
  const [sports, setSports] = useState([])
  const [brokenUnits, setBrokenUnits] = useState([])
  const [selectedBroken, setSelectedBroken] = useState('')
  const [newSerial, setNewSerial] = useState('')
  const [selectedSport, setSelectedSport] = useState('')
  const [unitType, setUnitType] = useState('GPS')
  const [firmware, setFirmware] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: sportsData } = await supabase
      .from('sports')
      .select('id, name')
      .order('name')
    setSports(sportsData || [])

    const { data: brokenData } = await supabase
      .from('units')
      .select('id, serial_number, sport_id, sports(name)')
      .in('status', ['broken_dept', 'returned_to_vendor', 'replacement_pending'])
      .order('serial_number')
    setBrokenUnits(brokenData || [])
  }

  async function handleSubmit() {
    setError('')

    if (!newSerial.trim()) {
      setError('Please enter the new unit serial number.')
      return
    }
    if (!selectedSport) {
      setError('Please select which sport this replacement goes to.')
      return
    }

    // Check serial doesn't already exist
    const { data: existing } = await supabase
      .from('units')
      .select('id')
      .eq('serial_number', newSerial.trim())
      .single()

    if (existing) {
      setError(`Serial number ${newSerial.trim()} already exists in the system.`)
      return
    }

    setSaving(true)
    const today = new Date().toISOString().split('T')[0]

    // Create the new replacement unit
    const { data: newUnit, error: insertError } = await supabase
      .from('units')
      .insert({
        serial_number:   newSerial.trim(),
        status:          'unassigned_sport',
        sport_id:        selectedSport,
        acquired_date:   today,
        acquired_source: 'replacement_received',
        unit_type:       unitType,
        firmware_version: firmware || null,
        replacement_for: selectedBroken || null,
        notes:           notes || null,
      })
      .select()
      .single()

    if (insertError) {
      setError('Failed to create replacement unit. Please try again.')
      setSaving(false)
      return
    }

    // Link broken unit to replacement
    if (selectedBroken) {
      await supabase
        .from('units')
        .update({
          status:      'returned_to_vendor',
          replaced_by: newUnit.id,
        })
        .eq('id', selectedBroken)

      // Log event on broken unit
      await supabase.from('events').insert({
        unit_id:        selectedBroken,
        event_type:     'replacement_received',
        actor_sport:    'Department',
        to_status:      'returned_to_vendor',
        linked_unit_id: newUnit.id,
        notes:          `Replaced by ${newSerial.trim()}`,
      })
    }

    // Log event on new unit
    await supabase.from('events').insert({
      unit_id:        newUnit.id,
      event_type:     'unit_entered_inventory',
      actor_sport:    'Department',
      to_status:      'unassigned_sport',
      linked_unit_id: selectedBroken || null,
      notes:          selectedBroken
        ? `Replacement for ${brokenUnits.find(u => u.id === selectedBroken)?.serial_number}`
        : 'New unit added to inventory',
    })

    setSaving(false)
    setResult({
      newSerial:     newSerial.trim(),
      sport:         sports.find(s => s.id === selectedSport)?.name,
      brokenSerial:  brokenUnits.find(u => u.id === selectedBroken)?.serial_number,
      newUnitId:     newUnit.id,
    })
  }

  function reset() {
    setSelectedBroken('')
    setNewSerial('')
    setSelectedSport('')
    setUnitType('GPS')
    setFirmware('')
    setNotes('')
    setResult(null)
    setError('')
  }

  if (result) {
    return (
      <div className="max-w-lg">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center space-y-3">
          <div className="text-4xl">✅</div>
          <h2 className="text-lg font-semibold text-green-800">Replacement Received</h2>
          <div className="text-sm text-green-700 space-y-1">
            <p>
              <strong>{result.newSerial}</strong> added to{' '}
              <strong>{result.sport}</strong> spare pool
            </p>
            {result.brokenSerial && (
              <p className="text-green-600">
                Linked to broken unit: {result.brokenSerial}
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() => navigate(`/unit/${result.newUnitId}`)}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              View New Unit
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Add Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Receive Replacement</h1>
        <p className="text-gray-500 text-sm mt-1">
          Record a replacement unit received from PlayerData.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">

        {/* Broken unit selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Replacing which broken unit?
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <select
            value={selectedBroken}
            onChange={e => {
              setSelectedBroken(e.target.value)
              // Auto-set sport from broken unit's sport
              const broken = brokenUnits.find(u => u.id === e.target.value)
              if (broken) setSelectedSport(broken.sport_id)
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">— Not linked to a specific broken unit —</option>
            {brokenUnits.map(u => (
              <option key={u.id} value={u.id}>
                {u.serial_number} ({u.sports?.name})
              </option>
            ))}
          </select>
          {brokenUnits.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">
              No units currently in broken/returned status.
            </p>
          )}
        </div>

        {/* New serial number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New unit serial number *
          </label>
          <input
            type="text"
            placeholder="e.g. PD-005001"
            value={newSerial}
            onChange={e => setNewSerial(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Assign to sport */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Assign to sport *
          </label>
          <select
            value={selectedSport}
            onChange={e => setSelectedSport(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">— Select sport —</option>
            {sports.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Unit type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Unit type
          </label>
          <div className="flex gap-3">
            {['GPS', 'IMU'].map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="unit_type"
                  value={type}
                  checked={unitType === type}
                  onChange={() => setUnitType(type)}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-700">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Firmware version */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Firmware version
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. 2.4.1"
            value={firmware}
            onChange={e => setFirmware(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <textarea
            placeholder="e.g. Received with shipment PD-2025-089"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={saving || !newSerial.trim() || !selectedSport}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Confirm — Add Replacement Unit'}
        </button>

      </div>
    </div>
  )
}