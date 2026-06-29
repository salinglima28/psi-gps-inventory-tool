import React, { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Papa from 'papaparse'

const IS_SPARE = (name) => name?.trim().toLowerCase() === 'spare'

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
  const [step, setStep] = useState('upload')

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

    if (rows.length === 0) {
      hardErrors.push('The CSV file is empty.')
      setErrors(hardErrors)
      return
    }

    const cols = Object.keys(rows[0]).map(c => c.toLowerCase().trim())
    if (!cols.includes('serial_number')) hardErrors.push('Missing required column: serial_number')
    if (!cols.includes('athlete_name'))  hardErrors.push('Missing required column: athlete_name')
    if (!cols.includes('sport'))         hardErrors.push('Missing required column: sport')

    if (hardErrors.length > 0) { setErrors(hardErrors); return }

    const normalized = rows.map(r => {
      const out = {}
      Object.keys(r).forEach(k => { out[k.toLowerCase().trim()] = r[k]?.trim() })
      return out
    })

    // Duplicate serials in file
    const serials = normalized.map(r => r.serial_number?.toLowerCase())
    const dupes = serials.filter((s, i) => serials.indexOf(s) !== i)
    if (dupes.length > 0) {
      hardErrors.push(`Duplicate serial numbers in file: ${[...new Set(dupes)].join(', ')}`)
    }

    // Unknown sport names
    const sportNames = sports.map(s => s.name.toLowerCase())
    normalized.forEach((row, i) => {
      if (!sportNames.includes(row.sport?.toLowerCase())) {
        hardErrors.push(`Row ${i + 2}: Sport "${row.sport}" is not a configured sport.`)
      }
    })

    if (hardErrors.length > 0) { setErrors(hardErrors); return }

    // DB checks
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
      const spare = IS_SPARE(row.athlete_name)
      let rowWarnings = []
      let status = 'new'

      if (!existing) {
        status = 'create'
        rowWarnings.push(`Unit ${row.serial_number} is not in inventory — will be created as ${spare ? 'spare' : 'assigned'}.`)
      } else {
        status = 'update'
        const existingSport = sports.find(s => s.id === existing.sport_id)
        if (existingSport && existingSport.name.toLowerCase() !== row.sport.toLowerCase()) {
          rowWarnings.push(`Unit is currently with ${existingSport.name} — will transfer to ${row.sport}.`)
        }
        if (['broken_with_sport', 'broken_with_dept', 'lost', 'at_playerdata'].includes(existing.status)) {
          rowWarnings.push(`Unit status is currently "${existing.status.replace(/_/g, ' ')}" — uploading will reactivate it as ${spare ? 'spare' : 'assigned'}.`)
        }
        if (!spare && activeAthletes[existing.id] && activeAthletes[existing.id] !== row.athlete_name) {
          rowWarnings.push(`Unit is currently assigned to ${activeAthletes[existing.id]} — will reassign to ${row.athlete_name}.`)
        }
      }

      if (rowWarnings.length > 0) {
        softWarnings.push(`Row ${i + 2} (${row.serial_number}): ${rowWarnings.join(' ')}`)
      }

      return { ...row, _status: status, _spare: spare, _warnings: rowWarnings }
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

      const spare = row._spare
      const newStatus = spare ? 'spare' : 'assigned'

      if (row._status === 'create') {
        const { data: newUnit } = await supabase.from('units').insert({
          serial_number:   row.serial_number,
          status:          newStatus,
          sport_id:        sportObj.id,
          unit_type:       row.unit_type || 'GPS',
          acquired_date:   row.date_assigned || today,
          acquired_source: 'csv_import',
          notes:           row.notes || null,
        }).select().single()

        if (newUnit) {
          // Only create assignment if not spare
          if (!spare) {
            await supabase.from('assignments').insert({
              unit_id:      newUnit.id,
              athlete_name: row.athlete_name,
              sport_id:     sportObj.id,
              practitioner: row.practitioner_name || sportObj.practitioner,
              start_date:   row.date_assigned || today,
              notes:        row.notes || null,
            })
          }
          await supabase.from('events').insert({
            unit_id:      newUnit.id,
            event_type:   'unit_entered_inventory',
            event_date:   row.date_assigned || today,
            to_status:    newStatus,
            athlete_name: spare ? null : row.athlete_name,
            notes:        spare ? 'Added as spare via CSV import' : 'Created via CSV import',
          })
          created++
        }
      } else {
        const { data: existingUnit } = await supabase
          .from('units')
          .select('id, status, sport_id')
          .eq('serial_number', row.serial_number)
          .single()

        if (!existingUnit) continue

        // Close any active assignment
        await supabase.from('assignments')
          .update({ end_date: today, end_reason: 'csv_reimport' })
          .eq('unit_id', existingUnit.id)
          .is('end_date', null)

        // Update unit status and sport
        await supabase.from('units').update({
          status:   newStatus,
          sport_id: sportObj.id,
          notes:    row.notes || null,
        }).eq('id', existingUnit.id)

        // Only create new assignment if not spare
        if (!spare) {
          await supabase.from('assignments').insert({
            unit_id:      existingUnit.id,
            athlete_name: row.athlete_name,
            sport_id:     sportObj.id,
            practitioner: row.practitioner_name || sportObj.practitioner,
            start_date:   row.date_assigned || today,
            notes:        row.notes || null,
          })
        }

        await supabase.from('events').insert({
          unit_id:      existingUnit.id,
          event_type:   'csv_import',
          event_date:   row.date_assigned || today,
          from_status:  existingUnit.status,
          to_status:    newStatus,
          athlete_name: spare ? null : row.athlete_name,
          notes:        spare ? 'Set to spare via CSV import' : 'Updated via CSV import',
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

  // Counts for preview summary
  const spareCount    = preview.filter(r => r._spare).length
  const assignedCount = preview.filter(r => !r._spare).length

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-[#0057B8] mb-1">Inventory</p>
        <h1 className="text-2xl font-medium text-gray-900">Bulk Unit Upload</h1>
        <p className="text-sm text-gray-400 mt-1">
          Upload a CSV to assign units to athletes and load spare units in one file.
        </p>
      </div>

     {/* Template hint */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-[#0057B8] space-y-1">
        <p><span className="font-medium">Required columns:</span> serial_number, athlete_name, sport</p>
        <p><span className="font-medium">Optional columns:</span> practitioner_name, date_assigned (YYYY-MM-DD), unit_type (GPS or IMU), notes</p>
        <p className="text-blue-400 pt-1">
          Tip — set <span className="font-mono font-medium">athlete_name = spare</span> for any unit that should enter the spare pool instead of being assigned to an athlete. The word "spare" is not case-sensitive — Spare, SPARE, and spare all work.
        </p>
        <div className="pt-2">
          <button
            onClick={() => {
              const csv = [
                'serial_number,athlete_name,sport,unit_type,date_assigned,practitioner_name,notes',
                'A1B2C3D4,John Smith,Basketball,IMU,2025-08-15,Wendy,Example row — delete before uploading',
                'E5F6G7H8,spare,Soccer,GPS,2025-08-15,Carlos,Example spare row — delete before uploading',
              ].join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'psi_unit_upload_template.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-white border border-[#0057B8] text-[#0057B8] rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            Download CSV template
          </button>
        </div>
      </div>

      {/* Upload area */}
      {step === 'upload' && (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-400 mb-4 text-sm">Select your CSV file to begin</p>
          <input type="file" accept=".csv" onChange={handleFile} className="hidden" id="csv-input" />
          <label
            htmlFor="csv-input"
            className="px-6 py-2 bg-[#0057B8] text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors"
          >
            Choose CSV file
          </label>
        </div>
      )}

      {/* Hard errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-medium text-red-800 mb-2">Fix these errors before importing</h3>
          <ul className="space-y-1">
            {errors.map((e, i) => <li key={i} className="text-sm text-red-700">• {e}</li>)}
          </ul>
          <button onClick={reset} className="mt-3 text-sm text-red-600 underline">Start over</button>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && preview.length > 0 && (
        <div className="space-y-4">

          {/* Summary counts */}
          <div className="flex gap-4">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm">
              <span className="text-gray-400">Assigned to athletes </span>
              <span className="font-medium text-gray-900">{assignedCount}</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm">
              <span className="text-gray-400">Going to spare pool </span>
              <span className="font-medium text-[#0057B8]">{spareCount}</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm">
              <span className="text-gray-400">Total rows </span>
              <span className="font-medium text-gray-900">{preview.length}</span>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-medium text-amber-800 mb-2">Review before importing</h3>
              <ul className="space-y-1 mb-3">
                {warnings.map((w, i) => <li key={i} className="text-sm text-amber-700">• {w}</li>)}
              </ul>
              <label className="flex items-center gap-2 text-sm text-amber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={warningsAcknowledged}
                  onChange={e => setWarningsAcknowledged(e.target.checked)}
                  className="accent-amber-600"
                />
                I have reviewed the warnings and want to proceed
              </label>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-medium text-gray-800 text-sm">Preview — {preview.length} rows</h3>
              <div className="flex gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span> New</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span> Update</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block"></span> Spare</span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">Serial</th>
                  <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">Athlete</th>
                  <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">Sport</th>
                  <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">Date</th>
                  <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-50 last:border-0 ${row._warnings.length > 0 ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-2 font-mono text-xs">{row.serial_number}</td>
                    <td className="px-4 py-2">
                      {row._spare
                        ? <span className="text-gray-400 italic">spare</span>
                        : row.athlete_name
                      }
                    </td>
                    <td className="px-4 py-2">{row.sport}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{row.date_assigned || 'Today'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row._spare
                          ? 'bg-gray-100 text-gray-600'
                          : row._status === 'create'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {row._spare ? 'Spare' : row._status === 'create' ? 'Create' : 'Update'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={reset} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || (warnings.length > 0 && !warningsAcknowledged)}
              className="px-6 py-2 text-sm bg-[#0057B8] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
            >
              {importing ? 'Importing...' : `Confirm import (${preview.length} rows)`}
            </button>
          </div>
        </div>
      )}

      {/* Success */}
      {step === 'done' && importResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <h3 className="font-medium text-green-800 text-lg mb-1">Import complete</h3>
          <p className="text-green-700 text-sm">
            {importResult.created} units created · {importResult.updated} units updated
          </p>
          <button onClick={reset} className="mt-4 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
            Upload another file
          </button>
        </div>
      )}
    </div>
  )
}