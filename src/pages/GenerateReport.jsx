import React, { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function today() { return new Date().toISOString().split('T')[0] }
function startOfYear() { return new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0] }

function downloadCSV(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h] ?? ''
        return String(val).includes(',') || String(val).includes('"')
          ? `"${String(val).replace(/"/g, '""')}"`
          : String(val)
      }).join(',')
    )
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ReportCard({ number, title, sub, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-4">
        <div className="w-7 h-7 rounded-full bg-[#0057B8] text-white flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
          {number}
        </div>
        <div>
          <h2 className="text-base font-medium text-gray-900">{title}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{sub}</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  )
}

function FilterRow({ children }) {
  return <div className="flex flex-wrap gap-3 items-end">{children}</div>
}

function FilterField({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}

const inputClass = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"

function PreviewTable({ rows, maxRows = 5 }) {
  if (!rows.length) return null
  const headers = Object.keys(rows[0])
  const preview = rows.slice(0, maxRows)
  return (
    <div className="mt-3">
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {headers.map(h => (
                <th key={h} className="text-left px-3 py-2 font-medium uppercase tracking-wide text-gray-400 whitespace-nowrap">
                  {h.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                {headers.map(h => (
                  <td key={h} className="px-3 py-2 text-gray-700 whitespace-nowrap">{row[h] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > maxRows && (
        <p className="text-xs text-gray-400 mt-1.5">{rows.length - maxRows} more rows in the downloaded file</p>
      )}
    </div>
  )
}

function ExportButton({ onClick, loading, count }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-5 py-2 bg-[#0057B8] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
    >
      {loading ? 'Building...' : `Download CSV${count !== null ? ` (${count} rows)` : ''}`}
    </button>
  )
}

// ── Report 1: Sport Snapshot ────────────────────────────────
function SportSnapshot({ sports }) {
  const [sportId, setSportId]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function generate() {
    if (!sportId) { setError('Select a sport.'); return }
    setError('')
    setLoading(true)
    setRows(null)

    let query = supabase
      .from('units')
      .select('serial_number, status, unit_type, sport_id, sports(name), assignments(athlete_name, assigned_date)')
      .eq('sport_id', sportId)
      .order('serial_number')

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    const { data, error: err } = await query
    if (err) { setError(err.message); setLoading(false); return }

    const now = new Date()
    const out = (data || []).map(u => {
      const assignment = u.assignments?.[u.assignments.length - 1]
      return {
        serial_number:      u.serial_number,
        unit_type:          u.unit_type,
        status:             u.status?.replace(/_/g, ' '),
        athlete:            assignment?.athlete_name ?? '—',
        assigned_date:      assignment?.assigned_date ?? '—',
        sport:              u.sports?.name,
      }
    })

    setRows(out)
    setLoading(false)
  }

  return (
    <ReportCard
      number="1"
      title="Sport snapshot"
      sub="Where are all my units right now — current status of every unit in a sport"
    >
      <FilterRow>
        <FilterField label="Sport">
          <select value={sportId} onChange={e => setSportId(e.target.value)} className={inputClass}>
            <option value="">— Select sport —</option>
            {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status filter">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}>
            <option value="all">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="spare">Spare</option>
            <option value="broken_with_sport">Broken — with sport</option>
            <option value="broken_with_dept">Broken — with dept</option>
            <option value="at_playerdata">At PlayerData</option>
            <option value="lost">Lost</option>
          </select>
        </FilterField>
        <FilterField label=" ">
          <ExportButton
            onClick={async () => { await generate(); if (rows) downloadCSV(rows, `sport_snapshot_${sports.find(s=>s.id===sportId)?.name}_${today()}.csv`) }}
            loading={loading}
            count={rows?.length ?? null}
          />
        </FilterField>
      </FilterRow>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {rows && (
        <>
          <PreviewTable rows={rows} />
          <button
            onClick={() => downloadCSV(rows, `sport_snapshot_${sports.find(s=>s.id===sportId)?.name}_${today()}.csv`)}
            className="text-xs text-[#0057B8] underline"
          >
            Download {rows.length} rows as CSV
          </button>
        </>
      )}
    </ReportCard>
  )
}

// ── Report 2: Unit History ──────────────────────────────────
function UnitHistory({ sports }) {
  const [sportId, setSportId]   = useState('')
  const [startDate, setStartDate] = useState(startOfYear())
  const [endDate, setEndDate]   = useState(today())
  const [rows, setRows]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function generate() {
    if (!sportId) { setError('Select a sport.'); return }
    setError('')
    setLoading(true)
    setRows(null)

    const { data, error: err } = await supabase
      .from('events')
      .select('event_date, created_at, event_type, from_status, to_status, notes, units(serial_number, sport_id, sports(name))')
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .eq('units.sport_id', sportId)
      .order('event_date', { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }

    const out = (data || [])
      .filter(e => e.units?.sport_id === sportId)
      .map(e => ({
        serial_number:  e.units?.serial_number,
        sport:          e.units?.sports?.name,
        event_date:     e.event_date,
        logged_date:    e.created_at?.split('T')[0],
        event_type:     e.event_type?.replace(/_/g, ' '),
        from_status:    e.from_status?.replace(/_/g, ' ') ?? '—',
        to_status:      e.to_status?.replace(/_/g, ' ') ?? '—',
        notes:          e.notes ?? '—',
      }))

    setRows(out)
    setLoading(false)
  }

  return (
    <ReportCard
      number="2"
      title="Unit history"
      sub="Every unit that passed through a sport and every status change — longitudinal"
    >
      <FilterRow>
        <FilterField label="Sport">
          <select value={sportId} onChange={e => setSportId(e.target.value)} className={inputClass}>
            <option value="">— Select sport —</option>
            {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="From">
          <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
        </FilterField>
        <FilterField label="To">
          <input type="date" value={endDate} min={startDate} max={today()} onChange={e => setEndDate(e.target.value)} className={inputClass} />
        </FilterField>
        <FilterField label=" ">
          <ExportButton
            onClick={async () => { await generate(); }}
            loading={loading}
            count={rows?.length ?? null}
          />
        </FilterField>
      </FilterRow>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {rows && (
        <>
          <PreviewTable rows={rows} />
          <button
            onClick={() => downloadCSV(rows, `unit_history_${sports.find(s=>s.id===sportId)?.name}_${startDate}_${endDate}.csv`)}
            className="text-xs text-[#0057B8] underline"
          >
            Download {rows.length} rows as CSV
          </button>
        </>
      )}
    </ReportCard>
  )
}

// ── Report 3: Athlete Unit Changes ──────────────────────────
function AthleteChanges({ sports }) {
  const [sportId, setSportId]       = useState('')
  const [athleteSearch, setAthleteSearch] = useState('')
  const [startDate, setStartDate]   = useState(startOfYear())
  const [endDate, setEndDate]       = useState(today())
  const [rows, setRows]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function generate() {
    if (!sportId) { setError('Select a sport.'); return }
    setError('')
    setLoading(true)
    setRows(null)

    let query = supabase
      .from('events')
      .select('event_date, event_type, from_status, to_status, notes, units(serial_number, sport_id, sports(name)), athlete_name')
      .eq('units.sport_id', sportId)
      .in('event_type', ['assigned_to_athlete', 'unassigned_from_athlete', 'assigned_as_replacement', 'unit_replaced'])
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('athlete_name', { ascending: true })

    const { data, error: err } = await query
    if (err) { setError(err.message); setLoading(false); return }

    let out = (data || [])
      .filter(e => e.units?.sport_id === sportId)
      .map(e => ({
        athlete:        e.athlete_name ?? '—',
        serial_number:  e.units?.serial_number,
        event_type:     e.event_type?.replace(/_/g, ' '),
        from_status:    e.from_status?.replace(/_/g, ' ') ?? '—',
        to_status:      e.to_status?.replace(/_/g, ' ') ?? '—',
        event_date:     e.event_date,
        notes:          e.notes ?? '—',
      }))

    if (athleteSearch.trim()) {
      out = out.filter(r =>
        r.athlete.toLowerCase().includes(athleteSearch.toLowerCase())
      )
    }

    // Sort by athlete name then date
    out.sort((a, b) => a.athlete.localeCompare(b.athlete) || a.event_date.localeCompare(b.event_date))

    setRows(out)
    setLoading(false)
  }

  return (
    <ReportCard
      number="3"
      title="Athlete unit changes"
      sub="How many times athletes changed units — sortable by athlete name"
    >
      <FilterRow>
        <FilterField label="Sport">
          <select value={sportId} onChange={e => setSportId(e.target.value)} className={inputClass}>
            <option value="">— Select sport —</option>
            {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Athlete name (optional)">
          <input
            type="text"
            value={athleteSearch}
            onChange={e => setAthleteSearch(e.target.value)}
            placeholder="Filter by name..."
            className={inputClass}
          />
        </FilterField>
        <FilterField label="From">
          <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
        </FilterField>
        <FilterField label="To">
          <input type="date" value={endDate} min={startDate} max={today()} onChange={e => setEndDate(e.target.value)} className={inputClass} />
        </FilterField>
        <FilterField label=" ">
          <ExportButton
            onClick={async () => { await generate() }}
            loading={loading}
            count={rows?.length ?? null}
          />
        </FilterField>
      </FilterRow>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {rows && (
        <>
          <PreviewTable rows={rows} />
          <button
            onClick={() => downloadCSV(rows, `athlete_changes_${sports.find(s=>s.id===sportId)?.name}_${startDate}_${endDate}.csv`)}
            className="text-xs text-[#0057B8] underline"
          >
            Download {rows.length} rows as CSV
          </button>
        </>
      )}
    </ReportCard>
  )
}

// ── Report 4: Status Change Activity ───────────────────────
function StatusActivity({ sports }) {
  const [sportId, setSportId]       = useState('')
  const [startDate, setStartDate]   = useState(startOfYear())
  const [endDate, setEndDate]       = useState(today())
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function generate() {
    if (!sportId) { setError('Select a sport.'); return }
    setError('')
    setLoading(true)
    setRows(null)

    let query = supabase
      .from('events')
      .select('event_date, created_at, event_type, from_status, to_status, notes, units(serial_number, sport_id, sports(name)), athlete_name')
      .eq('units.sport_id', sportId)
      .eq('event_type', 'status_changed')
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_date', { ascending: false })

    const { data, error: err } = await query
    if (err) { setError(err.message); setLoading(false); return }

    let out = (data || [])
      .filter(e => e.units?.sport_id === sportId)
      .map(e => ({
        event_date:     e.event_date,
        logged_date:    e.created_at?.split('T')[0],
        serial_number:  e.units?.serial_number,
        athlete:        e.athlete_name ?? '—',
        from_status:    e.from_status?.replace(/_/g, ' ') ?? '—',
        to_status:      e.to_status?.replace(/_/g, ' ') ?? '—',
        notes:          e.notes ?? '—',
      }))

    if (statusFilter !== 'all') {
      out = out.filter(r => r.to_status === statusFilter.replace(/_/g, ' '))
    }

    setRows(out)
    setLoading(false)
  }

  return (
    <ReportCard
      number="4"
      title="Status change activity"
      sub="How many times unit statuses changed this season — volume and frequency"
    >
      <FilterRow>
        <FilterField label="Sport">
          <select value={sportId} onChange={e => setSportId(e.target.value)} className={inputClass}>
            <option value="">— Select sport —</option>
            {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status changed to">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}>
            <option value="all">Any status change</option>
            <option value="broken_with_sport">Broken — with sport</option>
            <option value="broken_with_dept">Broken — with dept</option>
            <option value="at_playerdata">At PlayerData</option>
            <option value="lost">Lost</option>
          </select>
        </FilterField>
        <FilterField label="From">
          <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
        </FilterField>
        <FilterField label="To">
          <input type="date" value={endDate} min={startDate} max={today()} onChange={e => setEndDate(e.target.value)} className={inputClass} />
        </FilterField>
        <FilterField label=" ">
          <ExportButton
            onClick={async () => { await generate() }}
            loading={loading}
            count={rows?.length ?? null}
          />
        </FilterField>
      </FilterRow>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {rows && (
        <>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-900">{rows.length}</span> status changes in this period
          </p>
          <PreviewTable rows={rows} />
          <button
            onClick={() => downloadCSV(rows, `status_activity_${sports.find(s=>s.id===sportId)?.name}_${startDate}_${endDate}.csv`)}
            className="text-xs text-[#0057B8] underline"
          >
            Download {rows.length} rows as CSV
          </button>
        </>
      )}
    </ReportCard>
  )
}

// ── Main page ───────────────────────────────────────────────
export default function GenerateReport() {
  const { sports } = useOutletContext()

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-[#0057B8] mb-1">Reports</p>
        <h1 className="text-2xl font-medium text-gray-900">Generate Report</h1>
        <p className="text-sm text-gray-400 mt-1">
          Select a report, set your filters, and download as CSV
        </p>
      </div>

      <SportSnapshot sports={sports} />
      <UnitHistory sports={sports} />
      <AthleteChanges sports={sports} />
      <StatusActivity sports={sports} />
    </div>
  )
}