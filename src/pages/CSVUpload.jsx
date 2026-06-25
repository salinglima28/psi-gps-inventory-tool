import React, { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Papa from 'papaparse'

export default function CSVUpload() {
  const { sports } = useOutletContext()
  const [selectedSport, setSelectedSport] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [errors, setErrors] = useState([])
  const [warnings, setWarnings] = useState([])
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [step, setStep] = useState('upload') // upload | preview | done

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setErrors([])
    setWarnings([])
    setPreview([])
    setImportResult(null)
    setStep('upload')

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => validateCSV(results.data),
    })
  }

  async function validateCSV(rows) {
    const hardErrors = []
    const softWarnings = []

    // Check required columns
    if (rows.length === 0) {
      hardErrors.push('The CSV file is empty.')
      setErrors(hardErrors)
      return
    }

    const cols = Object.keys(rows[0]).map(c => c.toLowerCase().trim())
    if (!cols.includes('serial_number')) hardErrors.push('Missing required column: serial_number')
    if (!cols.includes('athlete_name'))  hardErrors.push('Missing required column: athlete_name')
    if (!cols.includes('sport'))         hardErrors.push('Missing required column: sport')

    if (hardErrors.length > 0) {
      setErrors(hardErrors)
      return
    }

    // Normalize rows
    const normalized = rows.map(r => {
      const out = {}
      Object.keys(r).forEach(k => { out[k.toLowerCase().trim()] = r[k]?.trim() })
      return out
    })

    // Check for duplicate serial numbers within the file
    const serials = normalized.map(r => r.serial_number?.toLowerCase())
    const dupes = serials.filter((s, i) => serials.indexOf(s) !== i)
    if (dupes.length > 0) {
      hardErrors.push(`Duplicate serial numbers in file: ${[...new Set(dupes)].join(', ')}`)
    }

    // Check sport values
    const sportNames = sports.map(s => s.name.toLowerCase())
    normalized.forEach((row, i) => {
      if (!sportNames.includes(row.sport?.toLowerCase())) {
        hardErrors.push(`Row ${i + 2}: Sport "${row.sport}" is not a configured sport.`)
      }
    })

    if (hardErrors.length > 0) {
      setErrors(hardErrors)
      return
    }

    // Soft warnings — check against database
    const serialList = normalized.map(r => r.serial_number)
    const { data: existingUnits } = await supabase
      .from('units')
      .select('id, serial_number, status, sport_id')
      .in('serial_number', serialList)

    const { data: existingAssignments } = await supabase
      .from('assignments')
      .select('unit_id, athlete_name')
      .is('end_date', null)

    const unitMap = {}
    existingUnits?.forEach(u => { unitMap[u.serial_number.toLowerCase()] = u })

    const activeAthletes = {}
    existingAssignments?.forEach(a => { activeAthletes[a.unit_id] = a.athlete_name })

    const previewRows = normalized.map((row, i) => {
      const existing = unitMap[row.serial_number.toLowerCase()]
      let rowWarnings = []
      let status = 'new'

      if (!existing) {
        rowWarnings.push(`Unit ${row.serial_number} is not in inventory — will be created.`)
        status = 'create'
      } else {
        status = 'update'
        const existingSport = sports.find(s => s.id === existing.sport_id)
        if (existingSport && existingSport.name.toLowerCase() !== row.sport.toLowerCase()) {
          rowWarnings.push(`Unit is currently with ${existingSport.name} — will transfer to ${row.sport}.`)
        }
        if (['broken_held', 'lost_missing', 'retired'].includes(existing.status)) {
          rowWarnings.push(`Unit status is currently "${existing.status}" — assigning will reactivate it.`)
        }
        if (activeAthletes[existing.id] && activeAthletes[existing.id] !== row.athlete_name) {
          rowWarnings.push(`Unit is currently assigned to ${activeAthletes[existing.id]} — will reassign to ${row.athlete_name}.`)
        }
      }

      if (rowWarnings.length > 0) {
        softWarnings.push(`Row ${i + 2} (${row.serial_number}): ${rowWarnings.join(' ')}`)
      }

      return { ...row, _status: status, _warnings: rowWarnings }
    })

    setErrors(hardErrors)
    setWarnings(softWarnings)
    setPreview(previewRows)
    setStep('preview')
  }

  async function handleImport() {
    if (warnings.length > 0 && !warningsAcknowledged) return
    setImporting(true)

    let created = 0
    let updated = 0
    const today = new Date().toISOString().split('T')[0]

    for (const row of preview) {
      const sportObj = sports.find(s => s.name.toLowerCase() === row.sport.toLowerCase())
      if (!sportObj) continue

      if (row._status === 'create') {
        // Create new unit
        const { data: newUnit } = await supabase.from('units').insert({
          serial_number:   row.serial_number,
          status:          'assigned',
          sport_id:        sportObj.id,
          acquired_date:   row.date_assigned || today,
          acquired_source: 'manual_entry',
          notes:           row.notes || null,
        }).select().single()

        if (newUnit) {
          await supabase.from('assignments').insert({
            unit_id:      newUnit.id,
            athlete_name: row.athlete_name,
            sport_id:     sportObj.id,
            practitioner: row.practitioner_name || sportObj.practitioner,
            start_date:   row.date_assigned || today,
            notes:        row.notes || null,
          })
          await supabase.from('events').insert({
            unit_id:      newUnit.id,
            event_type:   'unit_entered_inventory',
            actor_sport:  sportObj.name,
            to_status:    'assigned',
            athlete_name: row.athlete_name,
            notes:        'Created via CSV import',
          })
          created++
        }
      } else {
        // Update existing unit
        const { data: existingUnit } = await supabase
          .from('units')
          .select('id, status, sport_id')
          .eq('serial_number', row.serial_number)
          .single()

        if (!existingUnit) continue

        // Close any active assignment
        await supabase.from('assignments')
          .update({ end_date: today, end_reason: 'reassigned' })
          .eq('unit_id', existingUnit.id)
          .is('end_date', null)

        // Update unit
        await supabase.from('units').update({
          status:   'assigned',
          sport_id: sportObj.id,
          notes:    row.notes || null,
        }).eq('id', existingUnit.id)

        // New assignment
        await supabase.from('assignments').insert({
          unit_id:      existingUnit.id,
          athlete_name: row.athlete_name,
          sport_id:     sportObj.id,
          practitioner: row.practitioner_name || sportObj.practitioner,
          start_date:   row.date_assigned || today,
          notes:        row.notes || null,
        })

        await supabase.from('events').insert({
          unit_id:      existingUnit.id,
          event_type:   'csv_import',
          actor_sport:  sportObj.name,
          from_status:  existingUnit.status,
          to_status:    'assigned',
          athlete_name: row.athlete_name,
          notes:        'Updated via CSV import',
        })
        updated++
      }
    }

    setImporting(false)
    setImportResult({ created, updated })
    setStep('done')
  }

  function reset() {
    setFile(null)
    setPreview([])
    setErrors([])
    setWarnings([])
    setWarningsAcknowledged(false)
    setImportResult(null)
    setStep('upload')
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CSV Upload</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload a roster CSV to bulk-assign units to athletes.
        </p>
      </div>

      {/* Template download hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>Required columns:</strong> serial_number, athlete_name, sport<br />
        <strong>Optional columns:</strong> practitioner_name, date_assigned (YYYY-MM-DD), notes, unit_type (GPS or IMU)
      </div>

      {/* Upload area */}
      {step === 'upload' && (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">📂</div>
          <p className="text-gray-600 mb-4">Select your CSV file to begin</p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="hidden"
            id="csv-input"
          />
          <label
            htmlFor="csv-input"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors"
          >
            Choose CSV File
          </label>
        </div>
      )}

      {/* Hard errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-800 mb-2">⛔ Errors — Fix before importing</h3>
          <ul className="space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-sm text-red-700">• {e}</li>
            ))}
          </ul>
          <button onClick={reset} className="mt-3 text-sm text-red-600 underline">
            Start over
          </button>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && preview.length > 0 && (
        <div className="space-y-4">

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Warnings — Review before importing</h3>
              <ul className="space-y-1 mb-3">
                {warnings.map((w, i) => (
                  <li key={i} className="text-sm text-yellow-700">• {w}</li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-sm text-yellow-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={warningsAcknowledged}
                  onChange={e => setWarningsAcknowledged(e.target.checked)}
                  className="accent-yellow-600"
                />
                I have reviewed the warnings and want to proceed
              </label>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                Preview — {preview.length} rows
              </h3>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span> New
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span> Update
                </span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Serial</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Athlete</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Sport</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${row._warnings.length > 0 ? 'bg-yellow-50' : ''}`}>
                    <td className="px-4 py-2 font-mono text-xs">{row.serial_number}</td>
                    <td className="px-4 py-2">{row.athlete_name}</td>
                    <td className="px-4 py-2">{row.sport}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{row.date_assigned || 'Today'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row._status === 'create'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {row._status === 'create' ? 'Create' : 'Update'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import button */}
          <div className="flex gap-3 justify-end">
            <button onClick={reset}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || (warnings.length > 0 && !warningsAcknowledged)}
              className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {importing ? 'Importing...' : `Confirm Import (${preview.length} rows)`}
            </button>
          </div>
        </div>
      )}

      {/* Success */}
      {step === 'done' && importResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="font-semibold text-green-800 text-lg mb-1">Import Complete</h3>
          <p className="text-green-700 text-sm">
            {importResult.created} units created · {importResult.updated} units updated
          </p>
          <button onClick={reset}
            className="mt-4 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
            Upload Another File
          </button>
        </div>
      )}
    </div>
  )
}